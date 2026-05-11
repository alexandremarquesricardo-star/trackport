import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildAuthorizeUrl, generatePkcePair, generateState } from "./pkce";

describe("generatePkcePair", () => {
  it("produces an 86-char base64url verifier", () => {
    const { verifier } = generatePkcePair();
    expect(verifier).toHaveLength(86);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a 43-char base64url challenge (SHA256 digest size)", () => {
    const { challenge } = generatePkcePair();
    expect(challenge).toHaveLength(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("challenge is SHA256(verifier) base64url-encoded", () => {
    const { verifier, challenge } = generatePkcePair();
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("returns a different pair on each call", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("generateState", () => {
  it("produces a 32-char base64url string", () => {
    const s = generateState();
    expect(s).toHaveLength(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a different value on each call", () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe("buildAuthorizeUrl", () => {
  const sample = {
    clientId: "abc123",
    redirectUri: "http://127.0.0.1:13738/callback",
    scopes: ["playlist-read-private", "user-library-read"] as const,
    state: "S".repeat(32),
    challenge: "C".repeat(43),
  };

  it("targets the Spotify accounts authorize endpoint", () => {
    const url = new URL(buildAuthorizeUrl(sample));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
  });

  it("carries the required parameters", () => {
    const url = new URL(buildAuthorizeUrl(sample));
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:13738/callback");
    expect(url.searchParams.get("state")).toBe(sample.state);
    expect(url.searchParams.get("code_challenge")).toBe(sample.challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("joins scopes with spaces", () => {
    const url = new URL(buildAuthorizeUrl(sample));
    expect(url.searchParams.get("scope")).toBe("playlist-read-private user-library-read");
  });
});
