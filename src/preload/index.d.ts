import type { TrackPortApi } from "../shared/devices";

declare global {
  interface Window {
    api: TrackPortApi;
  }
}
