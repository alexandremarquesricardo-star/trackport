import { BrowserWindow, dialog, ipcMain } from "electron";
import { stat } from "node:fs/promises";
import { incrementalScan } from "./scanner";
import { matchAgainstSpotify } from "./match-runner";
import { matchPlaylist, parseTrackList } from "../../shared/match";
import type { Library } from "../../shared/library";
import type { MatchOutcome } from "../../shared/match";
import type { SpotifyAuthController } from "../spotify/auth-controller";
import type { LibraryStore } from "./store";

export const LIBRARY_GET = "library:get";
export const LIBRARY_ADD = "library:add";
export const LIBRARY_REMOVE = "library:remove";
export const LIBRARY_RESCAN = "library:rescan";
export const LIBRARY_MATCH_AGAINST_SPOTIFY = "library:match-against-spotify";
export const LIBRARY_MATCH_AGAINST_TEXT = "library:match-against-text";

export function registerLibraryHandlers(
  store: LibraryStore,
  spotifyAuth: SpotifyAuthController,
): void {
  ipcMain.handle(LIBRARY_GET, async (): Promise<Library | null> => store.get());

  ipcMain.handle(
    LIBRARY_ADD,
    async (event, requestedPath: string | null): Promise<Library | null> => {
      let root: string;
      if (typeof requestedPath === "string" && requestedPath.length > 0) {
        // Drop / programmatic path — validate it's actually a directory
        // before we let the scanner walk it. A bug or a malicious renderer
        // shouldn't be able to point us at /etc or a single file.
        if (!(await isExistingDirectory(requestedPath))) return null;
        root = requestedPath;
      } else {
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
        root = result.filePaths[0];
      }

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
    },
  );

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

  ipcMain.handle(
    LIBRARY_MATCH_AGAINST_SPOTIFY,
    async (_event, playlistRef: unknown): Promise<MatchOutcome> => {
      // Renderer-side type contract guarantees a string, but ipcMain runs
      // ahead of TS so guard explicitly. matchAgainstSpotify itself also
      // validates, but failing here gives a clearer error code at the IPC
      // boundary than relying on internal validation.
      if (typeof playlistRef !== "string") {
        return {
          ok: false,
          code: "invalid_ref",
          message: "playlistRef must be a string",
        };
      }
      return matchAgainstSpotify(playlistRef, store, spotifyAuth);
    },
  );

  ipcMain.handle(
    LIBRARY_MATCH_AGAINST_TEXT,
    async (_event, text: unknown): Promise<MatchOutcome> => {
      // Path C: paste a flat track list. No Spotify auth needed; parser
      // synthesizes the same metadata shape as Spotify so the matcher
      // doesn't need to know the difference.
      if (typeof text !== "string") {
        return { ok: false, code: "invalid_ref", message: "text must be a string" };
      }
      if (text.trim().length === 0) {
        return { ok: false, code: "invalid_ref", message: "Paste a track list to match" };
      }
      const library = store.get();
      if (!library) {
        return { ok: false, code: "no_library", message: "No music library is set" };
      }
      const tracks = parseTrackList(text);
      if (tracks.length === 0) {
        return {
          ok: false,
          code: "invalid_ref",
          message: "Couldn't parse any tracks from that input",
        };
      }
      const result = matchPlaylist(tracks, store.getTracks());
      return { ok: true, result };
    },
  );
}

async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
