import { app, BrowserWindow, ipcMain, Menu, screen, shell } from "electron";
import { join } from "node:path";
import { DeviceDetector } from "./devices/detector";
import { bindDeviceEventsToWindow, registerDeviceHandlers } from "./devices/ipc";
import { LibraryStore } from "./library/store";
import { registerLibraryHandlers } from "./library/ipc";
import { incrementalScan, tracksToAudioFiles } from "./library/scanner";
import { buildAppMenu, configureAboutPanel } from "./menu";
import { PreferencesStore } from "./preferences/store";
import { registerPreferencesHandlers } from "./preferences/ipc";
import { scanAudioFiles } from "./sync/audio-scan";
import { bindSyncEventsToWindow, registerSyncHandlers } from "./sync/ipc";
import { UpdaterController } from "./updater/controller";
import { bindUpdaterEventsToWindow, registerUpdaterHandlers } from "./updater/ipc";
import type { AudioFile } from "../shared/sync";
import { bestFitForBounds, type Rect } from "../shared/window";

const detector = new DeviceDetector();
const preferences = new PreferencesStore();
const library = new LibraryStore();
const updater = new UpdaterController();

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

/**
 * Resolve the initial window bounds. Validated saved bounds win; falls
 * back to the default 1100x720 centred-ish on the primary display so we
 * avoid a one-frame "open at 1100x720, then snap to saved size" flash.
 */
function resolveInitialBounds(): Rect | null {
  const saved = preferences.getWindowState().bounds;
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  return bestFitForBounds(saved, displays);
}

function createWindow(): BrowserWindow {
  const initial = resolveInitialBounds();
  const mainWindow = new BrowserWindow({
    width: initial?.width ?? 1100,
    height: initial?.height ?? 720,
    x: initial?.x,
    y: initial?.y,
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

  if (preferences.getWindowState().isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  bindDeviceEventsToWindow(mainWindow, detector);
  bindSyncEventsToWindow(mainWindow);
  bindUpdaterEventsToWindow(mainWindow, updater);
  bindWindowStatePersistence(mainWindow);

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

/**
 * Expose `shell.openPath` to the renderer for "reveal in file manager"
 * affordances. The renderer is sandboxed away from Node, so even something
 * this simple needs an IPC hop. shell.openPath returns an empty string on
 * success and an error message on failure — we project that onto a clean
 * boolean so the renderer doesn't have to interpret OS-specific text.
 */
function registerShellHandlers(): void {
  ipcMain.handle("shell:open-path", async (_event, path: unknown): Promise<boolean> => {
    if (typeof path !== "string" || path.length === 0) return false;
    const err = await shell.openPath(path);
    return err === "";
  });
}

/**
 * Save window geometry on every meaningful change so the next launch
 * lands the user where they were. The PreferencesStore already debounces
 * writes (~250 ms), so the high-frequency `resize`/`move` events during
 * a drag don't churn the disk.
 *
 * `getNormalBounds()` is deliberate: when the user is in maximized mode,
 * we still want to remember the underlying restore-rect so un-maximizing
 * after a relaunch lands on the right size, not on the default 1100x720.
 */
function bindWindowStatePersistence(window: BrowserWindow): void {
  const save = (): void => {
    if (window.isDestroyed()) return;
    preferences.setWindowState({
      bounds: window.getNormalBounds(),
      isMaximized: window.isMaximized(),
    });
  };
  window.on("resize", save);
  window.on("move", save);
  window.on("maximize", save);
  window.on("unmaximize", save);
  window.on("close", save);
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.trackport.app");
  configureAboutPanel();
  Menu.setApplicationMenu(buildAppMenu());

  await Promise.all([preferences.load(), library.load()]);

  registerDeviceHandlers(detector);
  registerPreferencesHandlers(preferences);
  registerLibraryHandlers(library);
  registerSyncHandlers({ resolveTracks: makeResolveTracks(library) });
  registerUpdaterHandlers(updater);
  registerShellHandlers();
  // Kicks off a delayed first check via setTimeout — never blocks startup.
  // No-op in dev (electron-updater can't actually check unsigned dev runs).
  updater.start();
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
