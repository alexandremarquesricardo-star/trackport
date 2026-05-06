# TrackPort

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
- **Backend (planned):** Node.js + Hono on Railway
- **CI/CD:** GitHub Actions → GitHub Releases for desktop binaries
- **Mobile (future):** React Native or PWA

## Development

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev        # launch the app in dev mode
npm run typecheck  # validate TypeScript across main, preload, and renderer
npm run build      # production build (typecheck + bundle)
npm run dist:win   # build a Windows installer (NSIS)
npm run dist:mac   # build macOS DMG
npm run dist:linux # build Linux AppImage
```

## Project structure

```
src/
  main/      Electron main process — window lifecycle, OS integration, USB/file access
  preload/   Context bridge between main and renderer (the only safe IPC surface)
  renderer/  React UI (the user-facing 3-tap flow lives here)
```

## Status

`v0.1.0` — project scaffold. The app starts and shows the home screen. Device detection, library import, and sync are landing in the next iterations.

## License

MIT
