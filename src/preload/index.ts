import { contextBridge } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  appVersion: "0.1.0",
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error fallback when context isolation disabled
  window.electron = electronAPI;
  // @ts-expect-error fallback when context isolation disabled
  window.api = api;
}

export type Api = typeof api;
