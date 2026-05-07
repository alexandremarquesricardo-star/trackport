import { describe, expect, it } from "vitest";
import { computeFit, computeFitSuggestions } from "./fit";
import type { AudioFile } from "./sync";

function file(name: string, sizeBytes: number): AudioFile {
  return { path: `/m/${name}`, name, sizeBytes };
}

const MB = 1024 * 1024;

describe("computeFit — first-fit", () => {
  it("returns everything when total fits", () => {
    const files = [file("a", 10 * MB), file("b", 20 * MB)];
    const out = computeFit(files, 100 * MB, "first-fit");
    expect(out.keptFiles).toEqual(files);
    expect(out.droppedFiles).toEqual([]);
  });

  it("greedily fills up to the budget in order, dropping the rest", () => {
    const files = [file("a", 30 * MB), file("b", 50 * MB), file("c", 30 * MB)];
    const out = computeFit(files, 60 * MB, "first-fit");
    // a fits (30), b doesn't fit (30+50 > 60), but c does fit (30+30 ≤ 60)
    expect(out.keptFiles.map((f) => f.name)).toEqual(["a", "c"]);
    expect(out.droppedFiles.map((f) => f.name)).toEqual(["b"]);
  });

  it("preserves input order in both kept and dropped", () => {
    const files = [file("a", 50 * MB), file("b", 50 * MB), file("c", 50 * MB)];
    const out = computeFit(files, 60 * MB, "first-fit");
    expect(out.keptFiles.map((f) => f.name)).toEqual(["a"]);
    expect(out.droppedFiles.map((f) => f.name)).toEqual(["b", "c"]);
  });

  it("returns nothing kept when even the first file is too large", () => {
    const out = computeFit([file("huge", 100 * MB)], 50 * MB, "first-fit");
    expect(out.keptFiles).toEqual([]);
    expect(out.droppedFiles.map((f) => f.name)).toEqual(["huge"]);
  });
});

describe("computeFit — drop-largest", () => {
  it("returns everything when total fits", () => {
    const files = [file("a", 10 * MB), file("b", 20 * MB)];
    const out = computeFit(files, 100 * MB, "drop-largest");
    expect(out.keptFiles).toEqual(files);
    expect(out.droppedFiles).toEqual([]);
  });

  it("drops the heaviest file first until the rest fits", () => {
    const files = [file("small", 10 * MB), file("huge", 100 * MB), file("mid", 30 * MB)];
    // Total 140 MB, budget 50 MB. Drop "huge" → 40 MB, which fits.
    const out = computeFit(files, 50 * MB, "drop-largest");
    expect(out.keptFiles.map((f) => f.name)).toEqual(["small", "mid"]);
    expect(out.droppedFiles.map((f) => f.name)).toEqual(["huge"]);
  });

  it("preserves the natural-sort order of remaining tracks", () => {
    // Verifies the bug fix where drop-largest used to scramble order.
    const files = [
      file("01-a", 10 * MB),
      file("02-b", 90 * MB), // largest, will be dropped
      file("03-c", 10 * MB),
      file("04-d", 10 * MB),
    ];
    const out = computeFit(files, 40 * MB, "drop-largest");
    expect(out.keptFiles.map((f) => f.name)).toEqual(["01-a", "03-c", "04-d"]);
  });

  it("drops multiple files when one isn't enough", () => {
    const files = [file("a", 50 * MB), file("b", 50 * MB), file("c", 50 * MB), file("d", 50 * MB)];
    // Total 200 MB, budget 60 MB. Need to drop 3 files (3*50=150 > 200-60).
    const out = computeFit(files, 60 * MB, "drop-largest");
    expect(out.keptFiles.length).toBe(1);
    expect(out.droppedFiles.length).toBe(3);
  });
});

describe("computeFitSuggestions", () => {
  it("returns empty when files already fit", () => {
    const files = [file("a", 10 * MB)];
    expect(computeFitSuggestions(files, 100 * MB)).toEqual([]);
  });

  it("returns empty for an empty file list", () => {
    expect(computeFitSuggestions([], 100 * MB)).toEqual([]);
  });

  it("returns both first-fit and drop-largest suggestions when over budget", () => {
    const files = [file("a", 30 * MB), file("b", 50 * MB), file("c", 30 * MB)];
    const suggestions = computeFitSuggestions(files, 60 * MB);
    const ids = suggestions.map((s) => s.strategy);
    expect(ids).toContain("first-fit");
    expect(ids).toContain("drop-largest");
  });

  it("populates droppedFiles so the UI can preview without re-running computeFit", () => {
    const files = [file("a", 30 * MB), file("b", 50 * MB), file("c", 30 * MB)];
    const suggestions = computeFitSuggestions(files, 60 * MB);
    for (const s of suggestions) {
      expect(s.droppedFiles.length).toBe(s.droppedCount);
      const dropped = s.droppedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      expect(dropped).toBe(s.droppedBytes);
    }
  });

  it("collapses to a kept-empty set when budget is smaller than the smallest file", () => {
    // Both strategies will end up keeping nothing. That technically "fits"
    // (0 ≤ 50 MB) — the UI's job to surface that as "not useful," not the
    // pure logic's. Documenting the contract here so a future change that
    // tries to make `fits` mean "produces non-empty result" lands as an
    // intentional decision, not an accidental one.
    const files = [file("tiny", 100 * MB), file("huge", 200 * MB)];
    const suggestions = computeFitSuggestions(files, 50 * MB);
    for (const s of suggestions) {
      expect(s.keptCount).toBe(0);
    }
  });

  it("computes labels and descriptions reflecting the actual outcome", () => {
    const files = [file("a", 30 * MB), file("b", 50 * MB), file("c", 30 * MB)];
    const suggestions = computeFitSuggestions(files, 60 * MB);
    const firstFit = suggestions.find((s) => s.strategy === "first-fit");
    expect(firstFit?.label).toMatch(/Sync first \d+/);
    expect(firstFit?.description).toContain("Frees");
  });
});
