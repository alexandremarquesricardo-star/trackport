// Spotify Client Credentials token broker.
//
// We hold the client secret server-side and exchange it for a short-lived
// access token using the Client Credentials flow. That flow gives access to
// public catalog data (playlists, tracks) — exactly what TrackPort needs for
// metadata-only matching, with no user OAuth required.
//
// Tokens are valid for 1 hour. We cache in memory and refresh proactively
// 60 seconds before expiry so an in-flight request never races a stale token.

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const REFRESH_SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

let cached: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

export class SpotifyConfigError extends Error {
  constructor() {
    super("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in the environment");
    this.name = "SpotifyConfigError";
  }
}

export class SpotifyAuthError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Spotify token request failed (${status}): ${body}`);
    this.name = "SpotifyAuthError";
  }
}

function readCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyConfigError();
  }
  return { clientId, clientSecret };
}

async function fetchFreshToken(): Promise<CachedToken> {
  const { clientId, clientSecret } = readCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SpotifyAuthError(res.status, body.slice(0, 500));
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - REFRESH_SAFETY_MARGIN_MS > now) {
    return cached.accessToken;
  }

  // De-dupe concurrent refreshes so a burst of requests on a cold cache
  // doesn't fire N parallel token exchanges (and waste rate limit).
  if (!inflight) {
    inflight = fetchFreshToken().finally(() => {
      inflight = null;
    });
  }

  cached = await inflight;
  return cached.accessToken;
}

export function getCachedExpiry(): number | null {
  return cached?.expiresAt ?? null;
}
