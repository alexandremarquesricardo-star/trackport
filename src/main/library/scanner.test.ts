import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { incrementalScan, tracksToAudioFiles, type ScanResult } from "./scanner";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "trackport-scanner-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function touch(relativePath: string, contents = "x"): Promise<string> {
  const full = join(root, relativePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents);
  return full;
}

/**
 * Bump the mtime of `path` by adding `seconds` to its current value. Many
 * filesystems have second-level (FAT) or sub-second (NTFS, ext4) mtime
 * resolution; nudging by 2+ seconds keeps the test independent of FS
 * granularity.
 */
async function bumpMtime(path: string, seconds: number): Promise<void> {
  const s = await stat(path);
  const futureMs = s.mtimeMs + seconds * 1000;
  const futureS = futureMs / 1000;
  await utimes(path, futureS, futureS);
}

describe("incrementalScan — initial scans", () => {
  it("returns empty tracks for an empty directory", async () => {
    const out = await incrementalScan(root, null);
    expect(out.tracks).toEqual([]);
    expect(out.dirMtimes[root]).toBeTypeOf("number");
  });

  it("indexes audio files in the root directory", async () => {
    await touch("a.mp3");
    await touch("b.flac");
    const out = await incrementalScan(root, null);
    expect(out.tracks.map((t) => t.name).sort()).toEqual(["a.mp3", "b.flac"]);
  });

  it("skips non-audio files", async () => {
    await touch("a.mp3");
    await touch("readme.txt");
    await touch("cover.jpg");
    const out = await incrementalScan(root, null);
    expect(out.tracks.map((t) => t.name)).toEqual(["a.mp3"]);
  });

  it("skips hidden (dot-prefixed) entries", async () => {
    await touch("a.mp3");
    await touch(".hidden.mp3");
    await mkdir(join(root, ".trash"), { recursive: true });
    await touch(".trash/skipme.mp3");
    const out = await incrementalScan(root, null);
    expect(out.tracks.map((t) => t.name)).toEqual(["a.mp3"]);
  });

  it("recurses into subdirectories", async () => {
    await touch("Album A/01.mp3");
    await touch("Album A/02.mp3");
    await touch("Album B/01.flac");
    const out = await incrementalScan(root, null);
    expect(out.tracks.map((t) => t.name).sort()).toEqual(["01.flac", "01.mp3", "02.mp3"]);
  });

  it("returns tracks in stable path-sorted order", async () => {
    await touch("z.mp3");
    await touch("a.mp3");
    await touch("m.mp3");
    const out = await incrementalScan(root, null);
    expect(out.tracks.map((t) => t.name)).toEqual(["a.mp3", "m.mp3", "z.mp3"]);
  });

  it("sets sizeBytes and mtimeMs on each track", async () => {
    await touch("a.mp3", "twelve bytes");
    const out = await incrementalScan(root, null);
    expect(out.tracks[0].sizeBytes).toBe("twelve bytes".length);
    expect(out.tracks[0].mtimeMs).toBeGreaterThan(0);
  });
});

describe("incrementalScan — cache reuse on second scan", () => {
  it("reuses the exact same TrackEntry objects when no directory mtimes have changed", async () => {
    await touch("a.mp3");
    await touch("Album/01.mp3");
    const first = await incrementalScan(root, null);

    const second = await incrementalScan(root, first);

    // Same set of tracks
    expect(second.tracks.map((t) => t.path).sort()).toEqual(first.tracks.map((t) => t.path).sort());
    // Critically: referential equality. The cheap path returns the cached
    // objects directly without re-stating, so identity is preserved.
    for (const t of first.tracks) {
      expect(second.tracks).toContain(t);
    }
  });

  it("picks up a new file in the root directory on the next scan", async () => {
    await touch("a.mp3");
    const first = await incrementalScan(root, null);

    // Wait a tick + bump mtimes so dir mtime changes (FS granularity).
    await touch("b.mp3");
    await bumpMtime(root, 2);

    const second = await incrementalScan(root, first);
    expect(second.tracks.map((t) => t.name).sort()).toEqual(["a.mp3", "b.mp3"]);
  });

  it("drops a file that was deleted between scans", async () => {
    const aPath = await touch("a.mp3");
    await touch("b.mp3");
    const first = await incrementalScan(root, null);

    await rm(aPath);
    await bumpMtime(root, 2);

    const second = await incrementalScan(root, first);
    expect(second.tracks.map((t) => t.name)).toEqual(["b.mp3"]);
  });

  it("re-stats files in a changed dir but reuses the cached entry when mtime+size match", async () => {
    const aPath = await touch("Album/a.mp3");
    await touch("Album/b.mp3");
    const first = await incrementalScan(root, null);

    // Add a non-audio file in the album dir — bumps its mtime but doesn't
    // touch the audio files. The cached audio entries should be reused
    // verbatim.
    await touch("Album/cover.jpg");
    await bumpMtime(join(root, "Album"), 2);

    const second = await incrementalScan(root, first);
    const cachedA = first.tracks.find((t) => t.path === aPath);
    const newA = second.tracks.find((t) => t.path === aPath);
    expect(newA).toBe(cachedA); // same object
  });

  it("re-reads a file whose mtime advanced even when size is unchanged", async () => {
    const aPath = await touch("a.mp3", "same-size-content");
    const first = await incrementalScan(root, null);

    // Bump file mtime; bump dir mtime so we hit the expensive path. Then
    // verify the new TrackEntry has the new mtime.
    await bumpMtime(aPath, 5);
    await bumpMtime(root, 2);

    const second = await incrementalScan(root, first);
    const cachedA = first.tracks.find((t) => t.path === aPath);
    const newA = second.tracks.find((t) => t.path === aPath);
    expect(newA).not.toBe(cachedA);
    expect(newA?.mtimeMs).toBeGreaterThan(cachedA?.mtimeMs ?? 0);
  });
});

describe("incrementalScan — degenerate inputs", () => {
  it("returns empty when the root doesn't exist", async () => {
    const out = await incrementalScan(join(root, "does-not-exist"), null);
    expect(out.tracks).toEqual([]);
    expect(Object.keys(out.dirMtimes)).toEqual([]);
  });

  it("returns empty when given a file path instead of a directory", async () => {
    const filePath = await touch("a.mp3");
    const out = await incrementalScan(filePath, null);
    expect(out.tracks).toEqual([]);
  });
});

describe("tracksToAudioFiles", () => {
  it("strips mtimeMs and preserves path/name/sizeBytes", () => {
    const tracks: ScanResult["tracks"] = [
      { path: "/a/b.mp3", name: "b.mp3", sizeBytes: 100, mtimeMs: 12345 },
    ];
    const audio = tracksToAudioFiles(tracks);
    expect(audio).toEqual([{ path: "/a/b.mp3", name: "b.mp3", sizeBytes: 100 }]);
  });
});
