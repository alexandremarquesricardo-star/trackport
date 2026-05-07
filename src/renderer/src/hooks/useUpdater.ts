import { useCallback, useEffect, useState } from "react";
import type { UpdateState } from "../../../shared/updater";

const idle: UpdateState = { phase: "idle" };

export interface UseUpdaterResult {
  state: UpdateState;
  /** Begin downloading the available update. */
  download: () => Promise<void>;
  /** Install the downloaded update by quitting + relaunching. */
  install: () => Promise<void>;
}

/**
 * Subscribe to update state from the main process. Reads the initial
 * state via `getState()` so a hook mounted after the controller has
 * already fired some events still reflects current reality, then keeps
 * in sync via the live event stream.
 */
export function useUpdater(): UseUpdaterResult {
  const [state, setState] = useState<UpdateState>(idle);

  useEffect(() => {
    let mounted = true;
    void window.api.updater.getState().then((s) => {
      if (mounted) setState(s);
    });
    const unsubscribe = window.api.updater.onChange(setState);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const download = useCallback(async (): Promise<void> => {
    await window.api.updater.downloadUpdate();
  }, []);

  const install = useCallback(async (): Promise<void> => {
    await window.api.updater.quitAndInstall();
  }, []);

  return { state, download, install };
}
