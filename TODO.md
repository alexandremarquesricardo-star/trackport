# TrackPort — TODO

> Living plan. Update as iterations land.
> Last updated: 2026-05-07

---

## Where we are

**Status:** v0.1.0 — local Electron app, 19 commits on `main`, CI green, working end-to-end on Windows.

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
| 18  | _next_                | Vitest test infrastructure + first 21 tests on fit / sort, gated in CI           |

### What works today

- Detects removable USB devices live (add / remove)
- Recognizes Shokz OpenSwim Pro / OpenSwim / FINIS Duo / generic USB profiles, plus an MP3-only profile
- Filters formats per device profile
- Sorts tracks naturally (`01 / 02 / 10`, not `01 / 10 / 02`)
- Preserves playback order on Shokz via fsync + 150 ms inter-file delay
- Smart-fits oversize plans (first-fit / drop-largest)
- Remembers per-device profile + library root across launches
- Continues past per-file copy errors, surfaces them in the done state
- Caches the library track index (paths + sizes + mtimes) and reuses it on
  every sync — only re-stats files in directories whose mtime moved
- "Clear device first" toggle in preflight, default ON for transmission-time
  devices so leftover files don't break order preservation
- Per-strategy "what would be dropped" preview on each fit suggestion
- Sync dialog has full keyboard a11y (Esc dismiss, Enter primary, Tab trap,
  initial primary focus, focus restored to trigger on close)
- Top-level React error boundary recovers a renderer crash with a Reload action
  instead of a black window
- Vitest unit tests covering the smart-fit logic and natural-sort behaviour
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

1. Backend skeleton on Railway + auth round-trip
2. Track list fetch from Spotify URL
3. Local library matcher (artist/title fuzzy match)
4. UI integration in the dialog flow

---

## Parking lot (good ideas, not now)

- Multi-root libraries (`~/Music` + external drive)
- Drag-to-reorder in preflight (manual override of natural sort)
- Sort by ID3 track number / album metadata
- Re-encode FLAC/WAV → MP3 at sync time (needs ffmpeg sidecar, license-aware)
- Manual track exclusion in preflight (uncheck individual files)
- Mobile companion (React Native or PWA) for "plan on phone, execute on desktop" hand-off
- Auto-update channel (electron-updater + GitHub Releases — pairs naturally with code signing)
- Device-side cleanup ("delete tracks no longer in library")

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
