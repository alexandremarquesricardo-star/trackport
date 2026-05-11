/**
 * Spotify OAuth state machine — owns the access token, the refresh token,
 * and the transition between disconnected / authenticating / connected.
 *
 * Why this lives in main and not in the renderer:
 *   - Refresh token is persisted via Electron `safeStorage`; renderer is
 *     sandboxed away from disk + the OS keychain.
 *   - The OAuth callback server has to bind a TCP port (renderer can't).
 *   - `shell.openExternal` (browser launch) is main-process only.
 *
 * Renderer talks to this controller exclusively via IPC. State changes are
 * pushed via the EventEmitter so the UI can render a connected badge
 * without polling.
 */

import { EventEmitter } from "node:events";
import { shell } from "electron";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_PORT,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  type SpotifyAuthState,
} from "../../shared/spotify";
import { AuthStore } from "./auth-store";
import { CallbackServer, CallbackServerError } from "./callback-server";
import { buildAuthorizeUrl, generatePkcePair, generateState } from "./pkce";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const REFRESH_SAFETY_MARGIN_MS = 60_000; // refresh 1 min before Spotify expiry

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

/** Internal richer-than-public state. */
interface InternalState {
  phase: "disconnected" | "authenticating" | "connected" | "error";
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  errorMessage: string | null;
}

const INITIAL: InternalState = {
  phase: "disconnected",
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  errorMessage: null,
};

export class SpotifyAuthController extends EventEmitter {
  private state: InternalState = { ...INITIAL };
  private store = new AuthStore();
  /** Suppresses concurrent refreshes — burst of API calls on a cold token. */
  private refreshInflight: Promise<string> | null = null;

  /**
   * Load any persisted refresh token. Call once at app startup, AFTER
   * `app.whenReady()` (safeStorage needs Electron ready).
   */
  async init(): Promise<void> {
    const stored = await this.store.readRefreshToken();
    if (!stored) {
      this.setState({ ...INITIAL });
      return;
    }
    // We hold the refresh token but defer the access-token exchange until
    // the first API call. Cheaper startup; and if the refresh token has
    // been revoked, we don't fail loudly until the user actually needs it.
    this.setState({
      phase: "connected",
      accessToken: null,
      refreshToken: stored,
      expiresAt: null,
      errorMessage: null,
    });
  }

  publicState(): SpotifyAuthState {
    const s = this.state;
    switch (s.phase) {
      case "disconnected":
        return { phase: "disconnected" };
      case "authenticating":
        return { phase: "authenticating" };
      case "connected":
        return { phase: "connected", expiresAt: s.expiresAt ?? 0 };
      case "error":
        return { phase: "error", message: s.errorMessage ?? "Unknown error" };
    }
  }

  /**
   * Kick off the full OAuth flow. Resolves with the post-flow state.
   * The promise itself never rejects on user-facing failures — those
   * become `{ phase: "error" }`.
   */
  async connect(): Promise<SpotifyAuthState> {
    if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID.startsWith("REPLACE_")) {
      this.setState({
        ...INITIAL,
        phase: "error",
        errorMessage: "Spotify Client ID isn't configured in this build.",
      });
      return this.publicState();
    }

    this.setState({
      phase: "authenticating",
      accessToken: null,
      refreshToken: this.state.refreshToken,
      expiresAt: null,
      errorMessage: null,
    });

    const server = new CallbackServer(SPOTIFY_REDIRECT_PORT);
    try {
      await server.listen();

      const { verifier, challenge } = generatePkcePair();
      const oauthState = generateState();
      const url = buildAuthorizeUrl({
        clientId: SPOTIFY_CLIENT_ID,
        redirectUri: SPOTIFY_REDIRECT_URI,
        scopes: SPOTIFY_SCOPES,
        state: oauthState,
        challenge,
      });

      // Open the system browser AFTER the server is listening, so the
      // redirect can't race the bind. shell.openExternal returns a
      // promise that resolves once the OS hands off — not when the page
      // finishes loading.
      await shell.openExternal(url);

      const callback = await server.awaitCallback();
      if (callback.state !== oauthState) {
        throw new Error("State mismatch — possible CSRF, aborting");
      }

      const tokens = await this.exchangeCodeForTokens(callback.code, verifier);
      if (tokens.refresh_token) {
        await this.store.writeRefreshToken(tokens.refresh_token);
      }
      this.setState({
        phase: "connected",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? this.state.refreshToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        errorMessage: null,
      });
      return this.publicState();
    } catch (err) {
      const message =
        err instanceof CallbackServerError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.setState({
        ...INITIAL,
        // Keep the prior refresh token if the failure was mid-flow; the
        // user might already be authenticated from a previous session.
        refreshToken: this.state.refreshToken,
        phase: this.state.refreshToken ? "connected" : "error",
        errorMessage: this.state.refreshToken ? null : message,
      });
      return this.publicState();
    } finally {
      await server.close();
    }
  }

  /** Clear everything and persist the cleared state. */
  async disconnect(): Promise<void> {
    await this.store.clear();
    this.setState({ ...INITIAL });
  }

  /**
   * Return a valid access token, refreshing if needed. Throws when the
   * caller isn't connected — the renderer-facing IPC translates the
   * throw into a `no_auth` error code.
   */
  async getAccessToken(): Promise<string> {
    if (!this.state.refreshToken) {
      throw new Error("Not connected to Spotify");
    }
    const fresh =
      this.state.accessToken &&
      this.state.expiresAt &&
      this.state.expiresAt - REFRESH_SAFETY_MARGIN_MS > Date.now();
    if (fresh && this.state.accessToken) return this.state.accessToken;

    if (!this.refreshInflight) {
      this.refreshInflight = this.refreshAccessToken().finally(() => {
        this.refreshInflight = null;
      });
    }
    return this.refreshInflight;
  }

  private async refreshAccessToken(): Promise<string> {
    const refresh = this.state.refreshToken;
    if (!refresh) throw new Error("No refresh token");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: SPOTIFY_CLIENT_ID,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      // 400 from the refresh endpoint typically means the refresh token
      // was revoked (user removed the app's access in Spotify settings)
      // or expired. Either way, we're effectively disconnected; bounce
      // the user back to the connect flow.
      const text = await res.text().catch(() => "");
      await this.store.clear();
      this.setState({
        ...INITIAL,
        phase: "error",
        errorMessage: `Spotify rejected the refresh token (HTTP ${res.status}). Please reconnect.`,
      });
      throw new Error(`Refresh failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const tokens = (await res.json()) as TokenResponse;
    // Spotify rotates refresh tokens periodically. If they hand us a new
    // one, persist immediately.
    if (tokens.refresh_token && tokens.refresh_token !== refresh) {
      await this.store.writeRefreshToken(tokens.refresh_token);
    }
    this.setState({
      phase: "connected",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? refresh,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      errorMessage: null,
    });
    return tokens.access_token;
  }

  private async exchangeCodeForTokens(code: string, verifier: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Token exchange failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as TokenResponse;
  }

  private setState(next: InternalState): void {
    this.state = next;
    this.emit("change", this.publicState());
  }
}
