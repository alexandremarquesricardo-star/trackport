import { useState } from "react";
import "./UpdateBanner.css";
import type { UpdateState } from "../../../shared/updater";

interface Props {
  state: UpdateState;
  onDownload: () => void;
  onInstall: () => void;
}

/**
 * Top-of-window banner that surfaces the auto-update flow without
 * stealing focus or interrupting work.
 *
 * Renders only when there's something the user can act on — `available`,
 * `downloading`, `ready`. Silent during `checking` (transient noise)
 * and `error` (failed update checks happen all the time and aren't
 * actionable; main logs them). `idle` obviously doesn't render.
 *
 * Dismiss is local UI state, not authoritative — the underlying
 * update state survives in main, so dismissing the banner doesn't
 * cancel an in-flight download. Same banner reappears next launch if
 * the update still applies.
 */
export function UpdateBanner({ state, onDownload, onInstall }: Props): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (state.phase === "idle" || state.phase === "checking" || state.phase === "error") {
    return null;
  }

  if (state.phase === "available") {
    return (
      <div className="update-banner update-banner--available" role="status">
        <div className="update-banner__text">
          <span className="update-banner__title">Update available</span>
          <span className="update-banner__sub">
            TrackPort {state.version} is ready to download.
          </span>
        </div>
        <div className="update-banner__actions">
          <button
            type="button"
            className="update-banner__btn update-banner__btn--primary"
            onClick={onDownload}
          >
            Download
          </button>
          <button
            type="button"
            className="update-banner__btn update-banner__btn--ghost"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "downloading") {
    const percent = Math.max(0, Math.min(100, Math.round(state.percent)));
    return (
      <div className="update-banner update-banner--downloading" role="status" aria-live="polite">
        <div className="update-banner__text">
          <span className="update-banner__title">Downloading update…</span>
          <span className="update-banner__sub">
            {percent}% — {formatBytes(state.bytesPerSecond)}/s
          </span>
        </div>
        <div
          className="update-banner__progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="update-banner__progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  // state.phase === "ready"
  return (
    <div className="update-banner update-banner--ready" role="status">
      <div className="update-banner__text">
        <span className="update-banner__title">Update ready</span>
        <span className="update-banner__sub">
          TrackPort {state.version} will install on restart.
        </span>
      </div>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__btn update-banner__btn--primary"
          onClick={onInstall}
        >
          Restart now
        </button>
        <button
          type="button"
          className="update-banner__btn update-banner__btn--ghost"
          onClick={() => setDismissed(true)}
        >
          Later
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || !isFinite(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
