import type { DevicesApi } from "./devices";
import type { LibraryApi } from "./library";
import type { PreferencesApi } from "./preferences";
import type { SyncApi } from "./sync";

/**
 * Misc filesystem helpers needed by the renderer that don't fit cleanly
 * into the device / sync / library / preferences slices.
 */
export interface FilesApi {
  /**
   * Returns the absolute filesystem path for a File from a drop or
   * <input type="file"> event. Backed by Electron's webUtils.
   */
  pathForFile: (file: File) => string;
  /**
   * Open the given path in the OS file manager (Explorer, Finder,
   * Files, etc.). Resolves to true on success, false if the path is
   * inaccessible or the OS shell rejects it.
   */
  openInFileManager: (path: string) => Promise<boolean>;
}

/**
 * The full surface of `window.api` exposed by the preload to the renderer.
 * This is the single source of truth — both preload (implementer) and
 * renderer (consumer) depend on this type.
 */
export interface TrackPortApi {
  appVersion: string;
  devices: DevicesApi;
  sync: SyncApi;
  preferences: PreferencesApi;
  library: LibraryApi;
  files: FilesApi;
}
