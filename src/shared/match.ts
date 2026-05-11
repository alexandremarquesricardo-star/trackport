/**
 * Filename-based Spotify ↔ local library matcher.
 *
 * Constraint: the cached library index only carries filesystem metadata
 * (`{ path, name, sizeBytes, mtimeMs }`), not ID3 tags. So we have to infer
 * artist/title candidates from the filename and its parent-directory chain,
 * then fuzzy-match against Spotify's normalized metadata.
 *
 * The algorithm is intentionally simple and dependency-free:
 *
 *   1. Normalize both sides (lowercase, strip diacritics + punctuation, drop
 *      parenthetical/bracketed groups like "(Remastered 2020)", drop
 *      featuring artists, collapse whitespace).
 *   2. For each library track, derive a candidate { artist, title } pair
 *      from the filename pattern. Three patterns are recognized; we pick the
 *      first one that fits.
 *   3. Score each Spotify track against every library track using a
 *      weighted blend of title token-set ratio (0.75) and artist token-set
 *      ratio (0.25). Title dominates because filenames are reliably about
 *      the song; artist information is often missing or split across
 *      parent-folder names that don't match Spotify's canonical artist.
 *   4. Anything scoring above MATCH_THRESHOLD (0.78) is matched; otherwise
 *      it's missing, with the best near-miss attached for UX ("did you
 *      mean…?").
 *
 * The 0.78 threshold was picked empirically — high enough to reject
 * coincidences ("Hello" ↔ "Hello, Goodbye"), low enough to forgive the
 * common cases (apostrophe drops, parenthetical noise, featuring artist
 * placement, mild typos).
 *
 * No external dependency. Token-set ratio is computed directly so the
 * matcher stays auditable and the renderer can ship without a fuzzy-match
 * library.
 */

const MATCH_THRESHOLD = 0.78;
const TITLE_WEIGHT = 0.75;
const ARTIST_WEIGHT = 0.25;

/** Trimmed Spotify metadata — mirrors the broker's `/spotify/playlist` shape. */
export interface SpotifyTrackMetadata {
  spotifyId: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  isrc: string | null;
  durationMs: number;
}

/** Input track from the local library cache, plus library root for path math. */
export interface LibraryTrackInput {
  path: string;
  name: string;
}

/**
 * A library track with parsed title + a set of artist candidates ready to
 * score. We carry multiple artist candidates because the filename pattern
 * alone is ambiguous: `Queen/Greatest Hits/03 - Bohemian Rhapsody.mp3` has
 * the album in the parent dir and the artist in the grandparent. The
 * scorer takes the best match across all candidates.
 */
export interface ParsedLibraryTrack {
  path: string;
  name: string;
  candidateTitle: string;
  candidateArtists: string[];
}

export interface MatchedPair {
  spotify: SpotifyTrackMetadata;
  library: { path: string; name: string };
  /** Combined title+artist score in [0, 1]. */
  score: number;
}

export interface MissingTrack {
  spotify: SpotifyTrackMetadata;
  /** Best score found across the library, even if below threshold. */
  bestScore: number;
  /** The library track that came closest. Null when the library is empty. */
  bestCandidate: { path: string; name: string } | null;
}

export interface MatchResult {
  matched: MatchedPair[];
  missing: MissingTrack[];
  /** Total Spotify tracks examined (matched.length + missing.length). */
  totalSpotifyTracks: number;
  /** Total library tracks considered. Useful for UX context. */
  totalLibraryTracks: number;
}

/**
 * Normalize a string for comparison: lowercase, strip diacritics, drop
 * parenthetical/bracketed groups, drop featuring-artist suffixes, drop
 * punctuation, collapse whitespace.
 *
 * Idempotent — running it twice on the same input is identical to running
 * it once.
 */
