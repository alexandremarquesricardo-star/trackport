import { EventEmitter } from "node:events";
import { copyFile, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getProfile } from "../../shared/profiles";
import type { SyncFailure, SyncPlan, SyncPlanId, SyncProgress } from "../../shared/sync";

const DEFAULT_TRANSMISSION_DELAY_MS = 150;

/**
 * Errors that abort the whole sync immediately. Continuing past these is
 * pointless — the device is full or gone. Anything else is treated as a
 * per-file failure: we record it in the failures list and keep going.
 */
const FATAL_ERRNO = new Set<string>([
  "ENOSPC", // device full
  "EROFS", // filesystem became read-only
  "EIO", // hardware I/O error on the destination
]);

/**
 * Executes a SyncPlan by copying files one at a time onto the target device.
 *
 * Idempotency: if a destination file already exists with the same byte size,
 * we skip it. (Re-running the same sync is a no-op rather than a churn-fest.)
 *
 * Cancellation: callers flip a flag via `cancel(planId)`. The executor
 * checks the flag between files — the in-flight copy completes, the next
 * one is skipped, and we emit an "error" progress event with a "cancelled"
 * message.
 *
 * Order preservation: when plan.preserveOrder is true (set from the
 * device profile's `transmissionTimeOrder` quirk), the executor:
 *   1. Copies files strictly sequentially in plan.files order.
 *   2. After each successful copy, opens the destination and calls fsync
 *      so the device-side filesystem commits this file's data before the
 *      next write begins.
 *   3. Sleeps `transmissionTimeOrderDelayMs` (default 150 ms) between
 *      files so distinct transmission timestamps are recorded — devices
 *      that sort by transmission time (Shokz OpenSwim / Pro) will then
 *      play files in plan.files order instead of arbitrary device order.
 *
 * Errors:
 *   - FATAL_ERRNO (ENOSPC / EROFS / EIO): abort. Emit state="error" with
 *     the partial copiedCount. The device is full or unreachable; trying
 *     more files is wasted effort.
 *   - Anything else (per-file): record in `failures`, increment
 *     failedCount, continue. The user gets a single "done" event at the
 *     end with the full list — way better than a single bad MP3 in the
 *     middle of a 100-track playlist torpedoing the whole sync.
 */
export class SyncExecutor extends EventEmitter {
  private cancelled = new Set<SyncPlanId>();

  cancel(planId: SyncPlanId): void {
    this.cancelled.add(planId);
  }

  async execute(plan: SyncPlan): Promise<void> {
    const start = Date.now();
    this.emitProgress({ state: "preparing" });

    const profile = getProfile(plan.profileId);
    const interFileDelayMs = plan.preserveOrder
      ? (profile.quirks.transmissionTimeOrderDelayMs ?? DEFAULT_TRANSMISSION_DELAY_MS)
      : 0;

    let bytesOnDevice = 0;
    let copiedCount = 0;
    let skippedCount = 0;
    const failures: SyncFailure[] = [];

    for (let i = 0; i < plan.files.length; i++) {
      if (this.cancelled.has(plan.id)) {
        this.cancelled.delete(plan.id);
        this.emitProgress({
          state: "error",
          message: "Sync cancelled",
          copiedCount,
        });
        return;
      }

      const file = plan.files[i];
      this.emitProgress({
        state: "copying",
        currentIndex: i,
        currentFile: file.name,
        totalFiles: plan.files.length,
        bytesCopied: bytesOnDevice,
        totalBytes: plan.totalSizeBytes,
      });

      const dest = join(plan.deviceMountPath, file.name);

      try {
        const existing = await stat(dest).catch(() => null);
        if (existing && existing.size === file.sizeBytes) {
          skippedCount++;
          bytesOnDevice += file.sizeBytes;
          continue;
        }
        await copyFile(file.path, dest);
        if (plan.preserveOrder) {
          await fsyncFile(dest);
          if (i < plan.files.length - 1 && interFileDelayMs > 0) {
            await delay(interFileDelayMs);
          }
        }
        copiedCount++;
        bytesOnDevice += file.sizeBytes;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code && FATAL_ERRNO.has(code)) {
          this.emitProgress({
            state: "error",
            message: fatalMessage(code, copiedCount),
            copiedCount,
          });
          return;
        }
        failures.push({ file: file.name, message: shortMessage(err) });
      }
    }

    this.emitProgress({
      state: "done",
      copiedCount,
      skippedCount,
      failedCount: failures.length,
      failures,
      bytesOnDevice,
      durationMs: Date.now() - start,
    });
  }

  private emitProgress(progress: SyncProgress): void {
    this.emit("progress", progress);
  }
}

/**
 * Force the OS to commit a freshly-written file to the underlying disk
 * before we move on to the next one. fs.copyFile only guarantees the data
 * has reached the kernel — for USB MSC devices, the FAT/exFAT controller
 * still has its own write cache. fsync flushes that all the way through.
 *
 * Opening read-only is enough to call fsync; we don't need write access
 * just to ask the OS to flush its buffers.
 */
async function fsyncFile(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function shortMessage(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/^Error:\s*/, "");
  return String(err);
}

function fatalMessage(code: string, copiedCount: number): string {
  if (code === "ENOSPC") {
    return `Device full after ${copiedCount} ${copiedCount === 1 ? "file" : "files"}`;
  }
  if (code === "EROFS") {
    return "Device became read-only mid-sync";
  }
  if (code === "EIO") {
    return "Hardware I/O error — device may have been disconnected";
  }
  return `Sync stopped (${code})`;
}
