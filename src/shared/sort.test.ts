import { describe, expect, it } from "vitest";
import { compareNatural } from "./sort";

describe("compareNatural", () => {
  it("treats embedded digits as numbers, not codepoints", () => {
    const sorted = ["01 Track", "10 Track", "02 Track"].sort(compareNatural);
    expect(sorted).toEqual(["01 Track", "02 Track", "10 Track"]);
  });

  it("orders single-digit files without leading zeros correctly", () => {
    const sorted = ["Track 10", "Track 2", "Track 1"].sort(compareNatural);
    expect(sorted).toEqual(["Track 1", "Track 2", "Track 10"]);
  });

  it("is case-insensitive", () => {
    expect(compareNatural("Album", "album")).toBe(0);
    expect(compareNatural("ABBA", "abba")).toBe(0);
  });

  it("preserves alphabetic order between numeric clusters", () => {
    const sorted = ["B 02", "A 10", "B 01", "A 02"].sort(compareNatural);
    expect(sorted).toEqual(["A 02", "A 10", "B 01", "B 02"]);
  });

  it("handles paths with multiple numeric segments", () => {
    const sorted = [
      "/music/Album 10/01 Song.mp3",
      "/music/Album 2/01 Song.mp3",
      "/music/Album 2/10 Song.mp3",
      "/music/Album 2/02 Song.mp3",
    ].sort(compareNatural);
    expect(sorted).toEqual([
      "/music/Album 2/01 Song.mp3",
      "/music/Album 2/02 Song.mp3",
      "/music/Album 2/10 Song.mp3",
      "/music/Album 10/01 Song.mp3",
    ]);
  });

  it("returns 0 for identical strings", () => {
    expect(compareNatural("foo", "foo")).toBe(0);
  });

  it("handles empty strings", () => {
    expect(compareNatural("", "")).toBe(0);
    expect(compareNatural("", "a")).toBeLessThan(0);
    expect(compareNatural("a", "")).toBeGreaterThan(0);
  });
});
