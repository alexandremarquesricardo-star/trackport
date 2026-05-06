import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { DeviceDetector } from "./devices/detector";
import { bindDeviceEventsToWindow, registerDeviceHandlers } from "./devices/ipc";
import { PreferencesStore } from "./preferences/store";
import { registerPreferencesHandlers } from "./preferences/ipc";
import { bindSyncEventsToWindow, registerSyncHandlers } from "./sync/ipc";

const detector = new DeviceDetector();
const preferences = new PreferencesStore();

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: "TrackPort",
    backgroundColor: "#0b0d12",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  bindDeviceEventsToWindow(mainWindow, detector);
  bindSyncEventsToWindow(mainWindow);

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.trackport.app");

  await preferences.load();

  registerDeviceHandlers(detector);
  registerPreferencesHandlers(preferences);
  registerSyncHandlers();
  detector.on("error", (err) => {
    console.error("[DeviceDetector] poll error:", err);
  });
  detector.start();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  detector.stop();
  void preferences.flush();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  detector.stop();
  // Best-effort flush. We deliberately don't block quit on a slow disk —
  // the debounced writes have at most ~250 ms of in-memory state by design.
  event.preventDefault();
  preferences.flush().finally(() => app.exit(0));
});
