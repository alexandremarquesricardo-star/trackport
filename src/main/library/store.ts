import { app } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { Library } from "../../shared/library";
import type { ScanResult, TrackEntry } from "./scanner";

interface LibraryFileShape {
  library: Library | null;
  tracks: TrackEntry[];
  dirMtimes: Record<string, number>;
}

const FILE_NAME = "library.json";
const WRITE_DEBOUNCE_MS = 250;

const EMPTY_STATE: LibraryFileShape = { library: null, tracks: [], dirMtimes: {} };

/**
 * Persistent JSON-backed library store.
 *
 * Same shape as PreferencesStore — debounced (250 ms) atomic writes
 * (write to .tmp then rename, never a torn read on crash mid-write),
 * defensive load (corrupt or schema-mismatched files reset to empty).
 *
 * Lives in its own file rather than sharing preferences.json so the
 * concerns stay parallel: prefs is "user choice for things the app
 * already knows about", library is "user-supplied content pointer
 * that the app indexes."
 *
 * The store also caches the full track index produced by the scanner
 * (paths, sizes, mtimes plus a per-directory mtime map). The renderer
 * only ever sees the metadata-only `Library` projection — the cache is
 * an internal implementation detail used by the planner to avoid
 * re-walking the whole library on every sync click.
 */
export class LibraryStore {
  private state: LibraryFileShape = { ...EMPTY_STATE };
  private loaded = false;
  private writeTimer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  private get filePath(): string {
    return join(app.getPath("userData"), FILE_NAME);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      this.state = sanitise(parsed);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        console.warn("[LibraryStore] failed to read", this.filePath, err);
      }
      this.state = { ...EMPTY_STATE };
    }
    this.loaded = true;
  }

  /** Metadata-only projection used by the renderer-facing IPC. */
  get(): Library | null {
    return this.state.library;
  }

  /** The full scan cache (tracks + dir mtimes), used by the scanner. */
  getScanCache(): ScanResult {
    return { tracks: this.state.tracks, dirMtimes: this.state.dirMtimes };
  }

  /** All cached tracks for the current library, or empty if none is set. */
  getTracks(): TrackEntry[] {
    return this.state.library ? this.state.tracks : [];
  }

  /**
   * Set or clear the library. Clearing wipes the cache too — nothing else
   * pointing at those tracks would be valid once the user removes the
   * library root.
   */
  setLibrary(library: Library | null): void {
    if (library === null) {
      this.state = { ...EMPTY_STATE };
    } else {
      this.state.library = library;
    }
    this.scheduleWrite();
  }

  /**
   * Apply a fresh scan result. Updates the cached tracks and dir mtimes,
   * recomputes the metadata stats (count + total size), and optionally
   * stamps `lastScannedAt`. The "quiet" mode (updateScannedAt=false) is
   * for opportunistic scans triggered during plan-build — those happen
   * invisibly and shouldn't move the user-visible "scanned X ago" label.
   *
   * Returns true if anything actually changed (tracks differ from cache),
   * which lets callers skip downstream work when nothing moved.
   */
  applyScanResult(result: ScanResult, opts: { updateScannedAt: boolean }): boolean {
    if (!this.state.library) return false;
    const changed = !sameTrackIndex(this.state.tracks, result.tracks);
    this.state.tracks = result.tracks;
    this.state.dirMtimes = result.dirMtimes;
    if (changed) {
      this.state.library = {
        ...this.state.library,
        trackCount: result.tracks.length,
        totalBytes: result.tracks.reduce((acc, t) => acc + t.sizeBytes, 0),
      };
    }
    if (opts.updateScannedAt) {
      this.state.library = {
        ...this.state.library,
        lastScannedAt: new Date().toISOString(),
      };
    }
    if (changed || opts.updateScannedAt) this.scheduleWrite();
    return changed;
  }

  /** Force-flush any pending debounced write. Call from app quit handlers. */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.flushing) {
      await this.flushing;
      return;
    }
    this.flushing = this.writeNow();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  private async writeNow(): Promise<void> {
    const path = this.filePath;
    const tmp = `${path}.tmp`;
    const data = JSON.stringify(this.state);
    try {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(tmp, data, "utf-8");
      await fs.rename(tmp, path);
    } catch (err) {
      console.error("[LibraryStore] write failed:", err);
    }
  }
}

function sanitise(input: unknown): LibraryFileShape {
  if (!input || typeof input !== "object") return { ...EMPTY_STATE };
  const root = input as Record<string, unknown>;

  const lib = root.library;
  let library: Library | null = null;
  if (lib && typeof lib === "object") {
    const candidate = lib as Record<string, unknown>;
    if (typeof candidate.root === "string" && candidate.root.length > 0) {
      library = {
        root: candidate.root,
        addedAt:
          typeof candidate.addedAt === "string" ? candidate.addedAt : new Date().toISOString(),
        lastScannedAt: typeof candidate.lastScannedAt === "string" ? candidate.lastScannedAt : null,
        trackCount: typeof candidate.trackCount === "number" ? candidate.trackCount : 0,
        totalBytes: typeof candidate.totalBytes === "number" ? candidate.totalBytes : 0,
      };
    }
  }

  // If there's no library, drop any stale cache that might be lingering.
  if (!library) return { ...EMPTY_STATE };

  return {
    library,
    tracks: Array.isArray(root.tracks) ? sanitiseTracks(root.tracks) : [],
    dirMtimes: sanitiseDirMtimes(root.dirMtimes),
  };
}

function sanitiseTracks(input: unknown[]): TrackEntry[] {
  const out: TrackEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    if (
      typeof t.path !== "string" ||
      typeof t.name !== "string" ||
      typeof t.sizeBytes !== "number" ||
      typeof t.mtimeMs !== "number"
    ) {
      continue;
    }
    out.push({
      path: t.path,
      name: t.name,
      sizeBytes: t.sizeBytes,
      mtimeMs: t.mtimeMs,
    });
  }
  return out;
}

function sanitiseDirMtimes(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/**
 * Cheap structural-equality check for two track lists. Order-sensitive (the
 * scanner produces a stable filesystem-walk order, so identical states yield
 * identical sequences). Avoids re-writing the 5+ MB JSON on every plan-build
 * scan when nothing actually changed.
 */
function sameTrackIndex(a: readonly TrackEntry[], b: readonly TrackEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.path !== y.path || x.sizeBytes !== y.sizeBytes || x.mtimeMs !== y.mtimeMs) {
      return false;
    }
  }
  return true;
}
