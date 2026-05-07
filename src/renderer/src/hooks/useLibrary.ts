import { useCallback, useEffect, useState } from "react";
import type { Library } from "../../../shared/library";

export interface UseLibraryResult {
  library: Library | null;
  loading: boolean;
  busy: boolean;
  /**
   * Add or replace the library. If `path` is provided (drag-and-drop path)
   * the OS folder picker is skipped and that path is used directly.
   * Resolves to true when a library was set, false on cancel / invalid path.
   */
  add: (path?: string) => Promise<boolean>;
  remove: () => Promise<void>;
  rescan: () => Promise<void>;
}

export function useLibrary(): UseLibraryResult {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.api.library
      .get()
      .then((lib) => {
        if (!mounted) return;
        setLibrary(lib);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLibrary(null);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const add = useCallback(async (path?: string): Promise<boolean> => {
    setBusy(true);
    try {
      const lib = await window.api.library.add(path);
      if (lib) {
        setLibrary(lib);
        return true;
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await window.api.library.remove();
      setLibrary(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const rescan = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const lib = await window.api.library.rescan();
      if (lib) setLibrary(lib);
    } finally {
      setBusy(false);
    }
  }, []);

  return { library, loading, busy, add, remove, rescan };
}
