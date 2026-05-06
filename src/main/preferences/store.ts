import { app } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Shape on disk. The file is intentionally tolerant of unknown keys (forward
 * compatibility) and the loader resets to empty on any structural mismatch
 * (defensive against corrupted writes from older app versions).
 */
interface PreferencesShape {
  profilesByDeviceId: Record<string, string>;
}

const EMPTY: PreferencesShape = { profilesByDeviceId: {} };
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
  private state: PreferencesShape = { profilesByDeviceId: {} };
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
      if (
        parsed &&
        typeof parsed === "object" &&
        "profilesByDeviceId" in parsed &&
        typeof (parsed as { profilesByDeviceId: unknown }).profilesByDeviceId === "object" &&
        (parsed as { profilesByDeviceId: unknown }).profilesByDeviceId !== null
      ) {
        const candidate = (parsed as { profilesByDeviceId: Record<string, unknown> })
          .profilesByDeviceId;
        const sanitised: Record<string, string> = {};
        for (const [k, v] of Object.entries(candidate)) {
          if (typeof v === "string") sanitised[k] = v;
        }
        this.state = { profilesByDeviceId: sanitised };
      } else {
        this.state = { ...EMPTY };
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        console.warn("[PreferencesStore] failed to read", this.filePath, err);
      }
      this.state = { ...EMPTY };
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
