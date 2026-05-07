import { promises as fs, type Dirent } from "node:fs";
import { dirname, extname, join } from "node:path";
import { AUDIO_EXTENSIONS } from "../sync/audio-scan";
import type { AudioFile } from "../../shared/sync";

/**
 * One entry in the cached track index. `mtimeMs` lets us short-circuit a
 * re-stat when the directory mtime hint says "this dir didn't change" — and
 * even when the dir DID change, we can still reuse the cached size as long
 * as the file's mtime+size match what we last saw.
 */
export interface TrackEntry {
  path: string;
  name: string;
  sizeBytes: number;
  mtimeMs: number;
}

/**
 * The persistent slice of the library cache the scanner produces and
 * consumes. `dirMtimes` is keyed by absolute directory path; entries we
 * don't visit on the next scan get pruned (catches deleted directories).
 */
export interface ScanResult {
  tracks: TrackEntry[];
  dirMtimes: Record<string, number>;
}

const EMPTY_RESULT: ScanResult = { tracks: [], dirMtimes: {} };

/**
 * Walk `root`, returning the audio file index. Reuses anything in `prev`
 * whose containing directory mtime hasn't changed (skips per-file stat
 * for that directory entirely) and falls back to a stat-and-compare for
 * files in directories that did change.
 *
 * Why directory mtime: most filesystems bump a directory's mtime when an
 * entry is added or removed, but NOT when a file inside is edited in
 * place. That's the right resolution for a music library — adds, removes,
 * and renames are detected; an in-place re-encode that keeps the same
 * size and mtime won't be caught, but the user has a Re-scan button if
 * they ever need a hard refresh.
 */
export async function incrementalScan(root: string, prev: ScanResult | null): Promise<ScanResult> {
  const prevState = prev ?? EMPTY_RESULT;
  const prevTracksByDir = groupByDir(prevState.tracks);

  const out: ScanResult = { tracks: [], dirMtimes: {} };
  await walk(root, prevState, prevTracksByDir, out);
  // Stabilise track order so the equality check in LibraryStore.applyScanResult
  // can short-circuit when nothing actually changed, and so on-disk diffs
  // stay tidy across rescans.
  out.tracks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

async function walk(
  dir: string,
  prev: ScanResult,
  prevTracksByDir: Map<string, TrackEntry[]>,
  out: ScanResult,
): Promise<void> {
  const dirMtime = await readDirMtime(dir);
  if (dirMtime === null) return;
  out.dirMtimes[dir] = dirMtime;

  const previousMtime = prev.dirMtimes[dir];
  const dirUnchanged = previousMtime !== undefined && previousMtime === dirMtime;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (dirUnchanged) {
    // Cheap path: trust the cache for this directory's files. We still
    // recurse into subdirectories because each one's mtime stands on its
    // own (a child directory can change without its parent's mtime moving).
    const cachedFiles = prevTracksByDir.get(dir);
    if (cachedFiles) out.tracks.push(...cachedFiles);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), prev, prevTracksByDir, out);
      }
    }
    return;
  }

  // Expensive path: directory is new or changed. We have to look at every
  // entry. For files we still try to reuse the cache — a file whose mtime
  // and size match the cached entry doesn't need a fresh read.
  const cachedHere = mapByPath(prevTracksByDir.get(dir));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, prev, prevTracksByDir, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;

    const cached = cachedHere.get(full);
    try {
      const stat = await fs.stat(full);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.sizeBytes === stat.size) {
        out.tracks.push(cached);
      } else {
        out.tracks.push({
          path: full,
          name: entry.name,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    } catch {
      // unreadable — skip, like the old scanner
    }
  }
}

async function readDirMtime(dir: string): Promise<number | null> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return null;
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function groupByDir(tracks: readonly TrackEntry[]): Map<string, TrackEntry[]> {
  const map = new Map<string, TrackEntry[]>();
  for (const t of tracks) {
    const dir = dirname(t.path);
    let bucket = map.get(dir);
    if (!bucket) {
      bucket = [];
      map.set(dir, bucket);
    }
    bucket.push(t);
  }
  return map;
}

function mapByPath(tracks: readonly TrackEntry[] | undefined): Map<string, TrackEntry> {
  const map = new Map<string, TrackEntry>();
  if (!tracks) return map;
  for (const t of tracks) map.set(t.path, t);
  return map;
}

/** Project the cached entries down to the AudioFile shape the planner takes. */
export function tracksToAudioFiles(tracks: readonly TrackEntry[]): AudioFile[] {
  return tracks.map((t) => ({ path: t.path, name: t.name, sizeBytes: t.sizeBytes }));
}
