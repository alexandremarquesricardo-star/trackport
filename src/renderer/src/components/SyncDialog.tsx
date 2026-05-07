import "./SyncDialog.css";
import { computeFitSuggestions, type FitStrategyId } from "../../../shared/fit";
import type { SyncState } from "../hooks/useSync";

interface Props {
  state: SyncState;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  onApplyFit: (strategy: FitStrategyId) => void;
  onSetWipeDevice: (wipe: boolean) => void;
}

export function SyncDialog({
  state,
  onConfirm,
  onCancel,
  onClose,
  onApplyFit,
  onSetWipeDevice,
}: Props): JSX.Element | null {
  if (state.phase === "idle" || state.phase === "picking") return null;

  const dismissable = state.phase === "done" || state.phase === "error";

  return (
    <div
      className="sync-dialog__backdrop"
      onClick={dismissable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="sync-dialog" onClick={(e) => e.stopPropagation()}>
        {state.phase === "preflight" && (
          <PreflightView
            state={state}
            onConfirm={onConfirm}
            onClose={onClose}
            onApplyFit={onApplyFit}
            onSetWipeDevice={onSetWipeDevice}
          />
        )}
        {state.phase === "copying" && <CopyingView state={state} onCancel={onCancel} />}
        {state.phase === "done" && <DoneView state={state} onClose={onClose} />}
        {state.phase === "error" && <ErrorView state={state} onClose={onClose} />}
      </div>
    </div>
  );
}

function PreflightView({
  state,
  onConfirm,
  onClose,
  onApplyFit,
  onSetWipeDevice,
}: {
  state: Extract<SyncState, { phase: "preflight" }>;
  onConfirm: () => void;
  onClose: () => void;
  onApplyFit: (strategy: FitStrategyId) => void;
  onSetWipeDevice: (wipe: boolean) => void;
}): JSX.Element {
  const { plan, device, wipeDevice } = state;
  const overshoot = plan.totalSizeBytes - plan.freeSpaceBytes;
  const skippedSize = plan.unsupportedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const fitSuggestions = !plan.fits
    ? computeFitSuggestions(plan.allSupportedFiles, plan.freeSpaceBytes).filter((s) => s.fits)
    : [];
  const oversizedSize = plan.oversizedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);

  return (
    <>
      <h2 className="sync-dialog__title">Ready to sync</h2>
      <p className="sync-dialog__sub">
        From <code className="sync-dialog__path">{plan.sourceFolder}</code>
      </p>
      <p className="sync-dialog__sub">
        To <strong>{device.label}</strong> ({device.mountPath}){" · "}
        <span className="sync-dialog__profile">{plan.profileLabel}</span>
      </p>

      <dl className="sync-dialog__stats">
        <div>
          <dt>Audio files</dt>
          <dd>{plan.files.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Total size</dt>
          <dd>{formatBytes(plan.totalSizeBytes)}</dd>
        </div>
        <div>
          <dt>Device free</dt>
          <dd>{formatBytes(plan.freeSpaceBytes)}</dd>
        </div>
      </dl>

      {plan.unsupportedFiles.length > 0 && (
        <div className="sync-dialog__note">
          {plan.unsupportedFiles.length.toLocaleString()} file
          {plan.unsupportedFiles.length === 1 ? "" : "s"} ({formatBytes(skippedSize)}) skipped —
          format not supported by <strong>{plan.profileLabel}</strong>. Pick a different profile on
          the device card if you want to include them.
        </div>
      )}

      {plan.files.length > 0 && (
        <TrackOrderPreview
          files={plan.files}
          preserveOrder={plan.preserveOrder}
          profileLabel={plan.profileLabel}
        />
      )}

      {!plan.fits && plan.files.length > 0 && (
        <div className="sync-dialog__warn">
          <strong>{formatBytes(overshoot)} too large.</strong> Pick a strategy below, or close and
          trim the source folder.
        </div>
      )}

      {fitSuggestions.length > 0 && (
        <div className="sync-dialog__fits">
          {fitSuggestions.map((s) => (
            <button
              key={s.strategy}
              type="button"
              className="sync-dialog__fit"
              onClick={() => onApplyFit(s.strategy)}
            >
              <span className="sync-dialog__fit-label">{s.label}</span>
              <span className="sync-dialog__fit-desc">{s.description}</span>
            </button>
          ))}
        </div>
      )}

      {plan.appliedFitStrategy !== null && plan.oversizedFiles.length > 0 && (
        <div className="sync-dialog__note sync-dialog__note--success">
          Fitted by{" "}
          <strong>
            {plan.appliedFitStrategy === "first-fit"
              ? "keeping the first " + plan.files.length.toLocaleString() + " tracks"
              : "dropping the " + plan.oversizedFiles.length.toLocaleString() + " largest"}
          </strong>
          . {plan.oversizedFiles.length.toLocaleString()} skipped ({formatBytes(oversizedSize)}).
        </div>
      )}

      {plan.files.length === 0 && plan.unsupportedFiles.length === 0 && (
        <div className="sync-dialog__warn">
          No audio files found in this folder. Supported: MP3, WAV, FLAC, M4A, AAC, WMA, OGG, OPUS,
          AIF, AIFF, APE.
        </div>
      )}

      {plan.files.length === 0 && plan.unsupportedFiles.length > 0 && (
        <div className="sync-dialog__warn">
          Every audio file in this folder is unsupported by <strong>{plan.profileLabel}</strong>.
          Pick a less restrictive profile on the device card.
        </div>
      )}

      <WipeToggle
        wipeDevice={wipeDevice}
        recommended={plan.preserveOrder}
        existingCount={plan.existingDeviceFileCount}
        existingBytes={plan.existingDeviceBytes}
        onChange={onSetWipeDevice}
      />

      <div className="sync-dialog__actions">
        <button
          className="sync-dialog__btn sync-dialog__btn--ghost"
          type="button"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="sync-dialog__btn sync-dialog__btn--primary"
          type="button"
          onClick={onConfirm}
          disabled={!plan.fits || plan.files.length === 0}
        >
          {confirmLabel(plan.files.length, wipeDevice, plan.existingDeviceFileCount)}
        </button>
      </div>
    </>
  );
}

function confirmLabel(fileCount: number, wipe: boolean, existingCount: number): string {
  const copyPart = `Copy ${fileCount > 0 ? fileCount.toLocaleString() : ""} files`.trim();
  if (!wipe || existingCount === 0) return copyPart;
  return `Clear device & ${copyPart.toLowerCase()}`;
}

function WipeToggle({
  wipeDevice,
  recommended,
  existingCount,
  existingBytes,
  onChange,
}: {
  wipeDevice: boolean;
  recommended: boolean;
  existingCount: number;
  existingBytes: number;
  onChange: (wipe: boolean) => void;
}): JSX.Element {
  // Even when nothing is on the device, we still render the control —
  // hiding it would erase the user's mental model of "this option exists."
  // Just dim and clarify.
  const empty = existingCount === 0;
  return (
    <label
      className={
        "sync-dialog__wipe" +
        (recommended ? " sync-dialog__wipe--recommended" : "") +
        (empty ? " sync-dialog__wipe--empty" : "")
      }
    >
      <input
        type="checkbox"
        className="sync-dialog__wipe-check"
        checked={wipeDevice}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sync-dialog__wipe-text">
        <span className="sync-dialog__wipe-title">
          Clear device first
          {recommended && <span className="sync-dialog__wipe-badge">Recommended</span>}
        </span>
        <span className="sync-dialog__wipe-desc">
          {empty ? (
            <>No audio files currently on this device — toggle is a no-op.</>
          ) : (
            <>
              Removes the {existingCount.toLocaleString()} audio file
              {existingCount === 1 ? "" : "s"} ({formatBytes(existingBytes)}) currently on the
              device before copying.
              {recommended && (
                <>
                  {" "}
                  On <strong>transmission-time-order</strong> devices, leftovers interleave with the
                  new playlist.
                </>
              )}
            </>
          )}
        </span>
      </span>
    </label>
  );
}

const PREVIEW_LIMIT = 8;

function TrackOrderPreview({
  files,
  preserveOrder,
  profileLabel,
}: {
  files: { name: string }[];
  preserveOrder: boolean;
  profileLabel: string;
}): JSX.Element {
  const visible = files.slice(0, PREVIEW_LIMIT);
  const more = files.length - visible.length;
  const collapsedByDefault = files.length > PREVIEW_LIMIT;
  return (
    <details className="sync-dialog__tracks" open={!collapsedByDefault}>
      <summary className="sync-dialog__tracks-summary">
        Copy order — {files.length.toLocaleString()} {files.length === 1 ? "file" : "files"}
      </summary>
      <ol className="sync-dialog__tracks-list">
        {visible.map((f, i) => (
          <li key={`${i}-${f.name}`} className="sync-dialog__tracks-item">
            <span className="sync-dialog__tracks-index">{(i + 1).toString().padStart(2, "0")}</span>
            <span className="sync-dialog__tracks-name">{f.name}</span>
          </li>
        ))}
        {more > 0 && (
          <li className="sync-dialog__tracks-item sync-dialog__tracks-item--more">
            + {more.toLocaleString()} more
          </li>
        )}
      </ol>
      {preserveOrder && (
        <p className="sync-dialog__tracks-hint">
          On <strong>{profileLabel}</strong>, this is the order the device will play them. We copy
          one file at a time and flush between writes so the device records distinct transmission
          timestamps.
        </p>
      )}
    </details>
  );
}

function CopyingView({
  state,
  onCancel,
}: {
  state: Extract<SyncState, { phase: "copying" }>;
  onCancel: () => void;
}): JSX.Element {
  const { progress, plan } = state;
  const wiping = progress.state === "wiping";
  const ratio = (() => {
    if (progress.state === "copying" && progress.totalBytes > 0) {
      return progress.bytesCopied / progress.totalBytes;
    }
    if (progress.state === "wiping" && progress.totalFiles > 0) {
      return progress.currentIndex / progress.totalFiles;
    }
    return 0;
  })();
  const percent = Math.round(ratio * 100);

  return (
    <>
      <h2 className="sync-dialog__title">{wiping ? "Clearing device…" : "Syncing…"}</h2>
      {progress.state === "copying" && (
        <p className="sync-dialog__sub">
          {progress.currentIndex + 1} of {progress.totalFiles} ·{" "}
          <span className="sync-dialog__filename">{progress.currentFile}</span>
        </p>
      )}
      {progress.state === "wiping" && (
        <p className="sync-dialog__sub">
          Removing {progress.currentIndex + 1} of {progress.totalFiles} ·{" "}
          <span className="sync-dialog__filename">{progress.currentFile}</span>
        </p>
      )}
      {progress.state === "preparing" && <p className="sync-dialog__sub">Preparing…</p>}

      <div
        className={"sync-dialog__progress" + (wiping ? " sync-dialog__progress--wiping" : "")}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="sync-dialog__progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="sync-dialog__sub sync-dialog__sub--mono">
        {progress.state === "copying" &&
          `${formatBytes(progress.bytesCopied)} / ${formatBytes(progress.totalBytes)} (${percent}%)`}
        {progress.state === "wiping" &&
          `${(progress.currentIndex + 1).toLocaleString()} / ${progress.totalFiles.toLocaleString()} files (${percent}%)`}
        {progress.state === "preparing" && `0 / ${formatBytes(plan.totalSizeBytes)}`}
      </p>

      <div className="sync-dialog__actions">
        <button
          className="sync-dialog__btn sync-dialog__btn--ghost"
          type="button"
          onClick={onCancel}
        >
          Cancel sync
        </button>
      </div>
    </>
  );
}

function DoneView({
  state,
  onClose,
}: {
  state: Extract<SyncState, { phase: "done" }>;
  onClose: () => void;
}): JSX.Element {
  const hasFailures = state.failedCount > 0;
  const titleClass = hasFailures
    ? "sync-dialog__title sync-dialog__title--warn"
    : "sync-dialog__title sync-dialog__title--success";
  const titleText = hasFailures ? "Sync finished with errors" : "Sync complete";
  return (
    <>
      <h2 className={titleClass}>{titleText}</h2>
      <p className="sync-dialog__sub">
        {state.wipedCount > 0 && (
          <>
            {state.wipedCount.toLocaleString()} cleared
            {" · "}
          </>
        )}
        {state.copiedCount.toLocaleString()} copied
        {state.skippedCount > 0 && (
          <>
            {" · "}
            {state.skippedCount.toLocaleString()} skipped (already on device)
          </>
        )}
        {hasFailures && (
          <>
            {" · "}
            <span className="sync-dialog__failed-count">
              {state.failedCount.toLocaleString()} failed
            </span>
          </>
        )}
      </p>
      <p className="sync-dialog__sub sync-dialog__sub--mono">
        {formatBytes(state.bytesOnDevice)} on device · {formatDuration(state.durationMs)}
      </p>

      {hasFailures && (
        <details className="sync-dialog__failures">
          <summary className="sync-dialog__failures-summary">
            Show what failed ({state.failedCount.toLocaleString()})
          </summary>
          <ul className="sync-dialog__failures-list">
            {state.failures.map((f, i) => (
              <li key={`${i}-${f.file}`} className="sync-dialog__failure">
                <span className="sync-dialog__failure-file">{f.file}</span>
                <span className="sync-dialog__failure-msg">{f.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="sync-dialog__actions">
        <button
          className="sync-dialog__btn sync-dialog__btn--primary"
          type="button"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </>
  );
}

function ErrorView({
  state,
  onClose,
}: {
  state: Extract<SyncState, { phase: "error" }>;
  onClose: () => void;
}): JSX.Element {
  return (
    <>
      <h2 className="sync-dialog__title sync-dialog__title--error">Sync stopped</h2>
      <p className="sync-dialog__sub">{state.message}</p>
      <div className="sync-dialog__actions">
        <button
          className="sync-dialog__btn sync-dialog__btn--primary"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m} min ${rs} s`;
}
