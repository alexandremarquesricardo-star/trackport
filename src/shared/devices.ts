/**
 * Shared types for the device-detection contract.
 *
 * Single source of truth used by:
 *   - main/devices/detector.ts (produces Device snapshots)
 *   - main/devices/ipc.ts      (publishes them over IPC)
 *   - preload/index.ts         (implements DevicesApi via contextBridge)
 *   - renderer/...             (consumes Device + DevicesApi)
 *
 * If the IPC payload shape changes, change it here first.
 */

export type DeviceId = string;

export interface Device {
  /** Stable hardware identifier (drivelist's `device` field). */
  id: DeviceId;
  /** Human-readable name shown in the UI (description or volume label). */
  label: string;
  /** First mountpoint — what we'd copy files into. e.g. `E:\` or `/Volumes/SWIM PRO`. */
  mountPath: string;
  /** Total capacity in bytes. 0 when the OS doesn't report it. */
  sizeBytes: number;
  /** Bus reported by the OS (USB, SD, etc). Useful for diagnostics; not for filtering. */
  busType: string;
  isRemovable: boolean;
}

export interface DevicesApi {
  /** One-shot snapshot of the currently-connected, removable devices. */
  list: () => Promise<Device[]>;
  /**
   * Subscribe to device add/remove events. Returns an unsubscribe function.
   * The full device list is always sent; the renderer can diff if it cares.
   */
  onChanged: (cb: (devices: Device[]) => void) => () => void;
}

export interface TrackPortApi {
  appVersion: string;
  devices: DevicesApi;
}
