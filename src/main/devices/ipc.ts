import { BrowserWindow, ipcMain } from "electron";
import type { Device } from "../../shared/devices";
import type { DeviceDetector } from "./detector";

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
 */
export function bindDeviceEventsToWindow(
  window: BrowserWindow,
  detector: DeviceDetector,
): () => void {
  const handler = (): void => {
    if (window.isDestroyed()) return;
    window.webContents.send(DEVICES_CHANGED_CHANNEL, detector.list());
  };
  detector.on("changed", handler);
  const unbind = (): void => {
    detector.off("changed", handler);
  };
  window.once("closed", unbind);
  return unbind;
}
