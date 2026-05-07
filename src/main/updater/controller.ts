import { app } from "electron";
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import { updateStateReducer, type UpdateEvent, type UpdateState } from "../../shared/updater";

const FIRST_CHECK_DELAY_MS = 5000;

/**
 * Wraps electron-updater into the project's UpdateState contract.
 *
 * Why a controller and not raw electron-updater everywhere: the
 * underlying library's events are loose tuples (UpdateInfo, ProgressInfo,
 * Error). Translating once at the boundary keeps the rest of the codebase
 * speaking in our shared `UpdateEvent` / `UpdateState` types — easier to
 * test, easier to swap if the underlying library ever changes.
 *
 * Dev mode: electron-updater's checkForUpdates fails outside a packaged
 * app (it has nothing real to check against). `start()` is a no-op when
 * `app.isPackaged` is false, so dev launches don't try to hit GitHub.
 */
export class UpdaterController {
  private state: UpdateState = { phase: "idle" };
  private listeners = new Set<(state: UpdateState) => void>();
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    if (!app.isPackaged) return;

    // Always ask the user before downloading; default behaviour would
    // download silently which feels invasive and pre-commits bandwidth
    // on metered connections.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => this.dispatch({ kind: "checking" }));
    autoUpdater.on("update-available", (info: UpdateInfo) =>
      this.dispatch({
        kind: "available",
        version: info.version,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
      }),
    );
    autoUpdater.on("update-not-available", () => this.dispatch({ kind: "not-available" }));
    autoUpdater.on("download-progress", (p: ProgressInfo) =>
      this.dispatch({
        kind: "progress",
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      }),
    );
    autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
      this.dispatch({ kind: "downloaded", version: info.version }),
    );
    autoUpdater.on("error", (err: Error) =>
      this.dispatch({ kind: "error", message: err.message || "Unknown updater error" }),
    );

    // Defer the first check so app launch isn't blocked by a network
    // round trip — the user sees the UI immediately, the update banner
    // appears a few seconds later if applicable.
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: unknown) => {
        console.warn("[updater] check failed:", err);
      });
    }, FIRST_CHECK_DELAY_MS);
  }

  getState(): UpdateState {
    return this.state;
  }

  onChange(cb: (state: UpdateState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  async downloadUpdate(): Promise<void> {
    if (this.state.phase !== "available") return;
    if (!app.isPackaged) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.dispatch({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  quitAndInstall(): void {
    if (this.state.phase !== "ready") return;
    if (!app.isPackaged) return;
    // Pass `isSilent: false, isForceRunAfter: true` so the NSIS uninstall
    // step runs visibly (so the user knows the update is actually
    // happening) and the app relaunches automatically afterward.
    autoUpdater.quitAndInstall(false, true);
  }

  private dispatch(event: UpdateEvent): void {
    const next = updateStateReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }
}
