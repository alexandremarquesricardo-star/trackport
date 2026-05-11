/**
 * PKCE primitives for Spotify Authorization Code with PKCE.
 *
 * Pure module — no Electron, no network, no filesystem. Lets us unit-test
 * the math without spinning up a window or hitting the real OAuth flow.
 *
 * Spec: RFC 7636. Spotify implements the standard variant — `S256` only
 * (plain method is allowed by the spec but Spotify won't accept it).
 */

import { createHash, randomBytes } from "node:crypto";

const VERIFIER_BYTE_LENGTH = 64; // → 86 base64url chars, well within 43-128 spec range
const STATE_BYTE_LENGTH = 24; // 32 base64url chars

/**
 * Encode a Buffer to base64url (RFC 4648 §5) — base64 with `+/=` replaced by
 * `-_` and the padding `=` stripped. Node has `base64url` as a built-in
 * encoding since Node 16, but doing it manually keeps the dependency surface
 * obvious for anyone reading.
 */
function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PkcePair {
  /** 86-char base64url-encoded random string. Sent to the token endpoint. */
  verifier: string;
  /** base64url(SHA256(verifier)). Sent in the authorize URL. */
  challenge: string;
}

/**
 * Generate a fresh PKCE verifier + challenge pair. Call once per auth
 * attempt; never reuse a verifier across attempts.
 */
export function generatePkcePair(): PkcePair {
  const verifier = base64url(randomBytes(VERIFIER_BYTE_LENGTH));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Random `state` parameter — protects against cross-origin callback
 * injection. Generate once per auth attempt; compare incoming callback's
 * `state` to the value we sent.
 */
export function generateState(): string {
  return base64url(randomBytes(STATE_BYTE_LENGTH));
}

/**
 * Build the Spotify authorize URL the user is sent to in their browser.
 * The redirect URI must exactly match one registered on the Spotify app.
 */
export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  challenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: opts.scopes.join(" "),
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    // `show_dialog=true` forces the consent screen even if the user has
    // approved before. Useful while iterating; flip to false later if it
    // bugs returning users.
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
