# TrackPort

[![CI](https://github.com/alexandremarquesricardo-star/trackport/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alexandremarquesricardo-star/trackport/actions/workflows/ci.yml)

> Get your music from where it lives onto your offline device. Three taps.

TrackPort is a cross-platform tool that bridges your personal audio library to offline playback devices — swim headphones (Shokz OpenSwim, FINIS Duo, H2O Audio), USB MP3 players, and similar gear that needs files on disk rather than streams.

## Why TrackPort

Existing tools fall into one of four buckets, and none solve the actual workflow:

- **Desktop music managers** (MusicBee, MediaMonkey, foobar2000) — playback-first, sync buried, notoriously dense UIs.
- **Mobile local-music players** (Symfonium, Musicolet, VLC) — they play; the workflow ends on the phone.
- **Phone↔PC sync utilities** (doubleTwist, iSyncr) — aging iTunes-era tools.
- **Streaming playlist movers** (Soundiiz, TuneMyMusic) — only move between streaming services; never touch local files or USB devices.

TrackPort is the first app to treat the **transfer event** as a first-class product, not a side feature.

## Hard rails

- No DRM circumvention.
- No extraction from Spotify, Apple Music, or other streaming services.
- Spotify integration is **metadata only** (track lists matched against your local library) via the official Web API.
- Only user-owned and user-provided audio files are handled.

## Stack

- **Desktop:** Electron + React + TypeScript + Vite (electron-vite)
- **Tests:** Vitest (53 tests covering the smart-fit logic, natural-sort, window-bounds validator, the incremental library scanner, and the auto-update state reducer)
- **CI/CD:** GitHub Actions (lint + format-check + tests + typecheck + build on every push); GitHub Releases for desktop binaries
- **Backend (planned):** Node.js + Hono on Railway (Spotify metadata matcher only)
- **Mobile (future):** Android via React Native — iOS is largely blocked by Apple's USB MSC restrictions

## Install

Pre-built installers ship via [GitHub Releases](https://github.com/alexandremarquesricardo-star/trackport/releases).

- **Windows:** download `TrackPort-X.Y.Z-x64-Setup.exe` and run. Until code signing is configured, Microsoft SmartScreen will flag the installer as "unrecognized" — click **More info** → **Run anyway**. The app auto-updates from subsequent releases.
- **macOS:** download `TrackPort-X.Y.Z-{arm64,x64}.dmg`. Until notarization is configured, you'll need to right-click → Open the first time to bypass Gatekeeper.
- **Linux:** download the AppImage, `chmod +x` it, run.

## Development

Requirements: Node.js 22+ and npm.

```sh
npm install        # postinstall rebuilds drivelist for Electron's ABI
npm run dev        # launch the app in dev mode (live reload)
npm run typecheck  # validate TypeScript across main, preload, and renderer
npm run lint       # ESLint flat config (main + preload + renderer + scripts)
npm run format     # prettier --write across the tree
npm run test       # vitest run (single pass, CI mode)
npm run test:watch # vitest in watch mode
npm run build      # production build (typecheck + bundle)
npm run dist:win   # Windows NSIS installer
npm run dist:mac   # macOS DMG (universal: arm64 + x64)
npm run dist:linux # Linux AppImage
npm run icons      # rebuild build/icon.{png,ico} from build/icon.svg
```

### Code signing

Code signing is opt-in via environment variables and is read by electron-builder automatically:

- **Windows** (Authenticode): set `WIN_CSC_LINK` (path to your `.pfx` or its base64) and `WIN_CSC_KEY_PASSWORD`. Without these, the installer builds unsigned and triggers SmartScreen on first install.
- **macOS** (Apple Developer ID): set `CSC_LINK` (path to `.p12` or base64) and `CSC_KEY_PASSWORD`. For notarization, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. Without these, the DMG builds unsigned and triggers Gatekeeper on first open.

Never commit certificates or passwords. Release CI loads them from encrypted secrets.

### Cutting a release

1. Bump `version` in `package.json` and commit on `main`.
2. Tag and push: `git tag v0.X.Y && git push origin v0.X.Y`.
3. The [`Release`](.github/workflows/release.yml) workflow runs on tag push: parallel `windows` (windows-latest runner, NSIS installer + `latest.yml` + `.blockmap`) and `macos` (macos-latest runner, universal arm64+x64 DMG + `latest-mac.yml` + `.blockmap`) jobs. Each runs the full lint + format-check + test + typecheck gate before building. Both upload artifacts to the same **draft** GitHub Release for the tag.
4. Smoke-test the installer / DMG on each platform, then promote the draft Release to published from the GitHub UI. Already-installed copies of the app pick up the new version on their next launch via the auto-updater (~5 s after launch).

#### Repo secrets to configure

These are all optional — without them, the corresponding signing/notarization steps no-op and the binary ships unsigned (Gatekeeper / SmartScreen warnings on first install, but the app runs fine).

| Secret                        | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `WIN_CSC_LINK`                | Base64 of `.pfx` (or URL) — Windows Authenticode signing                 |
| `WIN_CSC_KEY_PASSWORD`        | Password for the `.pfx`                                                  |
| `MAC_CSC_LINK`                | Base64 of `.p12` (or URL) — Apple Developer ID signing                   |
| `MAC_CSC_KEY_PASSWORD`        | Password for the `.p12`                                                  |
| `APPLE_ID`                    | Apple ID email — required for notarization                               |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com — required for notarization |
| `APPLE_TEAM_ID`               | Apple Developer team ID — required for notarization                      |

## Project structure

```
src/
  main/      Electron main process — window lifecycle, OS integration, USB/file access
  preload/   Context bridge between main and renderer (the only safe IPC surface)
  renderer/  React UI (the user-facing 3-tap flow lives here)
  shared/    Types and pure logic shared by main + renderer (single source of truth)
build/       Icon master + CI-generated raster assets (committed for build reproducibility)
release/     electron-builder output (gitignored)
```

## Status

`v0.1.0` — fully functional desktop app. Detects USB devices live, imports a music library with a cached track index, builds preflight plans with smart-fit, syncs with order preservation for transmission-time devices (Shokz / FINIS), supports drag-and-drop folder, persists window state, has a native menu bar, and recovers from render errors.

## License

MIT — see [LICENSE](LICENSE).
