import { contextBridge, ipcRenderer } from "electron";
import type { Device, TrackPortApi } from "../shared/devices";

const DEVICES_LIST_CHANNEL = "devices:list";
const DEVICES_CHANGED_CHANNEL = "devices:changed";

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
