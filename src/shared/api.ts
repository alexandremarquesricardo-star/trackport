import type { DevicesApi } from "./devices";
import type { LibraryApi } from "./library";
import type { PreferencesApi } from "./preferences";
import type { SyncApi } from "./sync";

/**
 * Misc filesystem helpers needed by the renderer that don't fit cleanly
 * into the device / sync / library / preferences slices. Today this is
 * just path extraction for drag-and-drop; future utilities (reveal in
 * file manager, etc.) belong here too.
 */
export interface FilesApi {
  /**
   * Returns the absolute filesystem path for a File from a drop or
   * <input type="file"> event. Backed by Electron's webUtils.
   */
  pathForFile: (file: File) => string;
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
