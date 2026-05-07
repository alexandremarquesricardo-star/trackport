import { BrowserWindow, dialog, ipcMain } from "electron";
import type { FitStrategyId } from "../../shared/fit";
import type { SyncPlan, SyncPlanId, SyncProgress } from "../../shared/sync";
import { applyFitToPlan, buildPlan, type BuildPlanInput, type ResolveTracks } from "./planner";
import { SyncExecutor } from "./executor";

export const SYNC_PICK_FOLDER = "sync:pick-folder";
export const SYNC_BUILD_PLAN = "sync:build-plan";
export const SYNC_APPLY_FIT = "sync:apply-fit";
export const SYNC_EXECUTE_PLAN = "sync:execute-plan";
export const SYNC_CANCEL_PLAN = "sync:cancel-plan";
export const SYNC_PROGRESS = "sync:progress";

const plans = new Map<SyncPlanId, SyncPlan>();
const executor = new SyncExecutor();

export interface SyncHandlerDeps {
  /**
   * Optional override for how the planner pulls audio file lists. The
   * default falls back to a fresh disk scan; main/index.ts substitutes a
   * library-cache-aware version so library syncs skip the full walk.
   */
  resolveTracks?: ResolveTracks;
}

export function registerSyncHandlers(deps: SyncHandlerDeps = {}): void {
  ipcMain.handle(SYNC_PICK_FOLDER, async (event): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      title: "Pick a folder of audio files",
      buttonLabel: "Use this folder",
      properties: ["openDirectory" as const, "dontAddToRecent" as const],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(SYNC_BUILD_PLAN, async (_event, input: BuildPlanInput): Promise<SyncPlan> => {
    const plan = await buildPlan(input, deps.resolveTracks);
    plans.set(plan.id, plan);
    return plan;
  });

  ipcMain.handle(
    SYNC_APPLY_FIT,
    async (_event, planId: SyncPlanId, strategy: FitStrategyId): Promise<SyncPlan> => {
      const plan = plans.get(planId);
      if (!plan) throw new Error(`Plan ${planId} not found`);
      const next = applyFitToPlan(plan, strategy);
      plans.set(next.id, next);
      return next;
    },
  );

  ipcMain.handle(
    SYNC_EXECUTE_PLAN,
    async (_event, planId: SyncPlanId, opts: { wipeDevice?: boolean } = {}): Promise<void> => {
      const plan = plans.get(planId);
      if (!plan) throw new Error(`Plan ${planId} not found`);
      try {
        await executor.execute(plan, { wipeDevice: opts.wipeDevice ?? false });
      } finally {
        plans.delete(planId);
      }
    },
  );

  ipcMain.handle(SYNC_CANCEL_PLAN, async (_event, planId: SyncPlanId): Promise<void> => {
    executor.cancel(planId);
  });
}

/**
 * Forward executor progress events to the renderer. Cleans up on window close.
 */
export function bindSyncEventsToWindow(window: BrowserWindow): () => void {
  const handler = (progress: SyncProgress): void => {
    if (window.isDestroyed()) return;
    window.webContents.send(SYNC_PROGRESS, progress);
  };
  executor.on("progress", handler);
  const unbind = (): void => {
    executor.off("progress", handler);
  };
  window.once("closed", unbind);
  return unbind;
}
