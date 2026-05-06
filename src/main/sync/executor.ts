import { EventEmitter } from "node:events";
import { copyFile, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getProfile } from "../../shared/profiles";
import type { SyncPlan, SyncPlanId, SyncProgress } from "../../shared/sync";

const DEFAULT_TRANSMISSION_DELAY_MS = 150;

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
 * Errors: a per-file error aborts the whole plan and emits state="error"
 * with the partial copiedCount. Callers can decide whether to surface "0
 * synced, 50 skipped because we crashed before file 51."
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
    const interFileDelayMs =
      plan.preserveOrder
        ? profile.quirks.transmissionTimeOrderDelayMs ?? DEFAULT_TRANSMISSION_DELAY_MS
        : 0;

    let bytesCopied = 0;
    let copiedCount = 0;
    let skippedCount = 0;

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
        bytesCopied,
        totalBytes: plan.totalSizeBytes,
      });

      const dest = join(plan.deviceMountPath, file.name);

      try {
        const existing = await stat(dest).catch(() => null);
        if (existing && existing.size === file.sizeBytes) {
          skippedCount++;
          bytesCopied += file.sizeBytes;
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
        bytesCopied += file.sizeBytes;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emitProgress({
          state: "error",
          message: `Failed copying ${file.name}: ${message}`,
          copiedCount,
        });
        return;
      }
    }

    this.emitProgress({
      state: "done",
      copiedCount,
      skippedCount,
      totalBytes: plan.totalSizeBytes,
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
