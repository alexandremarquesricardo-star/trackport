import { EventEmitter } from "node:events";
import { copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SyncPlan, SyncPlanId, SyncProgress } from "../../shared/sync";

/**
 * Executes a SyncPlan by copying files one at a time onto the target device.
 *
 * Idempotency: if a destination file already exists with the same byte size,
 * we skip it. (Re-running the same sync is a no-op rather than a churn-fest.)
 *
 * Cancellation: callers flip a flag via `cancel(planId)`. The executor
 * checks the flag between files — the in-flight copy completes, the next
 * one is skipped, and we emit an "error" progress event with state=cancel.
 *
 * Progress: emits `progress` events at every meaningful transition. The IPC
 * layer subscribes and forwards each event to the renderer.
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
