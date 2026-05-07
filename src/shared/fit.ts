/**
 * "Smart fit" — given a list of files and a free-space budget, propose
 * subsets that fit. Pure functions, no IO. Used in two places:
 *   - renderer/components/SyncDialog (preview suggestions in preflight)
 *   - main/sync/planner (commit the chosen suggestion to the plan)
 *
 * Single source of truth: both sides call computeFit / computeFitSuggestions
 * here, so what the renderer previews is exactly what main applies.
 */

import type { AudioFile } from "./sync";

export type FitStrategyId = "first-fit" | "drop-largest";

export interface FitSuggestion {
  strategy: FitStrategyId;
  label: string;
  description: string;
  keptCount: number;
  droppedCount: number;
  keptBytes: number;
  droppedBytes: number;
  fits: boolean;
}

/**
 * Apply a strategy and return the (kept, dropped) partition. The natural
 * ordering of `files` is preserved in both arrays — `keptFiles` is a
 * subsequence of the input, never re-sorted.
 */
export function computeFit(
  files: AudioFile[],
  freeBytes: number,
  strategy: FitStrategyId,
): { keptFiles: AudioFile[]; droppedFiles: AudioFile[] } {
  const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
  if (totalBytes <= freeBytes) {
    return { keptFiles: [...files], droppedFiles: [] };
  }

  if (strategy === "first-fit") {
    const kept: AudioFile[] = [];
    const dropped: AudioFile[] = [];
    let bytes = 0;
    for (const f of files) {
      if (bytes + f.sizeBytes <= freeBytes) {
        kept.push(f);
        bytes += f.sizeBytes;
      } else {
        dropped.push(f);
      }
    }
    return { keptFiles: kept, droppedFiles: dropped };
  }

  // "drop-largest": remove the heaviest files until total fits, then
  // return the remaining files in their original (natural-sort) order.
  const indexed = files.map((f, i) => ({ f, i }));
  const bySizeDesc = [...indexed].sort((a, b) => b.f.sizeBytes - a.f.sizeBytes);
  const dropIndices = new Set<number>();
  let remaining = totalBytes;
  for (const { f, i } of bySizeDesc) {
    if (remaining <= freeBytes) break;
    dropIndices.add(i);
    remaining -= f.sizeBytes;
  }
  const kept: AudioFile[] = [];
  const dropped: AudioFile[] = [];
  files.forEach((f, i) => {
    if (dropIndices.has(i)) dropped.push(f);
    else kept.push(f);
  });
  return { keptFiles: kept, droppedFiles: dropped };
}

/**
 * Preview every strategy at once for the preflight UI. Returns suggestions
 * even when they don't quite fit (degenerate case: even dropping all but
 * one file is still larger than the device) — the UI filters by `fits`.
 */
export function computeFitSuggestions(files: AudioFile[], freeBytes: number): FitSuggestion[] {
  if (files.length === 0) return [];
  const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
  if (totalBytes <= freeBytes) return [];

  const strategies: FitStrategyId[] = ["first-fit", "drop-largest"];
  return strategies.map((strategy) => {
    const { keptFiles, droppedFiles } = computeFit(files, freeBytes, strategy);
    const keptBytes = keptFiles.reduce((a, f) => a + f.sizeBytes, 0);
    const droppedBytes = droppedFiles.reduce((a, f) => a + f.sizeBytes, 0);
    return {
      strategy,
      label: labelFor(strategy, keptFiles.length, droppedFiles.length),
      description: descriptionFor(strategy, droppedBytes),
      keptCount: keptFiles.length,
      droppedCount: droppedFiles.length,
      keptBytes,
      droppedBytes,
      fits: keptBytes <= freeBytes,
    };
  });
}

function labelFor(strategy: FitStrategyId, keptCount: number, droppedCount: number): string {
  if (strategy === "first-fit") {
    return `Sync first ${keptCount.toLocaleString()} ${keptCount === 1 ? "track" : "tracks"}`;
  }
  return `Drop ${droppedCount.toLocaleString()} largest ${droppedCount === 1 ? "track" : "tracks"}`;
}

function descriptionFor(strategy: FitStrategyId, droppedBytes: number): string {
  const freed = formatBytesForDescription(droppedBytes);
  if (strategy === "first-fit") {
    return `Keeps the playlist order; drops everything after the limit. Frees ${freed}.`;
  }
  return `Removes the heaviest files first. Order of remaining tracks preserved (with gaps). Frees ${freed}.`;
}

function formatBytesForDescription(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
