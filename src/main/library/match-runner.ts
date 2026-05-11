/**
 * Orchestrates the Spotify playlist → local library match.
 *
 * Calls Spotify's Web API directly using a user token from the
 * SpotifyAuthController, then runs the pure matcher
 * (`src/shared/match.ts`) against the cached library index.
 *
 * The renderer never touches Spotify directly — main process owns the
 * network calls and the token. Renderer + preload stay sandboxed.
 *
 * Output is a discriminated `MatchOutcome` so the IPC boundary doesn't
 * have to preserve custom error subclasses (Electron's structured clone
 * doesn't).
 */

import { matchPlaylist, type MatchOutcome } from "../../shared/match";
import { fetchPlaylistTracks, parsePlaylistId, SpotifyApiError } from "../spotify/api";
import type { SpotifyAuthController } from "../spotify/auth-controller";
import type { LibraryStore } from "./store";

/**
 * Public entry point. Validates inputs, fetches the playlist via Spotify,
 * and runs the matcher. Never throws — every failure is reported as
 * `{ ok: false, code, message }`.
 */
export async function matchAgainstSpotify(
  playlistRef: string,
  libraryStore: LibraryStore,
  auth: SpotifyAuthController,
): Promise<MatchOutcome> {
  if (typeof playlistRef !== "string" || playlistRef.trim().length === 0) {
    return {
      ok: false,
      code: "invalid_ref",
      message: "Playlist reference must be a non-empty string",
    };
  }

  const library = libraryStore.get();
  if (!library) {
    return { ok: false, code: "no_library", message: "No music library is set" };
  }

  const playlistId = parsePlaylistId(playlistRef);
  if (!playlistId) {
    return {
      ok: false,
      code: "invalid_ref",
      message: "Couldn't extract a Spotify playlist ID from that reference",
    };
  }

  const authState = auth.publicState();
  if (authState.phase !== "connected") {
    return {
      ok: false,
      code: "no_auth",
      message: "Connect Spotify before matching a playlist",
    };
  }

  let tracks;
  try {
    tracks = await fetchPlaylistTracks(playlistId, auth);
  } catch (err) {
    if (err instanceof SpotifyApiError) {
      return { ok: false, code: err.code, message: err.message };
    }
    // A thrown Error here typically means the refresh-token call failed —
    // the controller has already cleared persisted state in that case.
    if (err instanceof Error && /refresh/i.test(err.message)) {
      return { ok: false, code: "auth_expired", message: err.message };
    }
    return {
      ok: false,
      code: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const libraryTracks = libraryStore.getTracks();
  const result = matchPlaylist(tracks, libraryTracks);
  return { ok: true, result };
}
