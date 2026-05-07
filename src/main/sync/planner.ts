import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { scanAudioFiles } from "./audio-scan";
import { getFreeBytes } from "./free-space";
import { computeFit, type FitStrategyId } from "../../shared/fit";
import { getProfile } from "../../shared/profiles";
import { compareNatural } from "../../shared/sort";
import type { AudioFile, SyncPlan } from "../../shared/sync";

export interface BuildPlanInput {
  sourceFolder: string;
  deviceMountPath: string;
  profileId: string;
}

/**
 * Resolves a source folder to its audio file list. Defaults to a fresh
 * recursive scan, but the wiring in main/index.ts substitutes a
 * library-cache-aware version so that "Sync library" doesn't pay for a
 * full disk walk on every click.
 */
export type ResolveTracks = (sourceFolder: string) => Promise<AudioFile[]>;

const defaultResolveTracks: ResolveTracks = (folder) => scanAudioFiles(folder);

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
export async function buildPlan(
  input: BuildPlanInput,
  resolveTracks: ResolveTracks = defaultResolveTracks,
): Promise<SyncPlan> {
  const profile = getProfile(input.profileId);
  const supported = new Set(profile.supportedExtensions.map((e) => e.toLowerCase()));

  const allFiles = await resolveTracks(input.sourceFolder);
  const supportedFiles: AudioFile[] = [];
  const unsupportedFiles: AudioFile[] = [];
  for (const f of allFiles) {
    const ext = extname(f.path).toLowerCase();
    if (supported.has(ext)) supportedFiles.push(f);
    else unsupportedFiles.push(f);
  }

  supportedFiles.sort((a, b) => compareNatural(a.path, b.path));

  const totalSizeBytes = supportedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const [freeSpaceBytes, existingDeviceFiles] = await Promise.all([
    getFreeBytes(input.deviceMountPath),
    // Cheap parallel walk — same scanner the source uses, pointed at the
    // device. We surface the count + size in the preflight UI so the user
    // sees the impact of the "Clear device first" toggle before flipping it.
    scanAudioFiles(input.deviceMountPath),
  ]);
  const existingDeviceBytes = existingDeviceFiles.reduce((acc, f) => acc + f.sizeBytes, 0);

  return {
    id: randomUUID(),
    sourceFolder: input.sourceFolder,
    deviceMountPath: input.deviceMountPath,
    files: supportedFiles,
    allSupportedFiles: supportedFiles,
    unsupportedFiles,
    oversizedFiles: [],
    appliedFitStrategy: null,
    profileId: profile.id,
    profileLabel: profile.label,
    preserveOrder: Boolean(profile.quirks.transmissionTimeOrder),
    totalSizeBytes,
    freeSpaceBytes,
    fits: totalSizeBytes <= freeSpaceBytes,
    existingDeviceFileCount: existingDeviceFiles.length,
    existingDeviceBytes,
  };
}

/**
 * Apply a fit strategy to a plan. Always runs against allSupportedFiles
 * (not the currently-mutated `files`), so re-applying a different
 * strategy gives the right answer instead of compounding.
 *
 * Returns a new plan object (same id) so the renderer can rely on
 * referential change to trigger re-render.
 */
export function applyFitToPlan(plan: SyncPlan, strategy: FitStrategyId): SyncPlan {
  const { keptFiles, droppedFiles } = computeFit(
    plan.allSupportedFiles,
    plan.freeSpaceBytes,
    strategy,
  );
  const totalSizeBytes = keptFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  return {
    ...plan,
    files: keptFiles,
    oversizedFiles: droppedFiles,
    appliedFitStrategy: strategy,
    totalSizeBytes,
    fits: totalSizeBytes <= plan.freeSpaceBytes,
  };
}
