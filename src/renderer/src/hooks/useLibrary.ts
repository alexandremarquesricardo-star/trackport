import { useCallback, useEffect, useState } from "react";
import type { Library } from "../../../shared/library";

export interface UseLibraryResult {
  library: Library | null;
  loading: boolean;
  busy: boolean;
  add: () => Promise<void>;
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

  const add = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const lib = await window.api.library.add();
      if (lib) setLibrary(lib);
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
