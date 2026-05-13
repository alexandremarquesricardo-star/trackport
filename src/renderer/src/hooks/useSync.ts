import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../../../shared/devices";
import type { FitStrategyId } from "../../../shared/fit";
import type { SyncFailure, SyncPlan, SyncProgress } from "../../../shared/sync";

export type SyncState =
  | { phase: "idle" }
  | { phase: "picking"; device: Device }
  | { phase: "preflight"; device: Device; plan: SyncPlan; wipeDevice: boolean }
  | {
      phase: "copying";
      device: Device;
      plan: SyncPlan;
      wipeDevice: boolean;
      progress: SyncProgress;
    }
  | {
      phase: "done";
      device: Device;
      plan: SyncPlan;
      copiedCount: number;
      skippedCount: number;
      failedCount: number;
      failures: SyncFailure[];
      bytesOnDevice: number;
      wipedCount: number;
      durationMs: number;
    }
  | {
      phase: "error";
      device: Device | null;
      message: string;
      hint?: string;
      helpAnchor?: string;
    };

export interface UseSyncResult {
  state: SyncState;
  /**
   * Begin the sync flow. If `initialFolder` is provided the native folder
   * picker is skipped and we go straight to buildPlan with that path —
   * this is how "Sync library" bypasses the picker.
   */
  start: (device: Device, profileId: string, initialFolder?: string) => Promise<void>;
  applyFit: (strategy: FitStrategyId) => Promise<void>;
  /** Toggle the "Clear device first" preflight option. No-op outside preflight. */
  setWipeDevice: (wipe: boolean) => void;
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
        const wipeDevice = prev.wipeDevice;
        if (
          progress.state === "preparing" ||
          progress.state === "wiping" ||
          progress.state === "copying"
        ) {
          return { phase: "copying", device, plan, wipeDevice, progress };
        }
        if (progress.state === "done") {
          return {
            phase: "done",
            device,
            plan,
            copiedCount: progress.copiedCount,
            skippedCount: progress.skippedCount,
            failedCount: progress.failedCount,
            failures: progress.failures,
            bytesOnDevice: progress.bytesOnDevice,
            wipedCount: progress.wipedCount,
            durationMs: progress.durationMs,
          };
        }
        return {
          phase: "error",
          device,
          message: progress.message,
          hint: progress.hint,
          helpAnchor: progress.helpAnchor,
        };
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
        // Default the wipe toggle ON for transmission-time-order devices
        // (Shokz, FINIS): leftover files from a previous sync break the
        // wedge feature on those devices. Other profiles default OFF —
        // we never destroy data unprompted.
        setState({ phase: "preflight", device, plan, wipeDevice: plan.preserveOrder });
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
      setState({
        phase: "preflight",
        device: current.device,
        plan: next,
        wipeDevice: current.wipeDevice,
      });
    } catch (err) {
      setState({
        phase: "error",
        device: current.device,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const setWipeDevice = useCallback((wipe: boolean): void => {
    setState((prev) => (prev.phase === "preflight" ? { ...prev, wipeDevice: wipe } : prev));
  }, []);

  const confirm = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.phase !== "preflight") return;
    const { plan, device, wipeDevice } = current;
    setState({
      phase: "copying",
      device,
      plan,
      wipeDevice,
      progress: { state: "preparing" },
    });
    try {
      await window.api.sync.executePlan(plan.id, { wipeDevice });
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

  return { state, start, applyFit, setWipeDevice, confirm, cancel, close, isBusy };
}
