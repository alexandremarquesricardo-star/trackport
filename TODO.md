# TrackPort — TODO

> Living plan. Update as iterations land.
> Last updated: 2026-05-11

---

## Where we are

**Status:** v0.1.0 shipped — Win NSIS + Mac universal DMG live on GitHub Releases, trackport.app download buttons auto-fill from the GitHub API. 40 commits on `main`. **Spotify matcher arc 4/4 + Path B (PKCE pivot) + Path C (paste-list fallback) complete and verified end-to-end.** PKCE auth round-trips cleanly. The matcher's Spotify URL path is silently gated by Spotify Premium on the developer's account (`iamricardojam`) — every playlist endpoint returns 403 without it, including the dev's own playlists. **Decision: don't subscribe.** Ship the wall, let the in-app diagnostic surface Spotify's exact reason, point users at the Paste-track-list mode as the no-friction working path. See [memory: Spotify Premium gate](../../C:/Users/rimarques/.claude/projects/d--VisualStudioCode-TrackPort/memory/project_spotify_premium_gate.md).

The 3-tap thesis is real and reduces to ~2 taps when a library is set:
**pick device → tap Sync library → tap Copy.**

### Shipped

| #   | Commit                | What landed                                                                      |
| --- | --------------------- | -------------------------------------------------------------------------------- |
| 1   | `a28a27b`             | Project scaffold (Electron + React + TS + Vite)                                  |
| 2   | `0305eca`             | USB device detection (drivelist + IPC + live UI)                                 |
| 3   | `ae4e6a4`             | Removal-bug fix + "soon" badge                                                   |
| 4   | `4d49e36`             | Sync vertical slice (folder picker → preflight → copy with progress)             |
| 5   | `d28b415`             | Device profiles (filter unsupported formats per device)                          |
| 6   | `84cb8ba`             | **Order preservation for Shokz / transmission-time devices** (wedge)             |
| 7   | `f088890`             | Profile persistence (per-device choice across launches)                          |
| 8   | `2c74eea`             | Smart fit (two strategies that turn oversize plans into copyable ones)           |
| 9   | `500314d` + `afbb80c` | GitHub Actions CI                                                                |
| 10  | `86bb92e`             | Library import (persistent music root)                                           |
| 11  | `7d874fd`             | Per-file copy-error recovery                                                     |
| 12  | `788bdc0`             | App icon + window chrome polish (mark + multi-res ico/png + header tighten-up)   |
| 13  | `cfb28b2`             | Cached library index — mtime-based incremental scan, planner reads cached tracks |
| 14  | `1972cc2`             | ESLint + Prettier in CI (flat config, format check, lint gate)                   |
| 15  | `2625b94`             | "Clear device first" toggle — wipe phase before copy, default ON for Shokz       |
| 16  | `1c8ff40`             | Per-strategy fit-drop preview — see what gets cut before applying a fit          |
| 17  | `c479667`             | Modal a11y + keyboard shortcuts (Esc/Enter/focus trap) + global error boundary   |
| 18  | `9147196`             | Vitest test infrastructure + first 21 tests on fit / sort, gated in CI           |
| 19  | `0726063`             | Window state persistence — save bounds + maximized, validate against displays    |
| 20  | `b76a59e`             | Drag-and-drop a folder onto the window to set / replace the library              |
| 21  | `75235b3`             | Scanner test suite — 15 tests with temp-dir fixtures, cache-hit identity check   |
| 22  | `61872e3`             | Native app menu — proper Mac app menu, About panel, no more "Electron"           |
| 23  | `5cb1868`             | Clickable paths — library root + device mount open in OS file manager            |
| 24  | `03d112a`             | Windows distribution polish — LICENSE, publisher, NSIS license, signing-ready    |
| 25  | `aba2813`             | Auto-update runtime — electron-updater, top banner with download / restart flow  |
| 26  | `91b2306`             | Release CI — tag-triggered Windows installer build, draft GitHub Release upload  |
| 27  | `e5cd26a`             | macOS release CI — parallel macos-latest job, signing + notarization-ready       |
| 28  | `9d6de8f`             | Spotify token broker on Railway + landing site `trackport.app`                   |
| 29  | `43fd0be`             | Spotify `/spotify/playlist` endpoint — parse ref, paginate, normalize tracks     |
| 30  | `0ebe629`             | SEO pass — OG, Twitter Card, JSON-LD SoftwareApplication, robots, sitemap        |
| 31  | `15f1268`             | CI: pin Python 3.11 so node-gyp postinstall survives                             |
| 32  | `8d7b6bb`             | CI: run electron-vite build before electron-builder                              |
| 33  | `c34f37e`             | CI: unset empty signing env vars so unsigned builds succeed                      |
| 34  | `5a7e020`             | Mac: ship a single universal DMG instead of two arch-specific ones               |
| 35  | `fbf9568`             | Library: match Spotify playlist against the local index (matcher + IPC + tests)  |
| 36  | `70daaee`             | Paste-a-Spotify-playlist dialog — UI wired to the matcher                        |
| 37  | `ac3b254`             | Switch to PKCE OAuth (user accounts) — broker no longer required for matching    |
| 38  | `9a3c4d7`             | Paste-a-track-list mode — auth-free fallback (12 parser tests)                   |
| 39  | `8c7df10`             | TODO bookkeeping for paths B+C                                                   |
| 40  | `5fa9a63`             | Spotify API errors now surface Spotify's actual response body (saved €132/yr)    |

