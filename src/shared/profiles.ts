/**
 * Device profiles encode device-specific knowledge so the user doesn't have
 * to. A profile carries the supported audio formats, the approximate
 * capacity, and a few known quirks (playback ordering, folder support).
 *
 * Profiles are static today. A future iteration will allow user-defined
 * profiles and a server-published catalog so new devices can land without
 * an app update.
 */

export interface DeviceProfileQuirks {
  /**
   * The device plays files in the order they were transmitted, not in
   * filename / metadata order. Shokz OpenSwim and OpenSwim Pro behave this
   * way — copying a playlist out of order produces shuffle-on-playback.
   * When set, the executor copies files one at a time, fsyncs after each
   * write, and waits `transmissionTimeOrderDelayMs` between files so the
   * device-side filesystem records distinct transmission timestamps.
   */
  transmissionTimeOrder?: boolean;
  /**
   * Inter-file delay (ms) to enforce when transmissionTimeOrder is set.
   * USB MSC writes are buffered on the device; without a small gap, two
   * files can land with the same effective timestamp and the device's sort
   * becomes unstable. 150 ms is enough on every Shokz model we've tested
   * and adds <8 s overhead on a 50-track playlist.
   */
  transmissionTimeOrderDelayMs?: number;
  /** Device respects folder hierarchy. */
  folders?: boolean;
}

export interface DeviceProfile {
  id: string;
  label: string;
  description: string;
  /** Approximate manufacturer-stated capacity. `null` when unknown / variable. */
  capacityBytes: number | null;
  /** Lower-case file extensions including the leading dot. */
  supportedExtensions: readonly string[];
  quirks: DeviceProfileQuirks;
}

const GB = 1024 ** 3;

export const PROFILES: readonly DeviceProfile[] = [
  {
    id: "generic-usb",
    label: "Generic USB drive",
    description: "Unrestricted — copies any audio format we recognize.",
    capacityBytes: null,
    supportedExtensions: [
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
    ],
    quirks: { folders: true },
  },
  {
    id: "generic-mp3-only",
    label: "MP3-only (max compatibility)",
    description: "Skips WAV / FLAC / lossless. Smallest payload, plays everywhere.",
    capacityBytes: null,
    supportedExtensions: [".mp3"],
    quirks: { folders: true },
  },
  {
    id: "shokz-openswim-pro",
    label: "Shokz OpenSwim Pro",
    description: "Bone-conduction swim headphones · 32 GB",
    capacityBytes: 32 * GB,
    supportedExtensions: [".mp3", ".flac", ".wav", ".aac", ".m4a", ".ape", ".wma"],
    quirks: { transmissionTimeOrder: true, folders: false },
  },
  {
    id: "shokz-openswim",
    label: "Shokz OpenSwim (original / Xtrainerz)",
    description: "Bone-conduction swim headphones · 4 GB",
    capacityBytes: 4 * GB,
    supportedExtensions: [".mp3", ".wma"],
    quirks: { transmissionTimeOrder: true, folders: false },
  },
  {
    id: "finis-duo",
    label: "FINIS Duo",
    description: "Bone-conduction swim headphones · 4 GB · MP3 / WMA only",
    capacityBytes: 4 * GB,
    supportedExtensions: [".mp3", ".wma"],
    quirks: { folders: true },
  },
];

export const DEFAULT_PROFILE_ID = "generic-usb";

export function getProfile(id: string): DeviceProfile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}

/**
 * Best-guess profile based on the device label the OS reports. Falls back to
 * "generic-usb" so we never block a sync on a misdetect — the user can
 * always override.
 */
export function autoDetectProfile(deviceLabel: string): string {
  const label = deviceLabel.toLowerCase();
  if (label.includes("openswim pro") || label.includes("swim pro")) {
    return "shokz-openswim-pro";
  }
  if (label.includes("openswim") || label.includes("xtrainerz") || label.includes("shokz")) {
    return "shokz-openswim";
  }
  if (label.includes("finis") || label.includes("duo")) {
    return "finis-duo";
  }
  return DEFAULT_PROFILE_ID;
}
