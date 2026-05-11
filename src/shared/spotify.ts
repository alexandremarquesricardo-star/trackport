/**
 * Shared Spotify integration constants + types.
 *
 * Auth model: Authorization Code with PKCE (no client secret). The Client ID
 * is a public value — Spotify treats it as such, and we deliberately ship it
 * baked into the binary. The auth flow's security comes from the PKCE
 * verifier, not from hiding the client ID.
 *
 * Spotify "Development mode" caveat: a freshly-created Spotify app can only
 * authenticate users on its test-user allowlist (max 25). To onboard
 * arbitrary users, the app must be promoted to "Extended Quota mode" via
 * the developer dashboard's approval flow. For TrackPort's current scale,
 * Development mode is fine — add early users to the allowlist manually.
 */

/**
 * Spotify Client ID for the trackport app. Public value — PKCE design
 * treats it as such — so it's fine baked into the binary.
 *
 * Sourced from the `VITE_SPOTIFY_CLIENT_ID` env var at build time
 * (electron-vite's static replacement). Put it in `.env.local` for dev,
 * or set it as a GitHub Actions secret for release builds. Falls back to
 * the placeholder string when unset; the auth controller refuses to
 * start the flow with the placeholder and surfaces a clean error.
 *
 * Find your client ID at <https://developer.spotify.com/dashboard>.
 */
export const SPOTIFY_CLIENT_ID: string =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "REPLACE_WITH_SPOTIFY_CLIENT_ID";

/**
 * Port the desktop app listens on for the OAuth redirect. Must be registered
 * verbatim in the Spotify app's "Redirect URIs" list as
 * `http://127.0.0.1:13738/callback`. Spotify allows http:// only for the
 * 127.0.0.1 loopback host — IPv4 specifically, not `localhost`.
 *
 * If this port collides on a user's machine, the auth flow will fail with
 * a clear error. We could fall back to a port range, but registering more
 * than one redirect URI per app is fine if needed.
 */
export const SPOTIFY_REDIRECT_PORT = 13738;

export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/callback`;

/** Scopes requested. Read-only — TrackPort never writes to Spotify. */
export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
] as const;

/**
 * Auth state surfaced to the renderer. Three terminal states; transient
 * states (mid-flow) live only inside the main process.
 */
export type SpotifyAuthState =
  | { phase: "disconnected" }
  | { phase: "authenticating" }
  | { phase: "connected"; expiresAt: number }
  | { phase: "error"; message: string };

export interface SpotifyAuthApi {
  /** Current auth status. */
  getState: () => Promise<SpotifyAuthState>;
  /**
   * Start the OAuth flow. Opens the system browser to Spotify's authorize
   * page and waits for the callback. Resolves to the post-flow state.
   * Rejects only on programmer error — user denials / timeouts surface as
   * `{ phase: "error" }`.
   */
  connect: () => Promise<SpotifyAuthState>;
  /** Forget the stored refresh token. */
  disconnect: () => Promise<void>;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange: (cb: (state: SpotifyAuthState) => void) => () => void;
}
