import { describe, expect, it } from "vitest";
import { bestFitForBounds, type Rect } from "./window";

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const SECONDARY: Rect = { x: 1920, y: 0, width: 2560, height: 1440 };

describe("bestFitForBounds", () => {
  it("returns null when no saved bounds exist", () => {
    expect(bestFitForBounds(null, [PRIMARY])).toBeNull();
  });

  it("returns null when no displays are connected", () => {
    const saved: Rect = { x: 100, y: 100, width: 800, height: 600 };
    expect(bestFitForBounds(saved, [])).toBeNull();
  });

  it("returns the saved rect when fully inside a display", () => {
    const saved: Rect = { x: 100, y: 100, width: 800, height: 600 };
    expect(bestFitForBounds(saved, [PRIMARY])).toEqual(saved);
  });

  it("returns the saved rect when partially overlapping a display by enough", () => {
    // 200px of overlap on each axis — well above the 100px minimum.
    const saved: Rect = { x: -600, y: -400, width: 800, height: 600 };
    expect(bestFitForBounds(saved, [PRIMARY])).toEqual(saved);
  });

  it("returns null when the rect lives on a now-disconnected monitor", () => {
    // Saved on the secondary monitor; user unplugged it before relaunch.
    const saved: Rect = { x: 2400, y: 200, width: 1200, height: 800 };
    expect(bestFitForBounds(saved, [PRIMARY])).toBeNull();
  });

  it("accepts the rect when one of multiple displays contains it", () => {
    const saved: Rect = { x: 2400, y: 200, width: 1200, height: 800 };
    expect(bestFitForBounds(saved, [PRIMARY, SECONDARY])).toEqual(saved);
  });

  it("rejects bounds smaller than the sanity minimum", () => {
    const tiny: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(bestFitForBounds(tiny, [PRIMARY])).toBeNull();
  });

  it("rejects bounds that overlap by less than the grab-margin threshold", () => {
    // Only 50px of titlebar is on-screen — too easy to lose the window.
    const saved: Rect = { x: 1870, y: 0, width: 800, height: 600 };
    expect(bestFitForBounds(saved, [PRIMARY])).toBeNull();
  });

  it("treats just-barely-overlapping (MIN_OVERLAP_PX) as still acceptable", () => {
    // Exactly 100px on each axis intersect with the primary display.
    const saved: Rect = { x: 1820, y: 0, width: 800, height: 600 };
    expect(bestFitForBounds(saved, [PRIMARY])).toEqual(saved);
  });
});
