import { EventEmitter } from "node:events";
import { list as listDrives } from "drivelist";
import type { Device } from "../../shared/devices";

const POLL_INTERVAL_MS = 1500;

export interface ChangedEvent {
  devices: Device[];
  added: Device[];
  removed: Device[];
}

/**
 * Polls drivelist on a fixed interval, diffs against the previous snapshot,
 * and emits "changed" only when a device is added or removed. Errors during
 * polling do not stop the loop — they're emitted as "error" and the next tick
 * proceeds.
 */
export class DeviceDetector extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private snapshot = new Map<string, Device>();

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  list(): Device[] {
    return Array.from(this.snapshot.values());
  }

  private async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const drives = await listDrives();
      const next = new Map<string, Device>();
      for (const drive of drives) {
        if (drive.isSystem) continue;
        if (!drive.isRemovable) continue;
        if (!drive.mountpoints || drive.mountpoints.length === 0) continue;
        const device = toDevice(drive);
        next.set(device.id, device);
      }
      // Snapshot must be updated BEFORE we emit "changed". Listeners may call
      // back into detector.list() synchronously inside the emit, and they
      // expect the new state.
      const prev = this.snapshot;
      this.snapshot = next;
      this.diffAndEmit(prev, next);
    } catch (err) {
      this.emit("error", err);
    } finally {
      this.polling = false;
    }
  }

  private diffAndEmit(prev: Map<string, Device>, next: Map<string, Device>): void {
    const added: Device[] = [];
    const removed: Device[] = [];
    for (const [id, dev] of next) {
      if (!prev.has(id)) added.push(dev);
    }
    for (const [id, dev] of prev) {
      if (!next.has(id)) removed.push(dev);
    }
    if (added.length === 0 && removed.length === 0) return;
    const event: ChangedEvent = {
      devices: Array.from(next.values()),
      added,
      removed,
    };
    this.emit("changed", event);
  }
}

type DriveListEntry = Awaited<ReturnType<typeof listDrives>>[number];

function toDevice(drive: DriveListEntry): Device {
  const mp = drive.mountpoints[0];
  const label = drive.description || mp.label || "Removable drive";
  return {
    id: drive.device,
    label,
    mountPath: mp.path,
    sizeBytes: drive.size ?? 0,
    busType: drive.busType ?? "UNKNOWN",
    isRemovable: drive.isRemovable,
  };
}
