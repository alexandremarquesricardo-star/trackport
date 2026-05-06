import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { scanAudioFiles } from "./audio-scan";
import { getFreeBytes } from "./free-space";
import { getProfile } from "../../shared/profiles";
import { compareNatural } from "../../shared/sort";
import type { AudioFile, SyncPlan } from "../../shared/sync";

export interface BuildPlanInput {
  sourceFolder: string;
  deviceMountPath: string;
  profileId: string;
}

/**
 * Build a SyncPlan from a source folder, a device mount path, and a device
 * profile id. The profile's supportedExtensions list partitions the scan
 * results into "files that will be copied" and "unsupportedFiles" — the
 * renderer surfaces the latter so the user understands why a stricter
 * profile reduces the count.
 *
 * Ordering: supported files are sorted with a natural-collator on the full
 * path. That keeps "01 Track / 02 Track / 10 Track" in user-intuitive
 * order (not "01 / 10 / 02"), and groups files within an album folder
 * together. For profiles whose quirks.transmissionTimeOrder is true, this
 * order is what the device will play.
 *
 * The plan has a UUID so the executor can be invoked separately and the
 * renderer can reference a specific plan to cancel.
 */
export async function buildPlan(input: BuildPlanInput): Promise<SyncPlan> {
  const profile = getProfile(input.profileId);
  const supported = new Set(profile.supportedExtensions.map((e) => e.toLowerCase()));

  const allFiles = await scanAudioFiles(input.sourceFolder);
  const files: AudioFile[] = [];
  const unsupportedFiles: AudioFile[] = [];
  for (const f of allFiles) {
    const ext = extname(f.path).toLowerCase();
    if (supported.has(ext)) files.push(f);
    else unsupportedFiles.push(f);
  }

  files.sort((a, b) => compareNatural(a.path, b.path));

  const totalSizeBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const freeSpaceBytes = await getFreeBytes(input.deviceMountPath);

  return {
    id: randomUUID(),
    sourceFolder: input.sourceFolder,
    deviceMountPath: input.deviceMountPath,
    files,
    unsupportedFiles,
    profileId: profile.id,
    profileLabel: profile.label,
    preserveOrder: Boolean(profile.quirks.transmissionTimeOrder),
    totalSizeBytes,
    freeSpaceBytes,
    fits: totalSizeBytes <= freeSpaceBytes,
  };
}
