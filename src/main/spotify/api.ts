/**
 * Direct Spotify Web API client. Replaces the previous broker round-trip:
 * with PKCE the desktop app holds a user token, so we can call Spotify's
 * endpoints directly without proxying through Railway.
 *
 * Same shape semantics as the broker's playlist module — the matcher
 * expects `SpotifyTrackMetadata[]`, and that contract stays put. Only the
 * transport changes.
 */

import type { SpotifyTrackMetadata } from "../../shared/match";
import type { SpotifyAuthController } from "./auth-controller";

const API_BASE = "https://api.spotify.com/v1";
const PAGE_SIZE = 100;
const MAX_PAGES = 100; // Spotify's hard playlist limit is 10 000 tracks

// Mirrors NormalizedTrack — see server/src/playlist.ts for the original.
// Sent as the `fields` parameter to keep response sizes small.
const TRACK_FIELDS =
  "items(track(id,name,type,duration_ms,external_ids(isrc),artists(name),album(name))),next";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_HOST_PATTERN = /^(open|play)\.spotify\.com$/i;

export type SpotifyApiErrorCode = "not_found" | "access_denied" | "api_error";

export class SpotifyApiError extends Error {
  constructor(
    public code: SpotifyApiErrorCode,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

/**
 * Extract the 22-char base62 playlist ID from URL / URI / raw ID.
 * Mirrors the broker's `parsePlaylistId` — same accepted forms.
 */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (PLAYLIST_ID_PATTERN.test(trimmed)) return trimmed;

  const uriMatch = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(trimmed);
  if (uriMatch) return uriMatch[1] ?? null;

  try {
    const url = new URL(trimmed);
    if (!SPOTIFY_HOST_PATTERN.test(url.hostname)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("playlist");
    if (idx === -1) return null;
    const candidate = segments[idx + 1];
    return candidate && PLAYLIST_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

interface SpotifyArtist {
  name: string;
}
interface SpotifyAlbum {
  name: string;
}
interface SpotifyTrack {
  id: string | null;
  name: string;
  type: "track" | "episode" | string;
  duration_ms: number;
  external_ids?: { isrc?: string };
  artists: SpotifyArtist[];
  album: SpotifyAlbum | null;
}
interface SpotifyPlaylistItem {
  track: SpotifyTrack | null;
}
interface SpotifyPlaylistTracksPage {
  items: SpotifyPlaylistItem[];
  next: string | null;
}

/**
 * Issue an authenticated request. On 401 we ask the auth controller for a
 * fresh token (which itself triggers a refresh) and retry once.
 *
 * 429 (rate limit): retry once after the `Retry-After` header, capped at
 * 10 s so a runaway value can't stall the whole flow.
 */
async function fetchAuthed(
  url: string,
  auth: SpotifyAuthController,
  attempt: { retriedAuth: boolean; retriedRate: boolean } = {
    retriedAuth: false,
    retriedRate: false,
  },
): Promise<Response> {
  const token = await auth.getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && !attempt.retriedAuth) {
    // Force a refresh by clearing cached access token — controller's
    // safety-margin check sees the missing/expired token and refreshes.
    // Simpler: just call getAccessToken again with a clamped expiry. We
    // do that by retrying — the next getAccessToken will refresh since
    // Spotify just told us the previous token is dead.
    return fetchAuthed(url, auth, { ...attempt, retriedAuth: true });
  }

  if (res.status === 429 && !attempt.retriedRate) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    const waitMs = Math.min(Math.max(retryAfter, 0), 10) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchAuthed(url, auth, { ...attempt, retriedRate: true });
  }

  return res;
}

function buildInitialUrl(playlistId: string): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    additional_types: "track",
    fields: TRACK_FIELDS,
  });
  return `${API_BASE}/playlists/${playlistId}/tracks?${params.toString()}`;
}

/** Pull the human-readable message out of Spotify's standard error envelope. */
function extractSpotifyMessage(rawBody: string): string {
  if (!rawBody) return "";
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message ?? "";
  } catch {
    return "";
  }
}

function normalizeItem(item: SpotifyPlaylistItem): SpotifyTrackMetadata | null {
  const t = item.track;
  if (!t || t.type !== "track" || !t.id) return null;
  const artists = t.artists.map((a) => a.name).filter((n): n is string => Boolean(n));
  return {
    spotifyId: t.id,
    title: t.name,
    artist: artists[0] ?? "",
    artists,
    album: t.album?.name ?? "",
    isrc: t.external_ids?.isrc ?? null,
    durationMs: t.duration_ms,
  };
}

export async function fetchPlaylistTracks(
  playlistId: string,
  auth: SpotifyAuthController,
): Promise<SpotifyTrackMetadata[]> {
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
    throw new SpotifyApiError("api_error", 400, `Invalid playlist ID: ${playlistId}`);
  }

  const tracks: SpotifyTrackMetadata[] = [];
  let url: string | null = buildInitialUrl(playlistId);
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res: Response = await fetchAuthed(url, auth);

    if (!res.ok) {
      const rawBody = await res.text().catch(() => "");
      const spotifyMessage = extractSpotifyMessage(rawBody);
      // Always carry SOMETHING diagnostic into the user-visible message —
      // Spotify's JSON message if parseable, otherwise a truncated body.
      const diagnostic =
        spotifyMessage || (rawBody ? `body: ${rawBody.slice(0, 200)}` : "(no body)");

      // Also log to the dev terminal so it's visible even before we
      // surface it cleanly in the UI. Includes full headers info that
      // helps distinguish scope/quota errors from real "not found".
      console.error(
        `[Spotify API] ${res.status} on ${url}\n  body: ${rawBody.slice(0, 500)}\n  www-authenticate: ${res.headers.get("www-authenticate") ?? "(none)"}`,
      );

      if (res.status === 404) {
        throw new SpotifyApiError(
          "not_found",
          404,
          `Playlist not found: ${playlistId} — ${diagnostic}`,
        );
      }
      if (res.status === 403) {
        throw new SpotifyApiError(
          "access_denied",
          403,
          `Spotify denied access to ${playlistId} — ${diagnostic}`,
        );
      }
      throw new SpotifyApiError(
        "api_error",
        res.status,
        `Spotify API error ${res.status} — ${diagnostic}`,
      );
    }

    const page = (await res.json()) as SpotifyPlaylistTracksPage;
    for (const item of page.items) {
      const n = normalizeItem(item);
      if (n) tracks.push(n);
    }

    url = page.next;
    pages += 1;
  }

  return tracks;
}
