import { type BrowserWindow, ipcMain } from "electron";
import type { Device } from "../../shared/devices";
import type { ChangedEvent, DeviceDetector } from "./detector";

export const DEVICES_LIST_CHANNEL = "devices:list";
export const DEVICES_CHANGED_CHANNEL = "devices:changed";

/**
 * Register the request/response handler. Call exactly once at app boot.
 */
export function registerDeviceHandlers(detector: DeviceDetector): void {
  ipcMain.handle(DEVICES_LIST_CHANNEL, (): Device[] => detector.list());
}

/**
 * Stream device-changed events to a specific window. Cleans itself up when
 * the window closes. Returns an explicit unbinder for callers that want it.
 *
 * We forward the event payload (not detector.list()) so the renderer always
 * sees the snapshot that triggered the diff — no "what's the current state
 * right now?" race with the next poll tick.
 */
export function bindDeviceEventsToWindow(
  window: BrowserWindow,
  detector: DeviceDetector,
): () => void {
  const handler = (event: ChangedEvent): void => {
    if (window.isDestroyed()) return;
    window.webContents.send(DEVICES_CHANGED_CHANNEL, event.devices);
  };
  detector.on("changed", handler);
  const unbind = (): void => {
    detector.off("changed", handler);
  };
  window.once("closed", unbind);
  return unbind;
}