export function normalize(input: string): string {
  if (!input) return "";

  let s = input.toLowerCase();

  // Strip diacritics: decompose, then drop combining marks. Handles
  // beyoncé → beyonce, mötley → motley, café → cafe.
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Drop bracketed / parenthetical groups: "(Remastered 2020)",
  // "[Bonus Track]", "{Live}". Single pass — nested groups aren't a real
  // concern for music titles.
  s = s.replace(/[([{][^)\]}]*[)\]}]/g, " ");

  // Drop featuring-artist suffixes. Spotify usually splits these into the
  // `artists` array, but filenames bake them into the title. Order matters
  // (longest first) so we don't half-match "feat." inside "featuring".
  s = s.replace(/\b(featuring|feat\.?|ft\.?|with)\b.*$/i, " ");

  // Replace "&" with "and" so "florence & the machine" matches "florence and
  // the machine". Do it before stripping punctuation.
  s = s.replace(/&/g, " and ");

  // Apostrophes get DROPPED (no space) so "don't" → "dont", not "don t".
  // ASCII ' and the common smart-quote variants ʼ ' ' both qualify.
  s = s.replace(/[''ʼ`]/g, "");

  // Drop everything else that isn't alnum or whitespace.
  s = s.replace(/[^a-z0-9\s]+/g, " ");

  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/** Split a normalized string into tokens for set comparison. Empty in → []. */
function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

/**
 * Sørensen–Dice coefficient over token sets. `2|A∩B| / (|A| + |B|)`,
 * range [0, 1]. Robust to word reordering and to extra noise tokens — a
 * good shape for music titles where "Live Acoustic Version" might appear
 * on one side and not the other.
 *
 * Both inputs must already be normalized.
 */
export function tokenSetRatio(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  return (2 * intersection) / (tokensA.size + tokensB.size);
}

const AUDIO_EXT_PATTERN = /\.(mp3|m4a|aac|flac|wav|ogg|opus|wma)$/i;
const TRACK_NUMBER_PREFIX_PATTERN = /^\s*\d+\s*[-._\s]\s*/;

function stripExtension(name: string): string {
  return name.replace(AUDIO_EXT_PATTERN, "");
}

function ancestorDirNames(path: string): { parent: string; grandparent: string } {
  // Cross-platform — split on both separators so the matcher doesn't care
  // whether it's running against win32 paths or posix paths.
  const segments = path.split(/[\\/]/).filter(Boolean);
  // segments[last] is the file; back off from there.
  return {
    parent: segments.length >= 2 ? (segments[segments.length - 2] ?? "") : "",
    grandparent: segments.length >= 3 ? (segments[segments.length - 3] ?? "") : "",
  };
}

/**
 * Derive candidate `{ artists[], title }` from a library track's filename
 * and its parent + grandparent directories. Three filename patterns are
 * recognized for the title:
 *
 *   1. `Artist - Title.ext`        — split on " - " in the filename
 *   2. `## - Title.ext`            — track-number prefix; strip it
 *   3. `Title.ext`                 — use the full stem
 *
 * Artist candidates are layered: filename-derived (if pattern 1) + parent
 * dir + grandparent dir. The scorer picks the best across all of them
 * against all of Spotify's artists, so any single noisy candidate (album
 * name in parent, library root in grandparent) can't push a true match
 * below threshold by itself.
 */
export function parseLibraryTrack(track: LibraryTrackInput): ParsedLibraryTrack {
  const stem = stripExtension(track.name);
  const { parent, grandparent } = ancestorDirNames(track.path);

  let candidateTitle = stem;
  const candidateArtists: string[] = [];

  // Pattern 1: "Artist - Title". Recognise " - " as canonical; tolerate
  // " — " (em-dash) and " – " (en-dash) since some rippers use them. Avoid
  // matching a stray hyphen inside a track-number prefix by requiring a
  // space on each side and rejecting strings that start with `## - `.
  const dashSplit = stem.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2 && dashSplit[0] && !TRACK_NUMBER_PREFIX_PATTERN.test(stem)) {
    candidateArtists.push(dashSplit[0]);
    candidateTitle = dashSplit.slice(1).join(" - ");
  } else {
    // Pattern 2: track-number prefix ("01 - ..." / "01. ..." / "01_...").
    // Strip it; the parent/grandparent supply the artist signal.
    candidateTitle = stem.replace(TRACK_NUMBER_PREFIX_PATTERN, "");
    // Pattern 3 falls out naturally — title stays = stripped stem.
  }

  if (parent) candidateArtists.push(parent);
  if (grandparent) candidateArtists.push(grandparent);

  return {
    path: track.path,
    name: track.name,
    candidateTitle,
    candidateArtists,
  };
}

