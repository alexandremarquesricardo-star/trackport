import { useCallback, useRef, useState } from "react";
import type { MatchErrorCode, MatchResult } from "../../../shared/match";

/**
 * Two ways to feed the matcher:
 *
 *   - "url"  → Spotify playlist URL/URI/ID (requires Spotify connection)
 *   - "list" → freeform track list ("Artist - Title" per line, etc.) —
 *              parsed locally, no Spotify auth required
 *
 * Switching modes preserves both fields so the user can toggle freely
 * without losing typed input.
 */
export type MatchInputMode = "url" | "list";

/**
 * State machine for the Spotify playlist match dialog.
 *
 *   closed   — dialog hidden
 *   idle     — dialog open, input editable, no fetch yet
 *   loading  — request in flight; ignore further submits until it resolves
 *   results  — broker returned a match; render the lists
 *   error    — broker returned a known failure mode; render the message
 */
export type MatchDialogState =
  | { phase: "closed" }
  | { phase: "idle"; mode: MatchInputMode; ref: string; text: string }
  | { phase: "loading"; mode: MatchInputMode; ref: string; text: string }
  | {
      phase: "results";
      mode: MatchInputMode;
      ref: string;
      text: string;
      result: MatchResult;
    }
  | {
      phase: "error";
      mode: MatchInputMode;
      ref: string;
      text: string;
      code: MatchErrorCode;
      message: string;
    };

export interface UseSpotifyMatchResult {
  state: MatchDialogState;
  open: () => void;
  close: () => void;
  setMode: (mode: MatchInputMode) => void;
  setRef: (ref: string) => void;
  setText: (text: string) => void;
  /** Dispatch the right match call for the current mode. */
  match: () => Promise<void>;
}

const CLOSED: MatchDialogState = { phase: "closed" };

export function useSpotifyMatch(): UseSpotifyMatchResult {
  const [state, setState] = useState<MatchDialogState>(CLOSED);

  // Mirror so async callbacks can read fresh state without re-render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Sequence number so an in-flight fetch can't overwrite a newer one if
  // the user clicks Match twice or closes/reopens mid-request.
  const seqRef = useRef(0);

  const open = useCallback((): void => {
    setState({ phase: "idle", mode: "url", ref: "", text: "" });
  }, []);

  const close = useCallback((): void => {
    seqRef.current += 1;
    setState(CLOSED);
  }, []);

  const setMode = useCallback((mode: MatchInputMode): void => {
    setState((prev) => (prev.phase === "closed" ? prev : { ...prev, mode }));
  }, []);

  const setRef = useCallback((ref: string): void => {
    setState((prev) => (prev.phase === "closed" ? prev : { ...prev, ref }));
  }, []);

  const setText = useCallback((text: string): void => {
    setState((prev) => (prev.phase === "closed" ? prev : { ...prev, text }));
  }, []);

  const match = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.phase === "closed" || current.phase === "loading") return;

    const input = current.mode === "url" ? current.ref.trim() : current.text;
    if (input.trim().length === 0) return;

    seqRef.current += 1;
    const seq = seqRef.current;

    setState({ phase: "loading", mode: current.mode, ref: current.ref, text: current.text });

    const outcome =
      current.mode === "url"
        ? await window.api.library.matchAgainstSpotify(input)
        : await window.api.library.matchAgainstText(input);

    if (seq !== seqRef.current) return;

    setState((prev) => {
      if (prev.phase !== "loading") return prev;
      const base = { mode: prev.mode, ref: prev.ref, text: prev.text };
      if (outcome.ok) {
        return { phase: "results", ...base, result: outcome.result };
      }
      return {
        phase: "error",
        ...base,
        code: outcome.code,
        message: outcome.message,
      };
    });
  }, []);

  return { state, open, close, setMode, setRef, setText, match };
}