### What works today

- Detects removable USB devices live (add / remove)
- Recognizes Shokz OpenSwim Pro / OpenSwim / FINIS Duo / generic USB profiles, plus an MP3-only profile
- Filters formats per device profile
- Sorts tracks naturally (`01 / 02 / 10`, not `01 / 10 / 02`)
- Preserves playback order on Shokz via fsync + 150 ms inter-file delay
- Smart-fits oversize plans (first-fit / drop-largest)
- Remembers per-device profile + library root across launches
- Continues past per-file copy errors, surfaces them in the done state
- Spotify matcher with two input modes:
  - **Spotify URL mode** — connect once via PKCE OAuth (user logs in with
    their own account in the system browser), then paste any playlist
    URL/URI/ID. Reaches private playlists, Liked Songs, anything the user
    can see in Spotify. Refresh token persisted via OS keychain
    (Electron safeStorage). No client secret in the desktop binary —
    PKCE design.
  - **Paste track list mode** — flat text input, no Spotify connection
    needed. Accepts `Artist - Title`, `Title by Artist`, numbered lists,
    em/en-dash, tab-separated, markdown bullets, bare titles. Useful for
    Reddit posts, emails, recommendations from non-Spotify sources.
- Pure filename-based fuzzy matcher (token-set ratio over normalized title
  - artist, threshold 0.78) running locally against the cached library
    index. Returns `{ matched, missing }` with best-near-miss hints. No ID3
    parsing required — pattern-recognises `Artist - Title.mp3` flat
    layouts and `Artist/Album/NN - Title.mp3` nested ones
- Caches the library track index (paths + sizes + mtimes) and reuses it on
  every sync — only re-stats files in directories whose mtime moved
- "Clear device first" toggle in preflight, default ON for transmission-time
  devices so leftover files don't break order preservation
- Per-strategy "what would be dropped" preview on each fit suggestion
- Sync dialog has full keyboard a11y (Esc dismiss, Enter primary, Tab trap,
  initial primary focus, focus restored to trigger on close)
- Top-level React error boundary recovers a renderer crash with a Reload action
  instead of a black window
- Vitest unit tests covering the smart-fit logic, natural-sort behaviour,
  window-bounds validation, the incremental library scanner, the
  auto-update state reducer, the Spotify matcher core, the PKCE helpers,
  and the paste-list parser (106 tests total, including filesystem-fixture
  tests for the dir-mtime cache hit path)
- Window state (size, position, maximized) persists across launches; saved
  bounds get validated against the current monitor layout so an unplugged
  display can't strand the window off-screen
- Drag a music folder onto the window to set / replace the library; non-
  folder drops are rejected with a soft inline note instead of a crash
