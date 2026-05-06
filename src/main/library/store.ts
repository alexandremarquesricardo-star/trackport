import { app } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { Library } from "../../shared/library";

interface LibraryFileShape {
  library: Library | null;
}

const FILE_NAME = "library.json";
const WRITE_DEBOUNCE_MS = 250;

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
 */
export class LibraryStore {
  private state: LibraryFileShape = { library: null };
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
      this.state = { library: null };
    }
    this.loaded = true;
  }

  get(): Library | null {
    return this.state.library;
  }

  set(library: Library | null): void {
    this.state.library = library;
    this.scheduleWrite();
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
    const data = JSON.stringify(this.state, null, 2);
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
  if (!input || typeof input !== "object" || !("library" in input)) {
    return { library: null };
  }
  const lib = (input as { library: unknown }).library;
  if (lib === null) return { library: null };
  if (typeof lib !== "object") return { library: null };
  const candidate = lib as Record<string, unknown>;
  if (typeof candidate.root !== "string" || candidate.root.length === 0) {
    return { library: null };
  }
  return {
    library: {
      root: candidate.root,
      addedAt: typeof candidate.addedAt === "string" ? candidate.addedAt : new Date().toISOString(),
      lastScannedAt:
        typeof candidate.lastScannedAt === "string" ? candidate.lastScannedAt : null,
      trackCount: typeof candidate.trackCount === "number" ? candidate.trackCount : 0,
      totalBytes: typeof candidate.totalBytes === "number" ? candidate.totalBytes : 0,
    },
  };
}
