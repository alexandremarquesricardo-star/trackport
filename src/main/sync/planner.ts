import { randomUUID } from "node:crypto";
import { scanAudioFiles } from "./audio-scan";
import { getFreeBytes } from "./free-space";
import type { SyncPlan } from "../../shared/sync";

export interface BuildPlanInput {
  sourceFolder: string;
  deviceMountPath: string;
}

/**
 * Build a SyncPlan from a source folder and a device mount path. The plan
 * has a UUID so the executor can be invoked separately (and so the renderer
 * can reference a specific plan to cancel).
 */
export async function buildPlan(input: BuildPlanInput): Promise<SyncPlan> {
  const files = await scanAudioFiles(input.sourceFolder);
  const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const freeSpaceBytes = await getFreeBytes(input.deviceMountPath);
  return {
    id: randomUUID(),
    sourceFolder: input.sourceFolder,
    deviceMountPath: input.deviceMountPath,
    files,
    totalSizeBytes,
    freeSpaceBytes,
    fits: totalSizeBytes <= freeSpaceBytes,
  };
}
