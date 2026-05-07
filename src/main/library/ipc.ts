import { BrowserWindow, dialog, ipcMain } from "electron";
import { incrementalScan } from "./scanner";
import type { Library } from "../../shared/library";
import type { LibraryStore } from "./store";

export const LIBRARY_GET = "library:get";
export const LIBRARY_ADD = "library:add";
export const LIBRARY_REMOVE = "library:remove";
export const LIBRARY_RESCAN = "library:rescan";

export function registerLibraryHandlers(store: LibraryStore): void {
  ipcMain.handle(LIBRARY_GET, async (): Promise<Library | null> => store.get());

  ipcMain.handle(LIBRARY_ADD, async (event): Promise<Library | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      title: "Pick your music library folder",
      buttonLabel: "Use this folder",
      properties: ["openDirectory" as const, "dontAddToRecent" as const],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;

    const root = result.filePaths[0];
    // Scan first, then publish — this avoids ever persisting a half-formed
    // library (zero counts) if the scan races a crash. setLibrary's
    // debounced write is replaced by the one from applyScanResult before
    // either fires, so we end up with a single write carrying real stats.
    const scan = await incrementalScan(root, null);
    const totalBytes = scan.tracks.reduce((acc, t) => acc + t.sizeBytes, 0);
    const now = new Date().toISOString();
    store.setLibrary({
      root,
      addedAt: now,
      lastScannedAt: now,
      trackCount: scan.tracks.length,
      totalBytes,
    });
    store.applyScanResult(scan, { updateScannedAt: false });
    return store.get();
  });

  ipcMain.handle(LIBRARY_REMOVE, async (): Promise<void> => {
    store.setLibrary(null);
  });

  ipcMain.handle(LIBRARY_RESCAN, async (): Promise<Library | null> => {
    const current = store.get();
    if (!current) return null;
    const scan = await incrementalScan(current.root, store.getScanCache());
    store.applyScanResult(scan, { updateScannedAt: true });
    return store.get();
  });
}
