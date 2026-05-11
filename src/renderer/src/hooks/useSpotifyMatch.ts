import { useCallback, useRef, useState } from "react";
import type { MatchErrorCode, MatchResult } from "../../../shared/match";

/**
 * State machine for the Spotify playlist match dialog.
 *
 *   closed   — dialog hidden
 *   idle     — dialog open, URL input editable, no fetch yet
 *   loading  — request in flight; ignore further submits until it resolves
 *   results  — broker returned a match; render the lists
 *   error    — broker returned a known failure mode; render the message
 *
 * `ref` is preserved across phase transitions so the user can edit and retry
 * without retyping the URL after an error or after viewing results.
 */
export type MatchDialogState =
  | { phase: "closed" }
  | { phase: "idle"; ref: string }
  | { phase: "loading"; ref: string }
  | { phase: "results"; ref: string; result: MatchResult }
  | { phase: "error"; ref: string; code: MatchErrorCode; message: string };

export interface UseSpotifyMatchResult {
  state: MatchDialogState;
  open: () => void;
  close: () => void;
  setRef: (ref: string) => void;
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
    setState({ phase: "idle", ref: "" });
  }, []);

  const close = useCallback((): void => {
    // Bump seq so any in-flight resolve becomes a no-op.
    seqRef.current += 1;
    setState(CLOSED);
  }, []);

  const setRef = useCallback((ref: string): void => {
    setState((prev) => (prev.phase === "closed" ? prev : { ...prev, ref }));
  }, []);

  const match = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (current.phase === "closed" || current.phase === "loading") return;
    const trimmed = current.ref.trim();
    if (trimmed.length === 0) return;

    seqRef.current += 1;
    const seq = seqRef.current;

    setState({ phase: "loading", ref: current.ref });

    const outcome = await window.api.library.matchAgainstSpotify(trimmed);

    // Drop the result if the user has since closed the dialog or fired
    // another match.
    if (seq !== seqRef.current) return;

    setState((prev) => {
      if (prev.phase !== "loading") return prev;
      if (outcome.ok) {
        return { phase: "results", ref: prev.ref, result: outcome.result };
      }
      return { phase: "error", ref: prev.ref, code: outcome.code, message: outcome.message };
    });
  }, []);

  return { state, open, close, setRef, match };
}