- Native menu bar with proper "TrackPort" app menu on macOS (About / Hide /
  Quit), standard Edit/View/Window items, About panel populated; menu stays
  auto-hidden on Win/Linux to keep the focused-tool aesthetic
- Library root and device mount paths are clickable — opens the folder in
  Explorer / Finder / Files for quick spelunking
- Auto-update via electron-updater: checks GitHub Releases on launch
  (after a 5s delay), surfaces a top banner with Download / Restart-now
  flow; pure-state-machine reducer is unit-tested
- Tag-triggered release CI builds parallel Windows NSIS installer +
  macOS universal DMG (arm64+x64), each with auto-update sidecars,
  uploaded to a draft GitHub Release; signing + Apple notarization
  engage automatically when the relevant secrets are configured
- CI typechecks, lints, format-checks, tests, and builds on every push to main / PR

---

## Next up (in order of leverage)

### 1. Spotify metadata-only matcher (multi-iteration arc)

The remaining big wedge feature. Will need:

- Spotify Developer app (client ID / secret) — register at developer.spotify.com
- Hono backend on Railway holding the secret + brokering token requests
- New IPC: `library.matchAgainstSpotify(playlistUrl)` → returns `{ matched, missing }`
- UI: paste playlist URL → list comes back with each track marked matched/missing
- "Mark for purchase" / "Skip" actions on missing tracks
- Hard rail: metadata only, no audio extraction (already in the README)

Roughly 3-4 iterations:

1. ✅ **Backend skeleton on Railway + auth round-trip** — `server/` directory:
   Hono on Node, `/health` + `/spotify/ping`, Client Credentials token broker
   with in-memory cache + concurrent-refresh de-dupe. Live at
   <https://trackport-server-production.up.railway.app>; `/spotify/ping`
   returns a fresh 1-hour token through the broker. **TODO:** rotate the
   Client Secret (it was pasted into chat during setup).
