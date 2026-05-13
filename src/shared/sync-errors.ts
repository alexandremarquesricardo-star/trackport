/**
 * Translates raw Node errno errors into user-facing messages, actionable
 * hints, and FAQ anchor links. The executor catches errors from copyFile,
 * fsync, unlink, etc.; this module decides how each errno surfaces in the
 * UI.
 *
 * The FAQ anchors point at `<details id="...">` blocks on trackport.app's
 * troubleshooting section. The renderer composes
 * `https://trackport.app/#<helpAnchor>` for the "Why?" link.
 *
 * Keep this aligned with the troubleshooting section on the site — if you
 * add an entry there, add an anchor here so the in-app error can deep-link
 * to it.
 */

export interface ErrnoHint {
  /** Short, user-facing reason. Includes the errno tag in parens for techies. */
  message: string;
  /** One-sentence "what to do" guidance. Optional — some errors are self-explanatory. */
  hint?: string;
  /** Anchor on trackport.app/#... pointing at the relevant FAQ entry. */
  helpAnchor?: string;
}

interface ErrnoEntry {
  message: string;
  hint?: string;
  helpAnchor?: string;
}

const TABLE: Record<string, ErrnoEntry> = {
  EPERM: {
    message: "Device is read-only or refused the write",
    hint: "Usually means Windows mounted the device read-only after a dirty unmount. Eject the device, re-plug it, and retry. If it keeps happening, run chkdsk on the device drive.",
    helpAnchor: "eperm",
  },
  EACCES: {
    message: "Permission denied writing to the device",
    hint: "The drive may be read-only, or another program is holding files open. Close any Explorer / Finder windows showing the device and retry.",
    helpAnchor: "eperm",
  },
  EROFS: {
    message: "Device became read-only mid-sync",
    hint: "Eject and re-plug the device. If the problem persists, run chkdsk on the device drive.",
    helpAnchor: "eperm",
  },
  EBUSY: {
    message: "File on the device is locked",
    hint: "Another program is holding the file open. Close any Explorer / Finder windows showing the device and retry.",
    helpAnchor: "eperm",
  },
  ENOENT: {
    message: "Source file moved or deleted",
    hint: "The file in your library was renamed or removed between scan and copy. Re-scan the library and retry.",
  },
  ENAMETOOLONG: {
    message: "Filename too long for the device's filesystem",
    hint: "FAT32 / exFAT cap filenames at 255 characters. Rename the source file and retry.",
    helpAnchor: "finis-formats",
  },
  EINVAL: {
    message: "Device rejected the write",
    hint: "Usually a filesystem incompatibility — check the device profile matches what the device actually expects.",
    helpAnchor: "finis-formats",
  },
  EIO: {
    message: "Hardware I/O error",
    hint: "The device may have been disconnected mid-sync, or its storage is failing. Re-plug and retry.",
    helpAnchor: "device-not-recognized",
  },
  ENOSPC: {
    message: "Device full",
    hint: "Reduce the source size or use a Smart Fit strategy in preflight to drop oversized files.",
  },
};

/**
 * Translate an arbitrary error (typically a NodeJS.ErrnoException from
 * fs/promises) into something we can show a user. Unknown errors fall back
 * to the raw message with the "Error:" prefix stripped.
 */
export function translateSyncError(err: unknown): ErrnoHint {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code && TABLE[code]) {
    const entry = TABLE[code];
    return {
      message: `${entry.message} (${code})`,
      hint: entry.hint,
      helpAnchor: entry.helpAnchor,
    };
  }
  const raw = err instanceof Error ? err.message.replace(/^Error:\s*/, "") : String(err);
  return { message: raw };
}

/**
 * Same translation, applied directly to an errno code string. Used by the
 * fatal-error path in the executor where we already have the code in hand
 * and don't need to re-parse the Error object.
 */
export function hintForErrno(code: string): ErrnoHint | null {
  const entry = TABLE[code];
  if (!entry) return null;
  return {
    message: entry.message,
    hint: entry.hint,
    helpAnchor: entry.helpAnchor,
  };
}
