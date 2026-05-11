import { useEffect, useRef } from "react";
import "./SpotifyMatchDialog.css";
import { useDialogShortcuts } from "../hooks/useDialogShortcuts";
import type { MatchDialogState, MatchInputMode } from "../hooks/useSpotifyMatch";
import type { MatchErrorCode, MatchResult, MissingTrack } from "../../../shared/match";
import type { SpotifyAuthState } from "../../../shared/spotify";

interface Props {
  state: MatchDialogState;
  authState: SpotifyAuthState;
  onClose: () => void;
  onSetMode: (mode: MatchInputMode) => void;
  onSetRef: (ref: string) => void;
  onSetText: (text: string) => void;
  onMatch: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function SpotifyMatchDialog({
  state,
  authState,
  onClose,
  onSetMode,
  onSetRef,
  onSetText,
  onMatch,
  onConnect,
  onDisconnect,
}: Props): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const open = state.phase !== "closed";
  const phase = state.phase;
  const mode = state.phase === "closed" ? "url" : state.mode;
  const connected = authState.phase === "connected";
  // List mode bypasses Spotify entirely.
  const inputReady = state.phase === "closed" ? false : mode === "url" ? connected : true;

  // Esc always safe — no destructive operations here. Enter triggers
  // match when there's non-empty input and the relevant gate is open.
  const onEscape = open ? onClose : null;
  const hasInput =
    state.phase !== "closed" &&
    (mode === "url" ? state.ref.trim().length > 0 : state.text.trim().length > 0);
  const onEnter =
    open && phase !== "loading" && phase !== "closed" && inputReady && hasInput && mode === "url"
      ? onMatch
      : null;
  // Note: textarea swallows Enter for newlines; we don't bind Enter for
  // list mode — user clicks the Match button.

  useDialogShortcuts({
    active: open,
    containerRef,
    phaseKey: `${phase}-${mode}`,
    onEscape,
    onEnter,
  });

  // Autofocus the relevant input when the dialog opens or the mode flips.
  useEffect(() => {
    if (phase !== "idle") return;
    if (mode === "url") urlInputRef.current?.focus();
    else textInputRef.current?.focus();
  }, [phase, mode]);

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
          Check a playlist
        </h2>

        <ModeTabs mode={mode} onChange={onSetMode} />

        {mode === "url" && !connected ? (
          <ConnectView authState={authState} onConnect={onConnect} />
        ) : mode === "url" ? (
          <>
            <p className="spotify-match__sub">
              Paste a Spotify playlist link, URI, or ID — including playlists only you can see.
              We&apos;ll compare its tracks against your library by filename. Tracks themselves
              never leave your computer.
            </p>
            <form
              className="spotify-match__form"
              onSubmit={(e) => {
                e.preventDefault();
                onMatch();
              }}
            >
              <input
                ref={urlInputRef}
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
          </>
        ) : (
          <>
            <p className="spotify-match__sub">
              Paste one track per line — formats like <code>Artist - Title</code>,{" "}
              <code>1. Artist - Title</code>, or <code>Title by Artist</code> all work. Nothing
              leaves your computer.
            </p>
            <form
              className="spotify-match__form spotify-match__form--block"
              onSubmit={(e) => {
                e.preventDefault();
                onMatch();
              }}
            >
              <textarea
                ref={textInputRef}
                className="spotify-match__textarea"
                placeholder={
                  "The Weeknd - Blinding Lights\nQueen - Bohemian Rhapsody\nAdele - Hello"
                }
                value={state.text}
                onChange={(e) => onSetText(e.target.value)}
                disabled={phase === "loading"}
                rows={6}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <button
                type="submit"
                className="spotify-match__btn spotify-match__btn--primary"
                disabled={phase === "loading" || state.text.trim().length === 0}
              >
                {phase === "loading" ? "Matching…" : "Match"}
              </button>
            </form>
          </>
        )}

        {phase === "loading" && (
          <div className="spotify-match__loading" role="status" aria-live="polite">
            <span className="spotify-match__spinner" aria-hidden="true" />
            {mode === "url"
              ? "Fetching the playlist and matching against your library…"
              : "Matching against your library…"}
          </div>
        )}

        {phase === "error" && <ErrorView code={state.code} message={state.message} />}

        {phase === "results" && <ResultsView result={state.result} />}

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

function ModeTabs({
  mode,
  onChange,
}: {
  mode: MatchInputMode;
  onChange: (m: MatchInputMode) => void;
}): JSX.Element {
  return (
    <div className="spotify-match__tabs" role="tablist" aria-label="Input mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "url"}
        className={"spotify-match__tab" + (mode === "url" ? " spotify-match__tab--active" : "")}
        onClick={() => onChange("url")}
      >
        Spotify URL
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "list"}
        className={"spotify-match__tab" + (mode === "list" ? " spotify-match__tab--active" : "")}
        onClick={() => onChange("list")}
      >
        Paste track list
      </button>
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
      <p className="spotify-match__sub spotify-match__sub--quiet">
        Or switch to <strong>Paste track list</strong> above to match without Spotify.
      </p>
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
      return "Couldn't read that input";
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
            : "Everything in this list is in your library."}
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
                  {m.spotify.artist && (
                    <span className="spotify-match__track-artist"> · {m.spotify.artist}</span>
                  )}
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
        {missing.spotify.artist && (
          <span className="spotify-match__track-artist"> · {missing.spotify.artist}</span>
        )}
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
