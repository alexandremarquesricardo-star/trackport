import { describe, expect, it } from "vitest";
import {
  MATCH_INTERNALS,
  matchPlaylist,
  normalize,
  parseLibraryTrack,
  parseTrackList,
  scoreMatch,
  tokenSetRatio,
  type LibraryTrackInput,
  type SpotifyTrackMetadata,
} from "./match";

function spotify(
  partial: Partial<SpotifyTrackMetadata> & Pick<SpotifyTrackMetadata, "title" | "artist">,
): SpotifyTrackMetadata {
  return {
    spotifyId: partial.spotifyId ?? "id_" + partial.title,
    title: partial.title,
    artist: partial.artist,
    artists: partial.artists ?? [partial.artist],
    album: partial.album ?? "",
    isrc: partial.isrc ?? null,
    durationMs: partial.durationMs ?? 0,
  };
}

describe("normalize", () => {
  it("lowercases", () => {
    expect(normalize("BlInDiNg LiGhTs")).toBe("blinding lights");
  });

  it("strips diacritics", () => {
    expect(normalize("Beyoncé")).toBe("beyonce");
    expect(normalize("Mötley Crüe")).toBe("motley crue");
    expect(normalize("Café del Mar")).toBe("cafe del mar");
  });

  it("drops parenthetical groups", () => {
    expect(normalize("Bohemian Rhapsody (Remastered 2011)")).toBe("bohemian rhapsody");
    expect(normalize("Hello [Bonus Track]")).toBe("hello");
    expect(normalize("Yesterday {Live}")).toBe("yesterday");
  });

  it("drops featuring-artist suffixes", () => {
    expect(normalize("Old Town Road feat. Billy Ray Cyrus")).toBe("old town road");
    expect(normalize("Stay ft. Justin Bieber")).toBe("stay");
    expect(normalize("Forever featuring Drake")).toBe("forever");
    expect(normalize("Empire State of Mind with Alicia Keys")).toBe("empire state of mind");
  });

  it("expands & to and", () => {
    expect(normalize("Florence & The Machine")).toBe("florence and the machine");
  });

  it("strips punctuation", () => {
    expect(normalize("Don't Stop Me Now")).toBe("dont stop me now");
    expect(normalize("Hello, Goodbye!")).toBe("hello goodbye");
  });

  it("collapses whitespace", () => {
    expect(normalize("  too    much   space  ")).toBe("too much space");
  });

  it("is idempotent", () => {
    const input = "Beyoncé feat. JAY-Z (Live at Coachella)";
    expect(normalize(normalize(input))).toBe(normalize(input));
  });

  it("handles empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("tokenSetRatio", () => {
  it("returns 1 for identical strings", () => {
    expect(tokenSetRatio("blinding lights", "blinding lights")).toBe(1);
  });

  it("returns 0 for disjoint strings", () => {
    expect(tokenSetRatio("foo bar", "baz qux")).toBe(0);
  });

  it("scales with overlap", () => {
    // {one, two, three} ∩ {two, three, four} = {two, three}, sizes 3 + 3 = 6
    // → 2 * 2 / 6 = 0.666...
    const score = tokenSetRatio("one two three", "two three four");
    expect(score).toBeCloseTo(2 / 3, 5);
  });

  it("is order-insensitive", () => {
    expect(tokenSetRatio("a b c", "c b a")).toBe(1);
  });

  it("treats duplicate tokens as one (set semantics)", () => {
    // Set semantics: "yeah yeah yeah" reduces to {yeah}.
    expect(tokenSetRatio("yeah yeah yeah", "yeah")).toBe(1);
  });

  it("handles empty inputs symmetrically", () => {
    expect(tokenSetRatio("", "")).toBe(1);
    expect(tokenSetRatio("a", "")).toBe(0);
    expect(tokenSetRatio("", "a")).toBe(0);
  });
});

describe("parseLibraryTrack", () => {
  it('recognises "Artist - Title.mp3" and exposes the filename artist first', () => {
    const t: LibraryTrackInput = {
      path: "C:/music/The Weeknd - Blinding Lights.mp3",
      name: "The Weeknd - Blinding Lights.mp3",
    };
    const parsed = parseLibraryTrack(t);
    expect(parsed.candidateArtists).toContain("The Weeknd");
    expect(parsed.candidateTitle).toBe("Blinding Lights");
  });

  it("tolerates em-dash and en-dash separators", () => {
    const em = parseLibraryTrack({
      path: "/music/Adele — Hello.mp3",
      name: "Adele — Hello.mp3",
    });
    expect(em.candidateArtists).toContain("Adele");
    expect(em.candidateTitle).toBe("Hello");

    const en = parseLibraryTrack({
      path: "/music/Adele – Hello.mp3",
      name: "Adele – Hello.mp3",
    });
    expect(en.candidateArtists).toContain("Adele");
    expect(en.candidateTitle).toBe("Hello");
  });

  it("strips track-number prefix and exposes parent + grandparent as artist candidates", () => {
    const t = parseLibraryTrack({
      path: "C:/music/The Weeknd/After Hours/01 - Blinding Lights.mp3",
      name: "01 - Blinding Lights.mp3",
    });
    expect(t.candidateArtists).toContain("After Hours");
    expect(t.candidateArtists).toContain("The Weeknd");
    expect(t.candidateTitle).toBe("Blinding Lights");
  });

  it("handles dot-and-underscore track-number variants", () => {
    expect(
      parseLibraryTrack({
        path: "/music/Artist/Album/05. Track.mp3",
        name: "05. Track.mp3",
      }).candidateTitle,
    ).toBe("Track");

    expect(
      parseLibraryTrack({
        path: "/music/Artist/Album/12_Track.mp3",
        name: "12_Track.mp3",
      }).candidateTitle,
    ).toBe("Track");
  });

  it("falls back to parent + grandparent for artist when filename has no separator", () => {
    const t = parseLibraryTrack({
      path: "/music/Daft Punk/Discovery/One More Time.mp3",
      name: "One More Time.mp3",
    });
    expect(t.candidateArtists).toContain("Daft Punk");
    expect(t.candidateArtists).toContain("Discovery");
    expect(t.candidateTitle).toBe("One More Time");
  });

  it("handles Windows-style paths", () => {
    const t = parseLibraryTrack({
      path: "D:\\Music\\Radiohead\\OK Computer\\Paranoid Android.mp3",
      name: "Paranoid Android.mp3",
    });
    expect(t.candidateArtists).toContain("Radiohead");
    expect(t.candidateArtists).toContain("OK Computer");
    expect(t.candidateTitle).toBe("Paranoid Android");
  });

  it("strips audio extensions", () => {
    for (const ext of ["mp3", "m4a", "flac", "wav", "aac", "ogg", "opus", "wma"]) {
      const t = parseLibraryTrack({
        path: `/music/Artist/Album/Song.${ext}`,
        name: `Song.${ext}`,
      });
      expect(t.candidateTitle).toBe("Song");
    }
  });
});

describe("scoreMatch", () => {
  it("scores a clean filename match at or near 1.0", () => {
    const score = scoreMatch(
      spotify({ title: "Blinding Lights", artist: "The Weeknd" }),
      parseLibraryTrack({
        path: "/music/The Weeknd - Blinding Lights.mp3",
        name: "The Weeknd - Blinding Lights.mp3",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("survives parenthetical noise in the filename", () => {
    const score = scoreMatch(
      spotify({ title: "Bohemian Rhapsody", artist: "Queen" }),
      parseLibraryTrack({
        path: "/music/Queen - Bohemian Rhapsody (Remastered 2011).mp3",
        name: "Queen - Bohemian Rhapsody (Remastered 2011).mp3",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("survives featuring-artist drift between Spotify and the filename", () => {
    const score = scoreMatch(
      spotify({
        title: "Old Town Road",
        artist: "Lil Nas X",
        artists: ["Lil Nas X", "Billy Ray Cyrus"],
      }),
      parseLibraryTrack({
        path: "/music/Lil Nas X - Old Town Road feat. Billy Ray Cyrus.mp3",
        name: "Lil Nas X - Old Town Road feat. Billy Ray Cyrus.mp3",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("matches when a featured artist is the only artist credit in the filename", () => {
    // Filename only credits the featured artist (some rippers do this). The
    // scorer compares against every artist in `artists[]`, so the match
    // should still land.
    const score = scoreMatch(
      spotify({
        title: "Empire State of Mind",
        artist: "JAY-Z",
        artists: ["JAY-Z", "Alicia Keys"],
      }),
      parseLibraryTrack({
        path: "/music/Alicia Keys - Empire State of Mind.mp3",
        name: "Alicia Keys - Empire State of Mind.mp3",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("scores low for unrelated tracks", () => {
    const score = scoreMatch(
      spotify({ title: "Blinding Lights", artist: "The Weeknd" }),
      parseLibraryTrack({
        path: "/music/Beatles - Yesterday.mp3",
        name: "Beatles - Yesterday.mp3",
      }),
    );
    expect(score).toBeLessThan(0.3);
  });
});

describe("matchPlaylist", () => {
  const library: LibraryTrackInput[] = [
    {
      path: "C:/music/The Weeknd - Blinding Lights.mp3",
      name: "The Weeknd - Blinding Lights.mp3",
    },
    {
      path: "C:/music/Queen/Greatest Hits/03 - Bohemian Rhapsody.mp3",
      name: "03 - Bohemian Rhapsody.mp3",
    },
    {
      path: "C:/music/Beatles - Yesterday.mp3",
      name: "Beatles - Yesterday.mp3",
    },
  ];

  it("matches the three known tracks", () => {
    const result = matchPlaylist(
      [
        spotify({ title: "Blinding Lights", artist: "The Weeknd" }),
        spotify({ title: "Bohemian Rhapsody", artist: "Queen" }),
        spotify({ title: "Yesterday", artist: "The Beatles" }),
      ],
      library,
    );
    expect(result.matched).toHaveLength(3);
    expect(result.missing).toHaveLength(0);
    expect(result.totalSpotifyTracks).toBe(3);
    expect(result.totalLibraryTracks).toBe(3);
  });

  it("flags an unknown track as missing with a low best score", () => {
    const result = matchPlaylist(
      [spotify({ title: "Some Obscure B-side", artist: "Nobody" })],
      library,
    );
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]?.bestScore).toBeLessThan(MATCH_INTERNALS.MATCH_THRESHOLD);
  });

  it("attaches the best near-miss to missing tracks", () => {
    // Title is close enough to score high on title but artist is wildly
    // different — should land just below threshold (or wherever) but with a
    // non-null best candidate so the UI can offer a "did you mean?" hint.
    const result = matchPlaylist(
      [spotify({ title: "Definitely Not In Library", artist: "Phantom" })],
      library,
    );
    expect(result.missing[0]?.bestCandidate).not.toBeNull();
  });

  it("returns an empty result for an empty playlist", () => {
    const result = matchPlaylist([], library);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.totalSpotifyTracks).toBe(0);
  });

  it("flags everything missing for an empty library", () => {
    const result = matchPlaylist([spotify({ title: "Anything", artist: "Anyone" })], []);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]?.bestCandidate).toBeNull();
    expect(result.totalLibraryTracks).toBe(0);
  });
});

describe("parseTrackList", () => {
  it("parses 'Artist - Title' lines", () => {
    const parsed = parseTrackList("The Weeknd - Blinding Lights\nQueen - Bohemian Rhapsody");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ artist: "The Weeknd", title: "Blinding Lights" });
    expect(parsed[1]).toMatchObject({ artist: "Queen", title: "Bohemian Rhapsody" });
  });

  it("tolerates em- and en-dash separators", () => {
    const parsed = parseTrackList("Adele — Hello\nAdele – Rolling in the Deep");
    expect(parsed[0]?.artist).toBe("Adele");
    expect(parsed[0]?.title).toBe("Hello");
    expect(parsed[1]?.artist).toBe("Adele");
    expect(parsed[1]?.title).toBe("Rolling in the Deep");
  });

  it("recognises 'Title by Artist' natural-language form", () => {
    const parsed = parseTrackList("Yesterday by The Beatles");
    expect(parsed[0]).toMatchObject({ title: "Yesterday", artist: "The Beatles" });
  });

  it("strips numbered-list prefixes", () => {
    const parsed = parseTrackList(
      "1. Queen - Bohemian Rhapsody\n2) Adele - Hello\n3: Drake - Hotline Bling",
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ artist: "Queen", title: "Bohemian Rhapsody" });
    expect(parsed[1]).toMatchObject({ artist: "Adele", title: "Hello" });
    expect(parsed[2]).toMatchObject({ artist: "Drake", title: "Hotline Bling" });
  });

  it("parses tab-separated lines", () => {
    const parsed = parseTrackList("The Beatles\tYesterday");
    expect(parsed[0]).toMatchObject({ artist: "The Beatles", title: "Yesterday" });
  });

  it("accepts bare titles when no separator is present", () => {
    const parsed = parseTrackList("Imagine\nBohemian Rhapsody");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ artist: "", title: "Imagine" });
    expect(parsed[1]).toMatchObject({ artist: "", title: "Bohemian Rhapsody" });
  });

  it("only splits on the first dash so titles with dashes stay intact", () => {
    const parsed = parseTrackList("The Killers - Mr. Brightside - Live");
    expect(parsed[0]).toMatchObject({
      artist: "The Killers",
      title: "Mr. Brightside - Live",
    });
  });

  it("drops blank lines and comment lines starting with #", () => {
    const parsed = parseTrackList("# My playlist\n\nQueen - Bohemian Rhapsody\n\n# end");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("Bohemian Rhapsody");
  });

  it("strips markdown bullet markers and surrounding quotes", () => {
    const parsed = parseTrackList(
      '- Queen - Bohemian Rhapsody\n* Adele - Hello\n• Drake - Hotline Bling\n"The Beatles - Yesterday"',
    );
    expect(parsed).toHaveLength(4);
    expect(parsed.map((p) => p.artist)).toEqual(["Queen", "Adele", "Drake", "The Beatles"]);
  });

  it("returns an empty array on empty input", () => {
    expect(parseTrackList("")).toEqual([]);
    expect(parseTrackList("   \n   \n")).toEqual([]);
  });

  it("synthesises unique IDs for duplicate lines", () => {
    const parsed = parseTrackList("Queen - Bohemian Rhapsody\nQueen - Bohemian Rhapsody");
    expect(parsed[0]?.spotifyId).not.toBe(parsed[1]?.spotifyId);
  });

  it("synthesises stable IDs across re-parses of the same input", () => {
    const a = parseTrackList("Queen - Bohemian Rhapsody");
    const b = parseTrackList("Queen - Bohemian Rhapsody");
    expect(a[0]?.spotifyId).toBe(b[0]?.spotifyId);
  });
});
