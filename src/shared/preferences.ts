/**
 * Shared types for the persistent preferences layer.
 *
 * Today this is just per-device profile choices. The same store will host
 * remembered library roots, last-used folders per device, and UI prefs in
 * later iterations — all keyed under the same JSON file.
 */

export interface PreferencesApi {
  /** Resolves to the stored profile id for a device, or `null` if untouched. */
  getDeviceProfile: (deviceId: string) => Promise<string | null>;
  /** Persists the user's profile choice for a specific device. */
  setDeviceProfile: (deviceId: string, profileId: string) => Promise<void>;
}
