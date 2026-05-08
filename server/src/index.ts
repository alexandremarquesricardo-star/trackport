import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  getAccessToken,
  getCachedExpiry,
  SpotifyAuthError,
  SpotifyConfigError,
} from "./spotify.js";

const app = new Hono();

// Liveness check — used by Railway's healthcheck. Doesn't touch Spotify, so
// it stays green even if the credentials aren't configured yet.
app.get("/health", (c) => c.json({ ok: true, service: "trackport-server" }));

// Iteration 1 endpoint: proves the Client Credentials round-trip works
// without exposing the access token. Returns a sanitized "yes, we got a
// token" report; the token itself stays inside the broker.
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: "unknown", message }, 500);
  }
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, ({ port: bound }) => {
  // eslint-disable-next-line no-console
  console.log(`trackport-server listening on :${bound}`);
});