2. ✅ **Playlist track list endpoint** — `GET /spotify/playlist?ref=…` accepts
   a Spotify URL / URI / raw ID, paginates `/v1/playlists/{id}/tracks` (uses
   the `fields` param to keep responses ~10x smaller than default), retries
   once on 429 with `Retry-After`, filters out null tracks (removed from
   playlist) and podcast items, returns normalized
   `{ spotifyId, title, artist, artists[], album, isrc, durationMs }[]`.
   Error responses use HTTP status codes that mirror Spotify's: 404 not*found,
   403 access_denied, 502 spotify*\*, 400 invalid_ref. Hard cap at 10 000
   tracks (Spotify's own playlist limit). Implemented in
   [`server/src/playlist.ts`](server/src/playlist.ts).
3. ✅ **Local library matcher** — `src/shared/match.ts` is the pure logic
   (normalize → token-set ratio → score with title weight 0.75, artist 0.25
   → threshold 0.78). `src/main/library/match-runner.ts` orchestrates the
   broker call (30s AbortController timeout) and feeds the cached library
   index into the matcher. New IPC channel `library:match-against-spotify`
   wired through `LibraryApi.matchAgainstSpotify(playlistRef)`. Returns a
   discriminated `MatchOutcome` (`{ ok, code, message }` for failures,
   `{ ok, result: { matched, missing, totalSpotifyTracks, totalLibraryTracks } }`
   for success) so the renderer can branch on `code` without relying on
   Electron preserving error subclasses. 32 new unit tests covering
   normalization edge cases (diacritics, parenthetical noise, featuring
   suffixes, smart quotes), parsing (flat vs nested layouts, em/en-dash
   separators, track-number prefixes), scoring under common drift, and
   end-to-end match against a small library.
4. ✅ **UI integration** — `useSpotifyMatch` hook (closed → idle → loading
   → results | error) plus `SpotifyMatchDialog` component. Entry point is
   a "Check Spotify playlist…" accent button in the library section (only
   when a library is set). Results show summary headline, missing list
   (open by default, with score-gated "did you mean?" hints to
   `bestCandidate` ≥ 0.5), and matched list (closed by default, with
   reveal-in-file-manager links). Errors map `MatchErrorCode` →
   human-readable titles, broker's message shown verbatim underneath.
   Same modal patterns as `SyncDialog` — backdrop, focus trap via
   `useDialogShortcuts`, aria-live for the loading state. The whole
   matcher arc now closes from "paste a URL" all the way to "see what's
   matched"; only the act-on-matches piece is left, and that's a
   separate concern (planner needs to accept a curated file list).

### 2. ✅ Download website at trackport.app

Static landing page in `site/` (HTML/CSS/vanilla JS, no build step). Detects
the visitor's OS, fetches `/releases/latest` from the GitHub API, sets the
right download asset URL, falls back to the GitHub releases page if the API
is unreachable. Hosted on Cloudflare Pages (auto-deploys from `main`),
custom domain `trackport.app` attached with SSL active. `www.trackport.app`
also wired (apex + www both resolve).

---

## Open follow-ups (next session — pick up here tomorrow)

### Smoke-test what we shipped

The PKCE auth flow + diagnostic surfacing were verified end-to-end this
session (the diagnostic revealed the Premium gate — that's the proof both
worked). Still untested under real conditions:

- ✅ PKCE login → browser callback → token storage → reconnection across
  app restarts
- ✅ Spotify URL mode → 403 with `Premium required` (working as designed
  given the gate)
- ⏳ **Paste track list mode end-to-end** — never tested. The matcher core
  has 106 unit tests, but the UI path (tab switch → textarea → match →
  results render) hasn't been exercised. Pick a few tracks from the local
  library, paste them in, confirm matched count > 0. This is the actual
  user-facing wedge feature given the Premium gate.
- ⏳ Auth persistence smoke — kill TrackPort after connecting, relaunch,
  confirm it's still "connected" without a fresh login. Tests the
  `safeStorage`-encrypted refresh-token path.

### Wire `VITE_SPOTIFY_CLIENT_ID` into release CI

Required before tagging v0.1.1 if we want URL mode to work in shipped
builds. Without this, packaged binaries have the placeholder client ID
and Connect Spotify errors immediately.

1. Repo Settings → Secrets and variables → Actions → New secret:
   `VITE_SPOTIFY_CLIENT_ID` with the value from `.env.local`.
2. Edit `.github/workflows/release.yml` — in both the Windows and macOS
   jobs, add to the `Bundle app (electron-vite)` step's `env:` block:
   ```yaml
   env:
     VITE_SPOTIFY_CLIENT_ID: ${{ secrets.VITE_SPOTIFY_CLIENT_ID }}
   ```
3. Same env injection on the `Build + publish` step is harmless and
   guards against electron-vite reading env at the wrong stage.

### Tag v0.1.1

Ships everything since v0.1.0:

- Universal macOS DMG (commit `5a7e020`) — fixes the Intel-Mac arch
  mismatch from v0.1.0 splitting into arm64+x64
- Full Spotify matcher arc (commits `fbf9568`, `70daaee`, `ac3b254`,
  `9a3c4d7`) — PKCE OAuth + paste-track-list mode
- Spotify API error diagnostic (commit `5fa9a63`) — surfaces Premium
  gate / scope issues / etc. to the user

Sequence: smoke-test → wire CLIENT_ID secret → `git tag v0.1.1 && git push origin v0.1.1`.

### Retire the Railway broker

After v0.1.1 ships and the rollback path is no longer needed, delete the
`server/` directory + the Railway service. Saves €5/mo. The desktop app
calls Spotify directly via PKCE — broker has zero readers.

Move "Rotate Spotify Client Secret" off the list — secret rotation
becomes irrelevant once the broker (which holds it) is retired.

### "Pick from your Spotify playlists" dropdown — IF we re-enable URL mode

Only meaningful once Spotify URL mode actually works (Premium gate
removed). On hold pending that decision.

---

## Open follow-ups (other items, lower priority)

### Cut first published release v0.1.0

The release workflow is wired but no tag has been pushed yet, so
`/releases/latest` returns 404 and the site's download buttons fall back
to the all-releases page. Steps:

```sh
git tag v0.1.0
git push origin v0.1.0
```

That triggers `.github/workflows/release.yml` — Win + Mac jobs build in
parallel (~10 min), upload installers + auto-update sidecars to a draft
Release. Then on github.com → Releases → Edit the draft → "Generate
release notes" → "Publish release". The moment it's published (not draft),
trackport.app's download buttons auto-fill with direct asset URLs.

### Rotate Spotify Client Secret

The current secret was pasted into chat during Railway setup, so it sits
in the conversation transcript. Rotate before the project sees real users:

1. Spotify Dashboard → trackport app → Settings → "Rotate client secret"
2. Copy the new secret
3. From `server/`, run:
   ```sh
   railway variables --set "SPOTIFY_CLIENT_SECRET=<new-secret>"
   ```
4. Railway redeploys automatically. Verify with
   `curl https://trackport-server-production.up.railway.app/spotify/ping`
   (should still return `tokenAcquired: true`).

### SEO + discoverability pass for trackport.app — partially done

The on-page metadata is in. What's still external:

- ✅ Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`,
  `og:type`, `og:site_name`)
- ✅ Twitter Card tags (`summary`, not `summary_large_image` — `icon.png` is
  square. Revisit when a 1200x630 card image exists.)
- ✅ JSON-LD `SoftwareApplication` schema with `applicationCategory`,
  `operatingSystem`, `softwareVersion`, `offers.price: "0"`, MIT license.
- ✅ `<link rel="canonical">` → `https://trackport.app/`
- ✅ `site/robots.txt` allowing all crawlers, pointing at the sitemap
- ✅ `site/sitemap.xml` with the single canonical URL
- ⏳ Submit to Google Search Console (verify via DNS TXT record at Cloudflare,
  since the domain is there) and Bing Webmaster Tools
- ⏳ Design a proper 1200x630 OG card image (replaces `icon.png` as
  `og:image`/`twitter:image`; promotes Twitter Card to `summary_large_image`)
- ⏳ Run Lighthouse on the deployed site, fix anything red. Specifically watch
  for: image dimensions on `icon.png`, font swap, contrast ratios

Target: Lighthouse SEO score 100, perf >95.

### Monetization — documented decisions

**Tier model (already agreed):** desktop app free forever, optional Plus
tier for cloud-backed features (Spotify matching first). Don't pick the
Plus price until the matcher has shipped and seen real usage.

**No AdSense / display ads on the website. Ever.** Three reasons:

1. The site copy promises "no telemetry"; AdSense is third-party tracking.
2. Math is terrible at this scale — $0.30–15/month while torching trust.
3. EU cookie-consent banners would gate the download button.

**Affiliate links to compatible devices:** OK to revisit _after_ ~1000
monthly visitors. A "Compatible: Shokz OpenSwim, FINIS Duo" footer block
with Amazon Associates URLs is contextually helpful, not spammy. Until
then, just a GitHub Sponsors / "Buy me a coffee" footer link is fine
(low pressure, no tracking).

---

## Parking lot (good ideas, not now)

- **Retire the Railway broker** — the matcher no longer needs it after
  the PKCE pivot. Saves ~$5/mo. Keep it running until the universal-DMG
  v0.1.1 ships so the rollback path stays simple; remove after that.
- **"Pick from your Spotify playlists" dropdown** — now that we have a
  user token, we can call `/v1/me/playlists` and `/v1/me/tracks`. Let
  the user pick from a dropdown instead of having to paste a URL.
  Closes the loop on the wedge use case "match my Liked Songs."
- **Sync matched-Spotify tracks to device** — wire the matcher's
  `matched` list into the sync planner. Needs `buildPlan` to accept a
  curated file list as an alternative to a `sourceFolder`. Closes the
  loop on the wedge: paste playlist URL → confirm matches → copy to
  device, all in one flow.
- **Apply for Spotify Extended Quota** — once the app has a clearer
  public face, submit to lift the 25-user Development-mode allowlist.
  Until approved, only allowlisted users can complete the PKCE flow.
- Multi-root libraries (`~/Music` + external drive)
- Drag-to-reorder in preflight (manual override of natural sort)
- Sort by ID3 track number / album metadata
- Re-encode FLAC/WAV → MP3 at sync time (needs ffmpeg sidecar, license-aware)
- Manual track exclusion in preflight (uncheck individual files)
- Mobile companion (React Native or PWA) for "plan on phone, execute on desktop" hand-off
- Device-side cleanup ("delete tracks no longer in library")

---

## Release setup (when ready to sign / notarize)

The release workflow is fully wired and ships unsigned binaries today. To remove the SmartScreen warning on Windows and the Gatekeeper warning on macOS, configure the GitHub Actions secrets below. Each is independent — partial setup just means the corresponding signing step no-ops.

### What to obtain first

| Secret                        | What it is                                                                                                                        | Cost / time                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `WIN_CSC_LINK`                | Authenticode `.pfx` from a Microsoft-trusted CA (DigiCert, Sectigo, SSL.com)                                                      | ~$200–500/yr; CA provisioning takes 1–7 days                      |
| `WIN_CSC_KEY_PASSWORD`        | Password for the `.pfx`                                                                                                           | —                                                                 |
| `MAC_CSC_LINK`                | Apple Developer ID Application cert (created at developer.apple.com → Certificates, then exported from Keychain Access as `.p12`) | $99/yr Apple Developer Program; cert itself is free once enrolled |
| `MAC_CSC_KEY_PASSWORD`        | Password for the `.p12`                                                                                                           | —                                                                 |
| `APPLE_ID`                    | Developer-program-enrolled Apple ID email                                                                                         | Free                                                              |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at appleid.apple.com → Sign-In and Security → App-Specific Passwords                              | Free, 1 minute                                                    |
| `APPLE_TEAM_ID`               | 10-char team ID at developer.apple.com/account → Membership                                                                       | Free, visible immediately after enrollment                        |

### CLI commands (PowerShell, run from repo root)

Requires `gh` authenticated (`gh auth login` once). `gh secret set <NAME>` with no `--body` opens a hidden prompt — paste the value. Values never hit disk and never appear in shell history.

```powershell
# Text secrets (passwords and IDs) — prompts hide the input
gh secret set WIN_CSC_KEY_PASSWORD
gh secret set MAC_CSC_KEY_PASSWORD
gh secret set APPLE_ID
gh secret set APPLE_APP_SPECIFIC_PASSWORD
gh secret set APPLE_TEAM_ID

# Binary cert secrets — base64-encode the cert files first
$pfx = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\trackport.pfx"))
$pfx | gh secret set WIN_CSC_LINK

$p12 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\trackport.p12"))
$p12 | gh secret set MAC_CSC_LINK

# Verify
gh secret list
```

### Incremental rollout strategy

You don't have to configure everything at once. Three useful states, each strictly better than the last for end-user experience:

1. **Nothing configured** — both jobs build unsigned. Releases work, auto-update works, users see SmartScreen / Gatekeeper warnings on first install.
2. **Apple secrets only** ($99/yr) — macOS DMG signs + notarizes; no Gatekeeper warning. Windows still triggers SmartScreen.
3. **Everything configured** ($299–599/yr) — both platforms ship clean.

The cheapest first move that makes a real user-visible difference is the $99 Apple fee + the four Apple secrets. Authenticode certs are 5–10× the cost for a similar outcome — defer until Windows distribution scale justifies it.

---

## Resume hints

```sh
npm install         # postinstall rebuilds drivelist for Electron's ABI
npm run dev         # launches the app with live reload on Windows / macOS / Linux
npm run build       # typecheck + production bundle
npm run dist:win    # NSIS installer
npm run dist:mac    # DMG (universal)
npm run dist:linux  # AppImage
```

Persistent state lives at:

- Windows: `%APPDATA%\TrackPort\preferences.json` + `library.json`
- macOS: `~/Library/Application Support/TrackPort/...`
- Linux: `~/.config/TrackPort/...`

Known gotcha: VS Code's integrated terminal exports `ELECTRON_RUN_AS_NODE=1` which makes Electron boot as plain Node and crash immediately. The launcher `scripts/electron-vite.cjs` deletes the var before spawning — don't bypass it.
