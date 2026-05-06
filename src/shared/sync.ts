/**
 * Shared types for the sync flow (pick folder → scan → plan → copy).
 *
 * Used by:
 *   - main/sync/*  (produces these types)
 *   - preload      (forwards them across IPC)
 *   - renderer     (consumes them in useSync + SyncDialog)
 *
 * The IPC contract is intentionally narrow: the renderer cannot reach into
 * the filesystem directly. Every disk-touching call goes through a typed
 * IPC method on SyncApi.
 */

export type SyncPlanId = string;

export interface AudioFile {
  /** Absolute path of the source file on the user's machine. */
  path: string;
  /** Filename only — used as the destination name on the device. */
  name: string;
  sizeBytes: number;
}

export interface SyncPlan {
  id: SyncPlanId;
  sourceFolder: string;
  deviceMountPath: string;
  /**
   * Files that will be copied (passed the profile's format filter), in the
   * exact order the executor will copy them. For profiles with
   * `preserveOrder: true`, this order is what the device will play back —
   * altering the order here changes playback order on-device.
   */
  files: AudioFile[];
  /**
   * Files that were found in the source folder but skipped because the
   * selected device profile doesn't list their extension as supported.
   * The renderer surfaces this so the user understands why a count
   * decreased after picking a stricter profile.
   */
  unsupportedFiles: AudioFile[];
  /** Profile id at the time the plan was built (for display). */
  profileId: string;
  /** Profile label at the time the plan was built (for display). */
  profileLabel: string;
  /**
   * Mirrors profile.quirks.transmissionTimeOrder at plan-build time so the
   * renderer can render the appropriate hint and the executor can pick its
   * copy strategy without re-reading the catalog.
   */
  preserveOrder: boolean;
  totalSizeBytes: number;
  freeSpaceBytes: number;
  fits: boolean;
}

export type SyncProgress =
  | { state: "preparing" }
  | {
      state: "copying";
      currentIndex: number;
      currentFile: string;
      totalFiles: number;
      bytesCopied: number;
      totalBytes: number;
    }
  | {
      state: "done";
      copiedCount: number;
      skippedCount: number;
      totalBytes: number;
      durationMs: number;
    }
  | { state: "error"; message: string; copiedCount: number };

export interface SyncApi {
  /** Open a native folder picker. Resolves to the chosen path or null on cancel. */
  pickFolder: () => Promise<string | null>;
  /** Scan the source, query free space on the device, and return a plan. */
  buildPlan: (input: {
    sourceFolder: string;
    deviceMountPath: string;
    profileId: string;
  }) => Promise<SyncPlan>;
  /** Execute a previously built plan. Resolves when the executor finishes (or errors). */
  executePlan: (planId: SyncPlanId) => Promise<void>;
  /** Request cancellation. Effective between files; the in-flight file finishes. */
  cancelPlan: (planId: SyncPlanId) => Promise<void>;
  /** Subscribe to progress events. Returns an unsubscribe function. */
  onProgress: (cb: (progress: SyncProgress) => void) => () => void;
}
