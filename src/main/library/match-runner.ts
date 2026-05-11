/**
 * Orchestrates the Spotify playlist → local library match.
 *
 * Calls the public broker (the Hono server on Railway) to fetch the
 * playlist's normalized tracks, then runs the pure matcher
 * (`src/shared/match.ts`) against the cached library index. The renderer
 * never talks to the broker directly — main process owns the network call
 * so the renderer stays sandboxed and CORS-free.
 *
 * Output is a discriminated `MatchOutcome`. Throwing across the Electron
 * IPC boundary would lose the custom error subclass; structured cloning
 * keeps the {ok, code, message} shape intact for renderer-side branching.
 */

import {
  matchPlaylist,
  type MatchErrorCode,
  type MatchOutcome,
  type SpotifyTrackMetadata,
} from "../../shared/match";
import type { LibraryStore } from "./store";

const DEFAULT_BROKER_URL = "https://trackport-server-production.up.railway.app";
const FETCH_TIMEOUT_MS = 30_000;

/** Override for local development against a non-prod broker. */
function brokerUrl(): string {
  return process.env.TRACKPORT_BROKER_URL ?? DEFAULT_BROKER_URL;
}

interface BrokerSuccessResponse {
  ok: true;
  playlistId: string;
  trackCount: number;
  tracks: SpotifyTrackMetadata[];
}

interface BrokerErrorResponse {
  ok: false;
  error: string;
  playlistId?: string;
  message?: string;
}

type BrokerResponse = BrokerSuccessResponse | BrokerErrorResponse;

function mapBrokerError(error: string): MatchErrorCode {
  switch (error) {
    case "invalid_ref":
    case "missing_ref":
      return "invalid_ref";
    case "not_found":
      return "not_found";
    case "access_denied":
      return "access_denied";
    default:
      return "broker_error";
  }
}

/** Either the parsed track list or a renderer-shaped failure outcome. */
type FetchResult =
  | { ok: true; tracks: SpotifyTrackMetadata[] }
  | { ok: false; outcome: MatchOutcome };

async function fetchPlaylistTracks(ref: string): Promise<FetchResult> {
  const url = `${brokerUrl()}/spotify/playlist?ref=${encodeURIComponent(ref)}`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      outcome: {
        ok: false,
        code: isAbort ? "timeout" : "network_error",
        message: isAbort
          ? `Broker request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
          : `Couldn't reach the broker: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  let body: BrokerResponse;
  try {
    body = (await res.json()) as BrokerResponse;
  } catch {
    return {
      ok: false,
      outcome: {
        ok: false,
        code: "broker_error",
        message: `Broker returned non-JSON (HTTP ${res.status})`,
      },
    };
  }

  if (body.ok) {
    if (!Array.isArray(body.tracks)) {
      return {
        ok: false,
        outcome: {
          ok: false,
          code: "broker_error",
          message: "Broker response missing tracks array",
        },
      };
    }
    return { ok: true, tracks: body.tracks };
  }

  return {
    ok: false,
    outcome: {
      ok: false,
      code: mapBrokerError(body.error),
      message: body.message ?? `Broker error: ${body.error}`,
    },
  };
}

/**
 * Public entry point. Fetches the playlist from the broker and matches it
 * against the user's library. Never throws — every failure is reported as
 * `{ ok: false, code, message }`.
 */
export async function matchAgainstSpotify(
  playlistRef: string,
  libraryStore: LibraryStore,
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

  const fetched = await fetchPlaylistTracks(playlistRef);
  if (!fetched.ok) return fetched.outcome;

  const libraryTracks = libraryStore.getTracks();
  const result = matchPlaylist(fetched.tracks, libraryTracks);
  return { ok: true, result };
}
