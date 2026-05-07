/**
 * Shared types for the auto-update flow.
 *
 * The reducer here is the single source of truth for valid state
 * transitions — both the main process (which receives raw events from
 * electron-updater) and the renderer (which reflects state into UI) run
 * the same projection. Tests in `updater.test.ts` exercise it without
 * needing Electron.
 */

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | {
      phase: "available";
      version: string;
      releaseNotes: string | null;
    }
  | {
      phase: "downloading";
      /** 0..100. */
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

export type UpdateEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string; releaseNotes: string | null }
  | { kind: "not-available" }
  | {
      kind: "progress";
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

/**
 * Pure projection from (prevState, event) to nextState. Centralized so
 * the renderer's hook and the main controller agree on what every event
 * means without re-deriving it on each side.
 *
 * `not-available` collapses back to idle — we don't tell users when
 * they're up to date (it'd be noise on every launch). Errors stay
 * sticky so a transient network blip during a download phase doesn't
 * silently disappear; the renderer still chooses not to render the
 * error state, but it's preserved for diagnostics.
 */
export function updateStateReducer(prev: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.kind) {
    case "checking":
      return { phase: "checking" };
    case "available":
      return {
        phase: "available",
        version: event.version,
        releaseNotes: event.releaseNotes,
      };
    case "not-available":
      // Only collapse from a checking state — don't yank a user out of
      // an in-flight download because a re-check came back negative.
      if (prev.phase === "checking") return { phase: "idle" };
      return prev;
    case "progress":
      return {
        phase: "downloading",
        percent: event.percent,
        bytesPerSecond: event.bytesPerSecond,
        transferred: event.transferred,
        total: event.total,
      };
    case "downloaded":
      return { phase: "ready", version: event.version };
    case "error":
      return { phase: "error", message: event.message };
  }
}

export interface UpdaterApi {
  /** Resolves to the current state — useful for hooks that mount after some events. */
  getState: () => Promise<UpdateState>;
  /** Subscribe to state changes. Returns unsubscribe. */
  onChange: (cb: (state: UpdateState) => void) => () => void;
  /**
   * Begin downloading the available update. No-op if not currently in
   * the `available` phase (the main side enforces this).
   */
  downloadUpdate: () => Promise<void>;
  /**
   * Quit the app and install the downloaded update. No-op if not
   * currently in the `ready` phase.
   */
  quitAndInstall: () => Promise<void>;
}
