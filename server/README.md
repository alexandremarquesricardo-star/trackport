# trackport-server

Token broker for the Spotify Web API. Lives between the TrackPort desktop app
and Spotify so the **client secret never ships to end users**.

Iteration 1 scope: server skeleton + Spotify Client Credentials auth
round-trip. No playlist or matching endpoints yet.

## Endpoints

| Method | Path            | What it does                                                    |
| ------ | --------------- | --------------------------------------------------------------- |
| GET    | `/health`       | Liveness check. Returns `{ ok: true }` without touching Spotify |
| GET    | `/spotify/ping` | Forces a token fetch (or cache hit) and reports back the expiry |

`/spotify/ping` deliberately never returns the access token itself — it just
reports whether the round-trip succeeded.

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
