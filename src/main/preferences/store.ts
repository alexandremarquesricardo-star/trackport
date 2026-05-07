import { app } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { EMPTY_WINDOW_STATE, type Rect, type WindowState } from "../../shared/window";

/**
 * Shape on disk. The file is intentionally tolerant of unknown keys (forward
 * compatibility) and the loader resets to empty on any structural mismatch
 * (defensive against corrupted writes from older app versions).
 */
interface PreferencesShape {
  profilesByDeviceId: Record<string, string>;
  window: WindowState;
}

const EMPTY: PreferencesShape = {
  profilesByDeviceId: {},
  window: EMPTY_WINDOW_STATE,
};
const FILE_NAME = "preferences.json";
const WRITE_DEBOUNCE_MS = 250;

/**
 * Persistent JSON-backed preferences keyed under the OS-managed userData
 * directory. Reads are synchronous-from-memory once `load()` resolves;
 * writes are debounced and atomic (write to .tmp then rename — never a
 * torn read on a crash mid-write).
 *
 * Intentionally not an EventEmitter and not subscribable — the renderer
 * is the only mutator and already updates its own state optimistically.
 */
export class PreferencesStore {
  private state: PreferencesShape = {
    profilesByDeviceId: {},
    window: { ...EMPTY_WINDOW_STATE },
  };
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
        console.warn("[PreferencesStore] failed to read", this.filePath, err);
      }
      this.state = { ...EMPTY, window: { ...EMPTY_WINDOW_STATE } };
    }
    this.loaded = true;
  }

  getDeviceProfile(deviceId: string): string | null {
    return this.state.profilesByDeviceId[deviceId] ?? null;
  }

  setDeviceProfile(deviceId: string, profileId: string): void {
    if (this.state.profilesByDeviceId[deviceId] === profileId) return;
    this.state.profilesByDeviceId[deviceId] = profileId;
    this.scheduleWrite();
  }

  /** Last-known unmaximized bounds + maximized flag, or empty defaults. */
  getWindowState(): WindowState {
    return this.state.window;
  }

  /**
   * Persist the current window state. Deduplicated against the in-memory
   * value so a rapid sequence of `resize` / `move` events that don't
   * actually change anything (e.g., post-snap) doesn't churn the
   * debounced write.
   */
  setWindowState(next: WindowState): void {
    if (sameWindowState(this.state.window, next)) return;
    this.state.window = next;
    this.scheduleWrite();
  }

  /**
   * Force-flush any pending debounced write. Call from app quit handlers
   * so a tiny window between user action and shutdown doesn't drop state.
   */
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
      console.error("[PreferencesStore] write failed:", err);
    }
  }
}

function sanitise(input: unknown): PreferencesShape {
  if (!input || typeof input !== "object") {
    return { ...EMPTY, window: { ...EMPTY_WINDOW_STATE } };
  }
  const root = input as Record<string, unknown>;
  return {
    profilesByDeviceId: sanitiseProfileMap(root.profilesByDeviceId),
    window: sanitiseWindowState(root.window),
  };
}

function sanitiseProfileMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function sanitiseWindowState(input: unknown): WindowState {
  if (!input || typeof input !== "object") return { ...EMPTY_WINDOW_STATE };
  const candidate = input as Record<string, unknown>;
  return {
    bounds: sanitiseRect(candidate.bounds),
    isMaximized: candidate.isMaximized === true,
  };
}

function sanitiseRect(input: unknown): Rect | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (
    typeof r.x !== "number" ||
    typeof r.y !== "number" ||
    typeof r.width !== "number" ||
    typeof r.height !== "number"
  ) {
    return null;
  }
  if (!isFinite(r.x) || !isFinite(r.y) || !isFinite(r.width) || !isFinite(r.height)) {
    return null;
  }
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function sameWindowState(a: WindowState, b: WindowState): boolean {
  if (a.isMaximized !== b.isMaximized) return false;
  return sameRect(a.bounds, b.bounds);
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
