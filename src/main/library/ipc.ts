import { BrowserWindow, dialog, ipcMain } from "electron";
import { scanAudioFiles } from "../sync/audio-scan";
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
    const stats = await indexFolder(root);
    const now = new Date().toISOString();
    const library: Library = {
      root,
      addedAt: now,
      lastScannedAt: now,
      trackCount: stats.trackCount,
      totalBytes: stats.totalBytes,
    };
    store.set(library);
    return library;
  });

  ipcMain.handle(LIBRARY_REMOVE, async (): Promise<void> => {
    store.set(null);
  });

  ipcMain.handle(LIBRARY_RESCAN, async (): Promise<Library | null> => {
    const current = store.get();
    if (!current) return null;
    const stats = await indexFolder(current.root);
    const updated: Library = {
      ...current,
      lastScannedAt: new Date().toISOString(),
      trackCount: stats.trackCount,
      totalBytes: stats.totalBytes,
    };
    store.set(updated);
    return updated;
  });
}

async function indexFolder(root: string): Promise<{ trackCount: number; totalBytes: number }> {
  const files = await scanAudioFiles(root);
  return {
    trackCount: files.length,
    totalBytes: files.reduce((acc, f) => acc + f.sizeBytes, 0),
  };
}
