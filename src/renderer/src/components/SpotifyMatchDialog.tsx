import { useEffect, useRef } from "react";
import "./SpotifyMatchDialog.css";
import { useDialogShortcuts } from "../hooks/useDialogShortcuts";
import type { MatchDialogState } from "../hooks/useSpotifyMatch";
import type { MatchErrorCode, MatchResult, MissingTrack } from "../../../shared/match";
import type { SpotifyAuthState } from "../../../shared/spotify";

interface Props {
  state: MatchDialogState;
  authState: SpotifyAuthState;
  onClose: () => void;
  onSetRef: (ref: string) => void;
  onMatch: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function SpotifyMatchDialog({
  state,
  authState,
  onClose,
  onSetRef,
  onMatch,
  onConnect,
  onDisconnect,
}: Props): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state.phase !== "closed";
  const phase = state.phase;
  const connected = authState.phase === "connected";

  // Esc always safe — no destructive operations here.
  // Enter triggers match when there's a non-empty URL and we're idle or
  // showing a prior result/error (i.e. the user is iterating). Disabled
  // when the user isn't connected to Spotify yet.
  const onEscape = open ? onClose : null;
  const onEnter =
    open && connected && phase !== "loading" && phase !== "closed" && state.ref.trim().length > 0
      ? onMatch
      : null;

  useDialogShortcuts({ active: open, containerRef, phaseKey: phase, onEscape, onEnter });

  // Autofocus the URL input on first open. The focus-trap in
  // useDialogShortcuts handles the rest of the cycle.
  useEffect(() => {
    if (phase === "idle") {
      inputRef.current?.focus();
    }
  }, [phase]);

  if (!open) return null;

