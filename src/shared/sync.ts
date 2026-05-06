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

import type { FitStrategyId } from "./fit";

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
   * Files that will be copied (passed the profile's format filter AND the
   * currently-applied fit strategy), in the exact order the executor will
   * copy them. For profiles with `preserveOrder: true`, this order is
   * what the device will play back.
   */
  files: AudioFile[];
  /**
   * Immutable for the lifetime of the plan: every supported file before
   * any fit strategy was applied. The fit operations always work from
   * this set (so re-applying a different strategy is correct, not
   * compounded against a previous strategy).
   */
  allSupportedFiles: AudioFile[];
  /**
   * Files that were found in the source folder but skipped because the
   * selected device profile doesn't list their extension as supported.
   */
  unsupportedFiles: AudioFile[];
  /**
   * Subset of allSupportedFiles dropped by the currently-applied fit
   * strategy (empty if no fit applied or the plan already fit).
   */
  oversizedFiles: AudioFile[];
  /**
   * `null` until the user picks a fit strategy. The renderer uses the
   * presence of a value to switch between "show suggestion buttons" and
   * "show 'fitted by X' note".
   */
  appliedFitStrategy: FitStrategyId | null;
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
  /** Sum of plan.files (kept) sizes. */
  totalSizeBytes: number;
  freeSpaceBytes: number;
  fits: boolean;
}

/**
 * One per-file failure recorded during a sync. The executor doesn't bail on
 * a single bad file — it keeps going and surfaces these at the end so the
 * user sees exactly which files had problems and why.
 */
export interface SyncFailure {
  /** Filename only (basename of source path), suitable for direct display. */
  file: string;
  /** Short human-readable reason. We strip Node's "Error:" prefix at emit. */
  message: string;
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
      failedCount: number;
      /** Detailed per-file failures (length === failedCount). */
      failures: SyncFailure[];
      /** Bytes that actually ended up on the device (copied + already-there). */
      bytesOnDevice: number;
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
  /**
   * Apply a fit strategy to a plan. The plan's allSupportedFiles is the
   * input — re-applying a strategy is idempotent and never compounds.
   * Returns the updated plan (same id) for the renderer to swap in.
   */
  applyFit: (planId: SyncPlanId, strategy: FitStrategyId) => Promise<SyncPlan>;
  /** Execute a previously built plan. Resolves when the executor finishes (or errors). */
  executePlan: (planId: SyncPlanId) => Promise<void>;
  /** Request cancellation. Effective between files; the in-flight file finishes. */
  cancelPlan: (planId: SyncPlanId) => Promise<void>;
  /** Subscribe to progress events. Returns an unsubscribe function. */
  onProgress: (cb: (progress: SyncProgress) => void) => () => void;
}
