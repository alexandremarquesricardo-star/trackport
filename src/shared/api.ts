import type { DevicesApi } from "./devices";
import type { SyncApi } from "./sync";

/**
 * The full surface of `window.api` exposed by the preload to the renderer.
 * This is the single source of truth — both preload (implementer) and
 * renderer (consumer) depend on this type.
 */
export interface TrackPortApi {
  appVersion: string;
  devices: DevicesApi;
  sync: SyncApi;
}
