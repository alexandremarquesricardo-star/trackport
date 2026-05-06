import { ipcMain } from "electron";
import type { PreferencesStore } from "./store";

export const PREFS_GET_DEVICE_PROFILE = "prefs:get-device-profile";
export const PREFS_SET_DEVICE_PROFILE = "prefs:set-device-profile";

export function registerPreferencesHandlers(store: PreferencesStore): void {
  ipcMain.handle(
    PREFS_GET_DEVICE_PROFILE,
    async (_event, deviceId: unknown): Promise<string | null> => {
      if (typeof deviceId !== "string" || deviceId.length === 0) return null;
      return store.getDeviceProfile(deviceId);
    },
  );

  ipcMain.handle(
    PREFS_SET_DEVICE_PROFILE,
    async (_event, deviceId: unknown, profileId: unknown): Promise<void> => {
      if (typeof deviceId !== "string" || deviceId.length === 0) return;
      if (typeof profileId !== "string" || profileId.length === 0) return;
      store.setDeviceProfile(deviceId, profileId);
    },
  );
}
