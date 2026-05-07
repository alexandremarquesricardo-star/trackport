import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { DeviceDetector } from "./devices/detector";
import { bindDeviceEventsToWindow, registerDeviceHandlers } from "./devices/ipc";
import { LibraryStore } from "./library/store";
import { registerLibraryHandlers } from "./library/ipc";
import { incrementalScan, tracksToAudioFiles } from "./library/scanner";
import { PreferencesStore } from "./preferences/store";
import { registerPreferencesHandlers } from "./preferences/ipc";
import { scanAudioFiles } from "./sync/audio-scan";
import { bindSyncEventsToWindow, registerSyncHandlers } from "./sync/ipc";
import type { AudioFile } from "../shared/sync";

const detector = new DeviceDetector();
const preferences = new PreferencesStore();
const library = new LibraryStore();

// In dev the icon lives next to the source tree; in packaged builds it's
// shipped via `extraResources` in electron-builder.yml. Linux relies on this
// path at runtime since the AppImage doesn't bake the icon into the binary
// the way the Windows .exe and macOS .app bundles do.
function resolveIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "icon.png")
    : join(app.getAppPath(), "build", "icon.png");
}

/**
 * Plan-build hook: when the user is syncing the library root, refresh the
 * cached track index incrementally (cheap — only re-stats files in
 * directories whose mtime moved) and hand the planner the cached list.
 * Anything else (one-off "Sync folder…" picks) falls back to a fresh scan
 * since there's no cache for it.
 *
 * The opportunistic scan deliberately does NOT bump `lastScannedAt` — that
 * timestamp is the user's "I asked for a fresh scan" beat and shouldn't
 * jump every time they click Sync.
 */
function makeResolveTracks(library: LibraryStore) {
  return async (sourceFolder: string): Promise<AudioFile[]> => {
    const lib = library.get();
    if (!lib || lib.root !== sourceFolder) {
      return scanAudioFiles(sourceFolder);
    }
    const scan = await incrementalScan(sourceFolder, library.getScanCache());
    library.applyScanResult(scan, { updateScannedAt: false });
    return tracksToAudioFiles(library.getTracks());
  };
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: "TrackPort",
    icon: resolveIconPath(),
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

  await Promise.all([preferences.load(), library.load()]);

  registerDeviceHandlers(detector);
  registerPreferencesHandlers(preferences);
  registerLibraryHandlers(library);
  registerSyncHandlers({ resolveTracks: makeResolveTracks(library) });
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
  void library.flush();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  detector.stop();
  // Best-effort flush. We deliberately don't block quit on a slow disk —
  // the debounced writes have at most ~250 ms of in-memory state by design.
  event.preventDefault();
  Promise.allSettled([preferences.flush(), library.flush()]).finally(() => app.exit(0));
});
