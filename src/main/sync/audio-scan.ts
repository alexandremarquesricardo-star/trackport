import { promises as fs, type Dirent } from "node:fs";
import { basename, extname, join } from "node:path";
import type { AudioFile } from "../../shared/sync";

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".wma",
  ".ogg",
  ".opus",
  ".aif",
  ".aiff",
  ".ape",
]);

/**
 * Recursively scan a folder for audio files. Hidden entries (starting with
 * ".") are skipped. Files we can't stat (permission errors, broken symlinks)
 * are silently dropped — the surrounding scan continues.
 */
export async function scanAudioFiles(folder: string): Promise<AudioFile[]> {
  const out: AudioFile[] = [];
  await walk(folder, out);
  return out;
}

async function walk(folder: string, out: AudioFile[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;
    try {
      const stat = await fs.stat(full);
      out.push({
        path: full,
        name: basename(full),
        sizeBytes: stat.size,
      });
    } catch {
      // unreadable file — skip
    }
  }
}
