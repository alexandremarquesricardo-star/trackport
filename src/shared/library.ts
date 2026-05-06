/**
 * Shared types for the library — a persistent "this is where my music
 * lives" pointer plus cached aggregate stats. v0.9 supports a single
 * library root; multi-root and per-track metadata land in later
 * iterations. The store survives across launches in library.json under
 * the OS userData directory.
 *
 * The renderer never reads file lists from the library directly — when
 * the user clicks "Sync library", the planner is given library.root as
 * its source folder and re-scans on demand. Cached stats here are for
 * UI display only (track count + total size in the header chrome), not
 * for the sync pipeline's source of truth.
 */

export interface Library {
  /** Absolute path to the library root folder. */
  root: string;
  /** ISO-8601 timestamp of when the user added this library. */
  addedAt: string;
  /** ISO-8601 timestamp of the most recent scan, or null if never scanned. */
  lastScannedAt: string | null;
  /** Cached number of audio files at last scan. */
  trackCount: number;
  /** Cached sum of file sizes (bytes) at last scan. */
  totalBytes: number;
}

export interface LibraryApi {
  /** Resolves to the stored library, or null if none is set. */
  get: () => Promise<Library | null>;
  /**
   * Open a folder picker, set the picked folder as the library root, and
   * trigger an initial scan. Resolves to the new library, or null if the
   * user cancelled the picker.
   */
  add: () => Promise<Library | null>;
  /** Forget the library entirely. */
  remove: () => Promise<void>;
  /**
   * Re-scan the existing library root and update cached stats. Resolves
   * to the updated library, or null if no library is set.
   */
  rescan: () => Promise<Library | null>;
}
