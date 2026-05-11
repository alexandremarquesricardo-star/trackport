/**
 * Build-time env vars exposed to both main and renderer via electron-vite's
 * static replacement (the `VITE_` prefix unlocks injection in all targets).
 *
 * Set values in `.env.local` for dev, or via env vars on the CI build step
 * for release builds. Anything *not* prefixed with `VITE_` stays out of the
 * client bundle.
 */
interface ImportMetaEnv {
  /** Spotify Client ID. See `src/shared/spotify.ts`. */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
