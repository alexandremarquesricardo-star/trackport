import { useCallback, useEffect, useState } from "react";
import { autoDetectProfile, getProfile, type DeviceProfile } from "../../../shared/profiles";

export interface UseDeviceProfileResult {
  profileId: string;
  profile: DeviceProfile;
  setProfileId: (id: string) => void;
}

/**
 * Per-device profile state, persisted across launches.
 *
 * Resolution order on mount:
 *   1. Stored choice (from the prefs JSON in userData)
 *   2. Heuristic auto-detect from the device label
 *   3. Default profile (generic-usb)
 *
 * Writes are fire-and-forget — the IPC call goes through the debounced
 * store, so rapid selector changes coalesce into a single disk write.
 */
export function useDeviceProfile(deviceId: string, deviceLabel: string): UseDeviceProfileResult {
  const [profileId, setLocalProfileId] = useState<string>(() => autoDetectProfile(deviceLabel));

  useEffect(() => {
    let mounted = true;
    void window.api.preferences
      .getDeviceProfile(deviceId)
      .then((stored) => {
        if (!mounted) return;
        setLocalProfileId(stored ?? autoDetectProfile(deviceLabel));
      })
      .catch(() => {
        if (!mounted) return;
        setLocalProfileId(autoDetectProfile(deviceLabel));
      });
    return () => {
      mounted = false;
    };
  }, [deviceId, deviceLabel]);

  const setProfileId = useCallback(
    (id: string): void => {
      setLocalProfileId(id);
      void window.api.preferences.setDeviceProfile(deviceId, id);
    },
    [deviceId],
  );

  return {
    profileId,
    profile: getProfile(profileId),
    setProfileId,
  };
}
