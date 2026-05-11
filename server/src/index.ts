import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import {
  getAccessToken,
  getCachedExpiry,
  SpotifyAuthError,
  SpotifyConfigError,
} from "./spotify.js";
import {
  fetchPlaylistTracks,
  parsePlaylistId,
  PlaylistAccessError,
  PlaylistNotFoundError,
  PlaylistRefError,
  SpotifyApiError,
} from "./playlist.js";

const app = new Hono();

// Liveness check — Railway hits this. Stays green even if Spotify creds
// aren't configured yet.
app.get("/health", (c) => c.json({ ok: true, service: "trackport-server" }));

// Iteration 1: proves the Client Credentials round-trip works without
// exposing the token itself. Kept as a debugging surface.
app.get("/spotify/ping", async (c) => {
  try {
    await getAccessToken();
    const expiresAt = getCachedExpiry();
    return c.json({
      ok: true,
      tokenAcquired: true,
      expiresAt,
      expiresInSeconds:
        expiresAt != null ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : null,
    });
  } catch (err) {
    return handleSpotifyError(c, err);
  }
});

// Iteration 2: playlist track list, normalized to metadata only.
// Accepts ?ref=<url|uri|id>. Returns { ok, playlistId, trackCount, tracks }.
app.get("/spotify/playlist", async (c) => {
  const ref = c.req.query("ref");
  if (!ref) {
    return c.json(
      {
        ok: false,
        error: "missing_ref",
        message: "Provide ?ref=<spotify playlist URL, URI, or ID>",
      },
      400,
    );
  }

  const playlistId = parsePlaylistId(ref);
  if (!playlistId) {
    return c.json(
      {
        ok: false,
        error: "invalid_ref",
        message: "Couldn't extract a Spotify playlist ID from that reference",
      },
      400,
    );
  }

  try {
    const tracks = await fetchPlaylistTracks(playlistId);
    return c.json({
      ok: true,
      playlistId,
      trackCount: tracks.length,
      tracks,
    });
  } catch (err) {
    if (err instanceof PlaylistNotFoundError) {
      return c.json({ ok: false, error: "not_found", playlistId, message: err.message }, 404);
    }
    if (err instanceof PlaylistAccessError) {
      return c.json({ ok: false, error: "access_denied", playlistId, message: err.message }, 403);
    }
    if (err instanceof PlaylistRefError) {
      return c.json({ ok: false, error: "invalid_ref", playlistId, message: err.message }, 400);
    }
    return handleSpotifyError(c, err);
  }
});

function handleSpotifyError(c: Context, err: unknown): Response {
  if (err instanceof SpotifyConfigError) {
    return c.json({ ok: false, error: "config", message: err.message }, 500);
  }
  if (err instanceof SpotifyAuthError) {
    return c.json(
      {
        ok: false,
        error: "spotify_auth",
        status: err.status,
        message: "Spotify rejected the credentials",
      },
      502,
    );
  }
  if (err instanceof SpotifyApiError) {
    return c.json(
      { ok: false, error: "spotify_api", status: err.status, message: err.message },
      502,
    );
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return c.json({ ok: false, error: "unknown", message }, 500);
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, ({ port: bound }) => {
  // eslint-disable-next-line no-console
  console.log(`trackport-server listening on :${bound}`);
});
