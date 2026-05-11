/**
 * Persistent storage for the Spotify refresh token.
 *
 * Threat model: the refresh token is a bearer credential that grants
 * indefinite access to the user's playlists + library. We don't want it
 * sitting on disk in plaintext, where any other process running as the
 * user could grep it out. Electron's `safeStorage` API uses the OS
 * keychain (DPAPI on Windows, Keychain on macOS, libsecret on Linux),
 * which means decryption is bound to the user's login session.
 *
 * When `safeStorage` reports it can't encrypt (typically a Linux box
 * with no keyring daemon), we refuse to persist rather than silently
 * writing the token in the clear. The user can still use the app for
 * one session; they just have to reconnect every time they relaunch.
 */

import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

const FILE_NAME = "spotify-auth.bin";

export class AuthStore {
  private filePath(): string {
    return join(app.getPath("userData"), FILE_NAME);
  }

  /** Whether we can actually persist tokens on this machine. */
  canPersist(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Read the stored refresh token. Returns null on ENOENT, on decryption
   * failure (corrupt file or migrated keychain entry), or when the store
   * can't decrypt at all.
   */
  async readRefreshToken(): Promise<string | null> {
    if (!this.canPersist()) return null;
    try {
      const encrypted = await fs.readFile(this.filePath());
      const decrypted = safeStorage.decryptString(encrypted);
      return decrypted.length > 0 ? decrypted : null;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        console.warn("[AuthStore] failed to read token:", err);
      }
      return null;
    }
  }

  /** Encrypt + write the refresh token. Atomic rename to avoid torn writes. */
  async writeRefreshToken(token: string): Promise<void> {
    if (!this.canPersist()) {
      throw new Error("safeStorage is not available; refusing to persist token in cleartext");
    }
    const encrypted = safeStorage.encryptString(token);
    const path = this.filePath();
    const tmp = `${path}.tmp`;
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(tmp, encrypted);
    await fs.rename(tmp, path);
  }

  /** Remove the stored token. No-op if nothing exists. */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath());
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        console.warn("[AuthStore] failed to clear token:", err);
      }
    }
  }
}
