import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Device } from "../shared/devices";
import type { TrackPortApi } from "../shared/api";
import type { FitStrategyId } from "../shared/fit";
import type { Library } from "../shared/library";
import type { SyncPlan, SyncPlanId, SyncProgress } from "../shared/sync";

const DEVICES_LIST_CHANNEL = "devices:list";
const DEVICES_CHANGED_CHANNEL = "devices:changed";
const SHELL_OPEN_PATH = "shell:open-path";
const SYNC_PICK_FOLDER = "sync:pick-folder";
const SYNC_BUILD_PLAN = "sync:build-plan";
const SYNC_APPLY_FIT = "sync:apply-fit";
const SYNC_EXECUTE_PLAN = "sync:execute-plan";
const SYNC_CANCEL_PLAN = "sync:cancel-plan";
const SYNC_PROGRESS = "sync:progress";
const PREFS_GET_DEVICE_PROFILE = "prefs:get-device-profile";
const PREFS_SET_DEVICE_PROFILE = "prefs:set-device-profile";
const LIBRARY_GET = "library:get";
const LIBRARY_ADD = "library:add";
const LIBRARY_REMOVE = "library:remove";
const LIBRARY_RESCAN = "library:rescan";

const api: TrackPortApi = {
  appVersion: "0.1.0",
  devices: {
    list: () => ipcRenderer.invoke(DEVICES_LIST_CHANNEL) as Promise<Device[]>,
    onChanged: (cb) => {
      const handler = (_event: Electron.IpcRendererEvent, devices: Device[]): void => cb(devices);
      ipcRenderer.on(DEVICES_CHANGED_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(DEVICES_CHANGED_CHANNEL, handler);
      };
    },
  },
  sync: {
    pickFolder: () => ipcRenderer.invoke(SYNC_PICK_FOLDER) as Promise<string | null>,
    buildPlan: (input) => ipcRenderer.invoke(SYNC_BUILD_PLAN, input) as Promise<SyncPlan>,
    applyFit: (planId: SyncPlanId, strategy: FitStrategyId) =>
      ipcRenderer.invoke(SYNC_APPLY_FIT, planId, strategy) as Promise<SyncPlan>,
    executePlan: (planId: SyncPlanId, opts) =>
      ipcRenderer.invoke(SYNC_EXECUTE_PLAN, planId, opts ?? {}) as Promise<void>,
    cancelPlan: (planId: SyncPlanId) =>
      ipcRenderer.invoke(SYNC_CANCEL_PLAN, planId) as Promise<void>,
    onProgress: (cb) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: SyncProgress): void =>
        cb(progress);
      ipcRenderer.on(SYNC_PROGRESS, handler);
      return () => {
        ipcRenderer.removeListener(SYNC_PROGRESS, handler);
      };
    },
  },
  preferences: {
    getDeviceProfile: (deviceId: string) =>
      ipcRenderer.invoke(PREFS_GET_DEVICE_PROFILE, deviceId) as Promise<string | null>,
    setDeviceProfile: (deviceId: string, profileId: string) =>
      ipcRenderer.invoke(PREFS_SET_DEVICE_PROFILE, deviceId, profileId) as Promise<void>,
  },
  library: {
    get: () => ipcRenderer.invoke(LIBRARY_GET) as Promise<Library | null>,
    add: (path?: string) =>
      ipcRenderer.invoke(LIBRARY_ADD, path ?? null) as Promise<Library | null>,
    remove: () => ipcRenderer.invoke(LIBRARY_REMOVE) as Promise<void>,
    rescan: () => ipcRenderer.invoke(LIBRARY_RESCAN) as Promise<Library | null>,
  },
  files: {
    // webUtils.getPathForFile is the supported way to extract a filesystem
    // path from a File object in Electron 32+. The deprecated File.path
    // property may be removed entirely in future Electron majors.
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    openInFileManager: (path: string) =>
      ipcRenderer.invoke(SHELL_OPEN_PATH, path) as Promise<boolean>,
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error fallback for the (non-default) no-context-isolation case
  window.api = api;
}