  return (
    <div
      className="spotify-match__backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-match-title"
      aria-busy={phase === "loading"}
    >
      <div className="spotify-match" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <h2 id="spotify-match-title" className="spotify-match__title">
          Check a Spotify playlist
        </h2>

        {!connected ? (
          <ConnectView authState={authState} onConnect={onConnect} />
        ) : (
          <>
            <p className="spotify-match__sub">
              Paste a playlist link, URI, or ID — including playlists only you can see. We&apos;ll
              compare its tracks against your library by filename. Tracks themselves never leave
              your computer.
            </p>

            <form
              className="spotify-match__form"
              onSubmit={(e) => {
                e.preventDefault();
                onMatch();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="spotify-match__input"
                placeholder="https://open.spotify.com/playlist/…"
                value={state.ref}
                onChange={(e) => onSetRef(e.target.value)}
                disabled={phase === "loading"}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
              <button
                type="submit"
                className="spotify-match__btn spotify-match__btn--primary"
                disabled={phase === "loading" || state.ref.trim().length === 0}
              >
                {phase === "loading" ? "Matching…" : "Match"}
              </button>
            </form>

            {phase === "loading" && (
              <div className="spotify-match__loading" role="status" aria-live="polite">
                <span className="spotify-match__spinner" aria-hidden="true" />
                Fetching the playlist and matching against your library…
              </div>
            )}

            {phase === "error" && <ErrorView code={state.code} message={state.message} />}

            {phase === "results" && <ResultsView result={state.result} />}
          </>
        )}

        <div className="spotify-match__actions">
          {connected && (
            <button
              type="button"
              className="spotify-match__btn spotify-match__btn--linklike"
              onClick={onDisconnect}
              title="Forget the stored Spotify session on this computer"
            >
              Disconnect Spotify
            </button>
          )}
          <button
            type="button"
            className="spotify-match__btn spotify-match__btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectView({
  authState,
  onConnect,
}: {
  authState: SpotifyAuthState;
  onConnect: () => void;
}): JSX.Element {
  const authenticating = authState.phase === "authenticating";
  return (
    <div className="spotify-match__connect">
      <p className="spotify-match__sub">
        Connect your Spotify account once so TrackPort can read the playlists you can see — public,
        private, and Liked Songs. Spotify opens in your browser; your password never touches
        TrackPort.
      </p>
      <button
        type="button"
        className="spotify-match__btn spotify-match__btn--primary spotify-match__btn--wide"
        onClick={onConnect}
        disabled={authenticating}
      >
        {authenticating ? "Waiting for Spotify…" : "Connect Spotify"}
      </button>
      {authState.phase === "error" && (
        <div className="spotify-match__error" role="alert">
          <div className="spotify-match__error-title">Couldn&apos;t connect</div>
          <div className="spotify-match__error-msg">{authState.message}</div>
        </div>
      )}
    </div>
  );
}

function ErrorView({ code, message }: { code: MatchErrorCode; message: string }): JSX.Element {
  return (
    <div className="spotify-match__error" role="alert">
      <div className="spotify-match__error-title">{titleForError(code)}</div>
      <div className="spotify-match__error-msg">{message}</div>
    </div>
  );
}

function titleForError(code: MatchErrorCode): string {
  switch (code) {
    case "no_library":
      return "No library set";
    case "no_auth":
      return "Connect Spotify first";
    case "auth_expired":
      return "Spotify session expired — reconnect to continue";
    case "invalid_ref":
      return "Couldn't read that as a Spotify playlist";
    case "not_found":
      return "Playlist not found";
    case "access_denied":
      return "No access to that playlist";
    case "api_error":
      return "Spotify returned an error";
    case "network_error":
      return "Couldn't reach Spotify";
    case "timeout":
      return "Spotify took too long to respond";
  }
}

function ResultsView({ result }: { result: MatchResult }): JSX.Element {
  const matchedCount = result.matched.length;
  const missingCount = result.missing.length;
  const total = result.totalSpotifyTracks;
  const percent = total > 0 ? Math.round((matchedCount / total) * 100) : 0;

  return (
    <div className="spotify-match__results">
      <div className="spotify-match__summary">
        <div className="spotify-match__summary-headline">
          <strong>{matchedCount.toLocaleString()}</strong> of {total.toLocaleString()} tracks are in
          your library ({percent}%)
        </div>
        <div className="spotify-match__summary-sub">
          {missingCount > 0
            ? `${missingCount.toLocaleString()} ${missingCount === 1 ? "track" : "tracks"} missing.`
            : "Everything in this playlist is in your library."}
        </div>
      </div>

      {missingCount > 0 && (
        <details className="spotify-match__list-block" open>
          <summary className="spotify-match__list-summary">
            Missing ({missingCount.toLocaleString()})
          </summary>
          <ul className="spotify-match__list">
            {result.missing.map((m) => (
              <MissingItem key={m.spotify.spotifyId} missing={m} />
            ))}
          </ul>
        </details>
      )}

      {matchedCount > 0 && (
        <details className="spotify-match__list-block">
          <summary className="spotify-match__list-summary">
            Matched ({matchedCount.toLocaleString()})
          </summary>
          <ul className="spotify-match__list">
            {result.matched.map((m) => (
              <li
                key={m.spotify.spotifyId}
                className="spotify-match__item spotify-match__item--matched"
              >
                <div className="spotify-match__track">
                  <span className="spotify-match__track-title">{m.spotify.title}</span>
                  <span className="spotify-match__track-artist"> · {m.spotify.artist}</span>
                </div>
                <button
                  type="button"
                  className="spotify-match__file"
                  title={`Open ${m.library.path} in file manager`}
                  onClick={() => {
                    void window.api.files.openInFileManager(m.library.path);
                  }}
                >
                  {m.library.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Score above this is shown as a "did you mean?" hint on a missing track.
// Below this, the near-miss is probably noise and the hint would confuse
// more than help.
const HINT_SCORE_THRESHOLD = 0.5;

function MissingItem({ missing }: { missing: MissingTrack }): JSX.Element {
  const showHint = missing.bestCandidate !== null && missing.bestScore >= HINT_SCORE_THRESHOLD;
  return (
    <li className="spotify-match__item spotify-match__item--missing">
      <div className="spotify-match__track">
        <span className="spotify-match__track-title">{missing.spotify.title}</span>
        <span className="spotify-match__track-artist"> · {missing.spotify.artist}</span>
      </div>
      {showHint && missing.bestCandidate && (
        <div className="spotify-match__hint">
          Did you mean{" "}
          <button
            type="button"
            className="spotify-match__file"
            title={`Open ${missing.bestCandidate.path} in file manager`}
            onClick={() => {
              if (missing.bestCandidate) {
                void window.api.files.openInFileManager(missing.bestCandidate.path);
              }
            }}
          >
            {missing.bestCandidate.name}
          </button>
          ?
        </div>
      )}
    </li>
  );
}
