// Spotify playlist track fetcher.
//
// Parses any of the three playlist references Spotify hands users (web URL,
// URI, raw ID), paginates through /v1/playlists/{id}/tracks, and returns a
// trimmed metadata-only shape the desktop matcher can compare against the
// local library. We aggressively use the `fields` parameter so each page is
// ~10x smaller than Spotify's default response.

import { getAccessToken } from "./spotify.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const PAGE_SIZE = 100; // max allowed by Spotify
const MAX_PAGES = 100; // safety cap — 10 000 tracks, Spotify's playlist limit

// Spotify parses `fields` strictly; don't sloppily edit. Mirrors NormalizedTrack.
const TRACK_FIELDS =
  "items(track(id,name,type,duration_ms,external_ids(isrc),artists(name),album(name))),next";

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_HOST_PATTERN = /^(open|play)\.spotify\.com$/i;

export interface NormalizedTrack {
  spotifyId: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  isrc: string | null;
  durationMs: number;
}

export class PlaylistRefError extends Error {
  constructor(public ref: string) {
    super(`Could not parse a Spotify playlist reference from input`);
    this.name = "PlaylistRefError";
  }
}

export class PlaylistNotFoundError extends Error {
  constructor(public playlistId: string) {
    super(`Spotify playlist not found: ${playlistId}`);
    this.name = "PlaylistNotFoundError";
  }
}

export class PlaylistAccessError extends Error {
  constructor(public playlistId: string) {
    super(`No access to playlist ${playlistId} (private or region-locked)`);
    this.name = "PlaylistAccessError";
  }
}

export class SpotifyApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Spotify API request failed (${status})`);
    this.name = "SpotifyApiError";
  }
}

/**
 * Extracts a 22-char base62 playlist ID from any of:
 *   - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc
 *   - https://open.spotify.com/intl-pt/playlist/37i9dQZF1DXcBWIGoYBM5M
 *   - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 *   - 37i9dQZF1DXcBWIGoYBM5M
 *
 * Returns null when the input doesn't contain a recognisable playlist id.
 */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (PLAYLIST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const uriMatch = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(trimmed);
  if (uriMatch) {
    return uriMatch[1] ?? null;
  }

  try {
    const url = new URL(trimmed);
    if (!SPOTIFY_HOST_PATTERN.test(url.hostname)) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const playlistIdx = segments.indexOf("playlist");
    if (playlistIdx === -1) return null;
    const candidate = segments[playlistIdx + 1];
    if (candidate && PLAYLIST_ID_PATTERN.test(candidate)) {
      return candidate;
    }
    return null;
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

async function fetchAuthed(url: string, attempt = 0): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Rate-limit: retry once with Retry-After. Capped at 10s so a runaway
  // header value (or hostile proxy) can't stall the request indefinitely.
  if (res.status === 429 && attempt === 0) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
    const waitMs = Math.min(Math.max(retryAfter, 0), 10) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchAuthed(url, attempt + 1);
  }

  return res;
}

function buildInitialUrl(playlistId: string): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    additional_types: "track",
    fields: TRACK_FIELDS,
  });
  return `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?${params.toString()}`;
}

function normalizeItem(item: SpotifyPlaylistItem): NormalizedTrack | null {
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

export async function fetchPlaylistTracks(playlistId: string): Promise<NormalizedTrack[]> {
  if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
    throw new PlaylistRefError(playlistId);
  }

  const tracks: NormalizedTrack[] = [];
  let url: string | null = buildInitialUrl(playlistId);
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res: Response = await fetchAuthed(url);

    if (res.status === 404) throw new PlaylistNotFoundError(playlistId);
    if (res.status === 403) throw new PlaylistAccessError(playlistId);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SpotifyApiError(res.status, body.slice(0, 500));
    }

    const page = (await res.json()) as SpotifyPlaylistTracksPage;
    for (const item of page.items) {
      const normalized = normalizeItem(item);
      if (normalized) tracks.push(normalized);
    }

    url = page.next;
    pages += 1;
  }

  return tracks;
}
