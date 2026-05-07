import { type BrowserWindow, ipcMain } from "electron";
import type { UpdaterController } from "./controller";
import type { UpdateState } from "../../shared/updater";

export const UPDATER_GET_STATE = "updater:get-state";
export const UPDATER_DOWNLOAD = "updater:download";
export const UPDATER_QUIT_AND_INSTALL = "updater:quit-and-install";
export const UPDATER_STATE_EVENT = "updater:state";

export function registerUpdaterHandlers(controller: UpdaterController): void {
  ipcMain.handle(UPDATER_GET_STATE, async (): Promise<UpdateState> => controller.getState());
  ipcMain.handle(UPDATER_DOWNLOAD, async (): Promise<void> => controller.downloadUpdate());
  ipcMain.handle(UPDATER_QUIT_AND_INSTALL, async (): Promise<void> => controller.quitAndInstall());
}

/**
 * Forward updater state changes to a window. Auto-unsubscribes on
 * window close. Mirrors the bindDeviceEventsToWindow / bindSyncEventsToWindow
 * pattern so all event-emitting controllers feel the same shape from
 * the outside.
 */
export function bindUpdaterEventsToWindow(
  window: BrowserWindow,
  controller: UpdaterController,
): () => void {
  const handler = (state: UpdateState): void => {
    if (window.isDestroyed()) return;
    window.webContents.send(UPDATER_STATE_EVENT, state);
  };
  const unsubscribe = controller.onChange(handler);
  window.once("closed", unsubscribe);
  return unsubscribe;
}
