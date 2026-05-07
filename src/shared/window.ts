/**
 * Shared types + pure helpers for window-state persistence.
 *
 * Lives in `shared/` so it's importable by both the main process (which
 * actually applies the bounds via Electron's BrowserWindow) and a vitest
 * suite (which exercises the validation logic against synthetic display
 * geometry, no Electron required).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  /**
   * Last-known unmaximized bounds. `null` until the user has actually
   * moved/resized the window — first launch falls back to the
   * BrowserWindow defaults.
   */
  bounds: Rect | null;
  isMaximized: boolean;
}

/** Empty/default state, used as the load-failure fallback. */
export const EMPTY_WINDOW_STATE: WindowState = { bounds: null, isMaximized: false };

/** Saved bounds smaller than this are treated as bogus and discarded. */
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

/** A saved rect must overlap a display by at least this on each axis. */
const MIN_OVERLAP_PX = 100;

/**
 * Decide whether saved bounds are still safe to use given the currently
 * connected displays.
 *
 * Returns the saved rect when it overlaps any display by at least
 * MIN_OVERLAP_PX on each axis (so a bit of titlebar is always grabbable
 * with the mouse), otherwise `null` so the caller falls back to defaults.
 *
 * Why this matters: a user can save bounds on a 4K external monitor,
 * unplug it, relaunch on the laptop's built-in display, and find the
 * window opening at coordinates the desktop no longer has. Without this
 * check, the window is invisible and the user thinks the app is broken.
 */
export function bestFitForBounds(saved: Rect | null, displays: readonly Rect[]): Rect | null {
  if (!saved) return null;
  if (saved.width < MIN_WIDTH || saved.height < MIN_HEIGHT) return null;
  if (displays.length === 0) return null;
  const usable = displays.some((d) => overlapsByAtLeast(saved, d, MIN_OVERLAP_PX));
  return usable ? saved : null;
}

function overlapsByAtLeast(a: Rect, b: Rect, minPx: number): boolean {
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapW >= minPx && overlapH >= minPx;
}
