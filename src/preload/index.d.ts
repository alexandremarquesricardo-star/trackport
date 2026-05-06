import type { TrackPortApi } from "../shared/api";

declare global {
  interface Window {
    api: TrackPortApi;
  }
}
