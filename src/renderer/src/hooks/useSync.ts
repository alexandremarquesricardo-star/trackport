import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../../../shared/devices";
import type { FitStrategyId } from "../../../shared/fit";
import type { SyncPlan, SyncProgress } from "../../../shared/sync";

export type SyncState =
  | { phase: "idle" }
  | { phase: "picking"; device: Device }
  | { phase: "preflight"; device: Device; plan: SyncPlan }
  | { phase: "copying"; device: Device; plan: SyncPlan; progress: SyncProgress }
  | {
      phase: "done";
      device: Device;
      plan: SyncPlan;
      copiedCount: number;
      skippedCount: number;
      totalBytes: number;
      durationMs: number;
    }
  | { phase: "error"; device: Device | null; message: string };

export interface UseSyncResult {
  state: SyncState;
  /**
   * Begin the sync flow. If `initialFolder` is provided the native folder
   * picker is skipped and we go straight to buildPlan with that path —
   * this is how "Sync library" bypasses the picker.
   */
  start: (device: Device, profileId: string, initialFolder?: string) => Promise<void>;
  applyFit: (strategy: FitStrategyId) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  close: () => void;
  isBusy: boolean;
}

const idle: SyncState = { phase: "idle" };

export function useSync(): UseSyncResult {
  const [state, setState] = useState<SyncState>(idle);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return window.api.sync.onProgress((progress) => {
      setState((prev) => {
        if (prev.phase !== "preflight" && prev.phase !== "copying") return prev;
        const device = prev.device;
        const plan = prev.plan;
        if (progress.state === "preparing" || progress.state === "copying") {
          return { phase: "copying", device, plan, progress };
        }
        if (progress.state === "done") {
          return {
            phase: "done",
            device,
            plan,
            copiedCount: progress.copiedCount,
            skippedCount: progress.skippedCount,
            totalBytes: progress.totalBytes,
            durationMs: progress.durationMs,
          };
        }
        return { phase: "error", device, message: progress.message };
      });
    });
  }, []);

  const start = useCallback(
    async (device: Device, profileId: string, initialFolder?: string): Promise<void> => {
      setState({ phase: "picking", device });
      try {
        const folder = initialFolder ?? (await window.api.sync.pickFolder());
        if (!folder) {
          setState(idle);
          return;
        }
        const plan = await window.api.sync.buildPlan({
          sourceFolder: folder,
          deviceMountPath: device.mountPath,
          profileId,
        });
        setState({ phase: "preflight", device, plan });
      } catch (err) {
        setState({
          phase: "error",
          device,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [],
  );

  const applyFit = useCallback(async (strategy: FitStrategyId): Promise<void> => {
    const current = stateRef.current;
    if (current.phase !== "preflight") return;
    try {
      const next = await window.api.sync.applyFit(current.plan.id, strategy);
      setState({ phase: "preflight", device: current.device, plan: next });
    } catch (err) {
      setState({
        phase: "error",
        device: current.device,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const confirm = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.phase !== "preflight") return;
    const { plan, device } = current;
    setState({
      phase: "copying",
      device,
      plan,
      progress: { state: "preparing" },
    });
    try {
      await window.api.sync.executePlan(plan.id);
    } catch (err) {
      setState({
        phase: "error",
        device,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.phase !== "preflight" && current.phase !== "copying") return;
    await window.api.sync.cancelPlan(current.plan.id);
  }, []);

  const close = useCallback((): void => setState(idle), []);

  const isBusy = state.phase !== "idle";

  return { state, start, applyFit, confirm, cancel, close, isBusy };
}