/**
 * Score a Spotify track against a parsed library track. Returns a value in
 * [0, 1]. Title weighted at 0.75, artist at 0.25.
 *
 * Both inputs are normalized inside the function — callers can pass raw
 * Spotify metadata and raw parsed candidates.
 */
export function scoreMatch(spotify: SpotifyTrackMetadata, library: ParsedLibraryTrack): number {
  const titleScore = tokenSetRatio(normalize(spotify.title), normalize(library.candidateTitle));

  // Best score across (every Spotify artist × every library artist
  // candidate). Spotify often splits collaborations into multiple artists;
  // filenames often credit only one. Library candidates cover the
  // filename's artist-half (if any), the parent dir, and the grandparent
  // dir. Taking the max across both axes catches every common layout.
  const spotifyArtists = spotify.artists.length > 0 ? spotify.artists : [spotify.artist];
  let artistScore = 0;
  for (const spotifyArtist of spotifyArtists) {
    const a = normalize(spotifyArtist);
    for (const libraryArtist of library.candidateArtists) {
      const s = tokenSetRatio(a, normalize(libraryArtist));
      if (s > artistScore) artistScore = s;
    }
  }

  return TITLE_WEIGHT * titleScore + ARTIST_WEIGHT * artistScore;
}

/**
 * Match a playlist's worth of Spotify tracks against the local library.
 * For each Spotify track, finds the best-scoring library track. Anything
 * scoring at or above MATCH_THRESHOLD is a match; otherwise it's missing,
 * with the best near-miss attached.
 *
 * O(spotify × library) — fine up to roughly 10k × 50k. If we ever need to
 * go bigger, build an inverted index over title tokens first.
 */
export function matchPlaylist(
  spotifyTracks: readonly SpotifyTrackMetadata[],
  libraryTracks: readonly LibraryTrackInput[],
): MatchResult {
  const parsed = libraryTracks.map(parseLibraryTrack);

  const matched: MatchedPair[] = [];
  const missing: MissingTrack[] = [];

  for (const spotify of spotifyTracks) {
    // Start at -1 so the very first library track wins regardless of its
    // score. End state: bestParsed = the highest-scoring library track,
    // even if its score is 0. This way the missing-track UX can always
    // surface a "closest entry in your library" hint, except when the
    // library is genuinely empty (loop never runs).
    let bestScore = -1;
    let bestParsed: ParsedLibraryTrack | null = null;
    for (const lib of parsed) {
      const score = scoreMatch(spotify, lib);
      if (score > bestScore) {
        bestScore = score;
        bestParsed = lib;
        if (score >= 1) break; // perfect match — nothing can beat it
      }
    }

    if (bestParsed && bestScore >= MATCH_THRESHOLD) {
      matched.push({
        spotify,
        library: { path: bestParsed.path, name: bestParsed.name },
        score: bestScore,
      });
    } else {
      missing.push({
        spotify,
        // Clamp -1 (empty library) back to 0 so the field stays in [0,1].
        bestScore: Math.max(0, bestScore),
        bestCandidate: bestParsed ? { path: bestParsed.path, name: bestParsed.name } : null,
      });
    }
  }

  return {
    matched,
    missing,
    totalSpotifyTracks: spotifyTracks.length,
    totalLibraryTracks: libraryTracks.length,
  };
}

/** Exposed for tests + future tuning UI. */
export const MATCH_INTERNALS = {
  MATCH_THRESHOLD,
  TITLE_WEIGHT,
  ARTIST_WEIGHT,
} as const;

/**
 * Error codes for the `library.matchAgainstSpotify` IPC. Surfaced to the
 * renderer in a discriminated outcome (see `MatchOutcome`) so the UI can
 * branch on `code` without parsing message strings or relying on Electron
 * preserving custom error prototypes across the IPC boundary (it doesn't).
 */
export type MatchErrorCode =
  | "no_library" // user hasn't picked a music library yet
  | "invalid_ref" // playlist URL/URI/ID couldn't be parsed
  | "not_found" // Spotify returned 404 for the playlist
  | "access_denied" // playlist is private / region-locked for the broker
  | "broker_error" // broker returned an unexpected non-OK response
  | "network_error" // couldn't reach the broker at all
  | "timeout"; // broker took too long to respond

export type MatchOutcome =
  | { ok: true; result: MatchResult }
  | { ok: false; code: MatchErrorCode; message: string };
