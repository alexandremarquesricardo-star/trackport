# trackport-server

Token broker for the Spotify Web API. Lives between the TrackPort desktop app
and Spotify so the **client secret never ships to end users**.

Current scope: token broker + playlist track fetcher. The matcher itself
runs in the desktop app against the cached library index.

## Endpoints

| Method | Path                      | What it does                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------- |
| GET    | `/health`                 | Liveness check. Returns `{ ok: true }` without touching Spotify            |
| GET    | `/spotify/ping`           | Forces a token fetch (or cache hit) and reports back the expiry            |
| GET    | `/spotify/playlist?ref=…` | Returns the playlist's tracks, normalized to artist / title / album / ISRC |

`/spotify/ping` deliberately never returns the access token itself — it just
reports whether the round-trip succeeded.

### `/spotify/playlist?ref=…`

The `ref` query parameter accepts any of:

- web URL — `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=…`
- localised URL — `https://open.spotify.com/intl-pt/playlist/37i9dQZF1DXcBWIGoYBM5M`
- URI — `spotify:playlist:37i9dQZF1DXcBWIGoYBM5M`
- raw ID — `37i9dQZF1DXcBWIGoYBM5M`

Successful response:

```json
{
  "ok": true,
  "playlistId": "37i9dQZF1DXcBWIGoYBM5M",
  "trackCount": 50,
  "tracks": [
    {
      "spotifyId": "0VjIjW4GlUZAMYd2vXMi3b",
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "artists": ["The Weeknd"],
      "album": "After Hours",
      "isrc": "USUG11904206",
      "durationMs": 200040
    }
  ]
}
```

Error responses (HTTP status reflects the failure mode):

| Status | `error`         | Meaning                                                         |
| ------ | --------------- | --------------------------------------------------------------- |
| 400    | `missing_ref`   | No `ref` query parameter                                        |
| 400    | `invalid_ref`   | `ref` couldn't be parsed into a playlist ID                     |
| 403    | `access_denied` | Playlist is private / region-locked for the broker token        |
| 404    | `not_found`     | Playlist ID looks valid but Spotify returned 404                |
| 502    | `spotify_*`     | Spotify rejected the broker or returned an unexpected status    |
| 500    | `config`        | Broker is missing `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` |

Only metadata is returned. **No audio URLs, no preview streams.** Tracks that
were deleted from the playlist (`item.track === null`) and non-music items
(podcast episodes) are filtered out. Pagination follows Spotify's `next` link
up to a 10 000-track safety cap (Spotify's hard playlist limit).

## Local development

1. Register a Spotify app at <https://developer.spotify.com/dashboard>.
   - Note the **Client ID** and **Client Secret**.
   - No redirect URI is needed; Client Credentials flow doesn't use one.
2. Copy env template and fill in credentials:
   ```sh
   cp .env.example .env
   # edit .env
   ```
3. Install + run:
   ```sh
   npm install
   npm run dev
   ```
4. Verify:
   - <http://localhost:3000/health> → `{ "ok": true, "service": "trackport-server" }`
   - <http://localhost:3000/spotify/ping> → `{ "ok": true, "tokenAcquired": true, ... }`

## Deploy to Railway

1. Push this repo to GitHub (already there).
2. Go to <https://railway.com/new>, **Deploy from GitHub repo** → select the
   TrackPort repo.
3. In the service's **Settings → Source**:
   - Set **Root Directory** to `server`.
   - Railway will auto-detect Node and use `railway.json` for build/start.
4. In **Variables**, add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
   Don't set `PORT` — Railway injects it automatically.
5. **Settings → Networking → Generate Domain**. You'll get something like
   `trackport-server-production.up.railway.app`.
6. Verify the public domain:
   - `https://<your-domain>/health`
   - `https://<your-domain>/spotify/ping`

## Security model

- Spotify client secret lives only in Railway environment variables.
- Desktop app never sees the secret or any access token — it only calls
  this broker, which proxies authenticated requests to Spotify.
- We use **Client Credentials** (not Authorization Code), which limits the
  surface to public catalog data. Exactly what TrackPort needs for
  metadata-only matching, with no risk of accessing user accounts.
- Tokens are cached in-memory with a 60-second safety margin before expiry,
  and concurrent refreshes are de-duplicated to keep rate-limit pressure low.
