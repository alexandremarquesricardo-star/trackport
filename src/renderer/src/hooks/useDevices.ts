import { useEffect, useState } from "react";
import type { Device } from "../../../shared/devices";

export interface UseDevicesResult {
  devices: Device[];
  loading: boolean;
  error: string | null;
}

export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    window.api.devices
      .list()
      .then((initial) => {
        if (!mounted) return;
        setDevices(initial);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load devices");
        setLoading(false);
      });

    const unsubscribe = window.api.devices.onChanged((next) => {
      if (!mounted) return;
      setDevices(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { devices, loading, error };
}
