import { useCallback, useEffect, useState } from "react";
import type { SpotifyAuthState } from "../../../shared/spotify";

const LOADING: SpotifyAuthState = { phase: "authenticating" };

export interface UseSpotifyAuthResult {
  /**
   * Current auth state. Starts as "authenticating" while the initial
   * `getState()` round-trip is in flight; settles into one of the
   * terminal phases as soon as main responds.
   */
  state: SpotifyAuthState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Subscribes to the main process's Spotify auth state. The state machine
 * is owned by SpotifyAuthController in main; we just mirror it here so
 * the UI can show the right affordances.
 */
export function useSpotifyAuth(): UseSpotifyAuthResult {
  const [state, setState] = useState<SpotifyAuthState>(LOADING);

  useEffect(() => {
    let cancelled = false;
    void window.api.spotifyAuth.getState().then((s) => {
      if (!cancelled) setState(s);
    });
    const unsubscribe = window.api.spotifyAuth.onChange((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    // The main process pushes intermediate states via `onChange`, so we
    // don't strictly need the resolved value here. Keeping the await
    // makes the promise chain explicit for callers that want to know
    // when the flow finished.
    await window.api.spotifyAuth.connect();
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    await window.api.spotifyAuth.disconnect();
  }, []);

  return { state, connect, disconnect };
}
