import "./LibrarySection.css";
import type { Library } from "../../../shared/library";

interface Props {
  library: Library | null;
  loading: boolean;
  busy: boolean;
  onAdd: () => void;
  onRescan: () => void;
  onRemove: () => void;
}

export function LibrarySection({
  library,
  loading,
  busy,
  onAdd,
  onRescan,
  onRemove,
}: Props): JSX.Element | null {
  if (loading) return null;

  if (!library) {
    return (
      <section className="library library--empty">
        <div className="library__empty-text">
          Add your music folder once, sync from it on every device — no folder picker needed.
        </div>
        <button className="library__btn library__btn--primary" type="button" onClick={onAdd} disabled={busy}>
          {busy ? "Picking…" : "Add library"}
        </button>
      </section>
    );
  }

  return (
    <section className="library">
      <div className="library__icon" aria-hidden="true">
        ♪
      </div>
      <div className="library__info">
        <div className="library__root" title={library.root}>
          {library.root}
        </div>
        <div className="library__stats">
          {library.trackCount.toLocaleString()}{" "}
          {library.trackCount === 1 ? "track" : "tracks"} ·{" "}
          {formatBytes(library.totalBytes)}
          {library.lastScannedAt && (
            <>
              {" · scanned "}
              <span className="library__when">{formatRelativeTime(library.lastScannedAt)}</span>
            </>
          )}
        </div>
      </div>
      <div className="library__actions">
        <button className="library__btn" type="button" onClick={onRescan} disabled={busy}>
          {busy ? "Working…" : "Re-scan"}
        </button>
        <button
          className="library__btn library__btn--ghost"
          type="button"
          onClick={onRemove}
          disabled={busy}
        >
          Remove
        </button>
      </div>
    </section>
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

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (diffMin < 60) return fmt.format(-diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return fmt.format(-diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return fmt.format(-diffDay, "day");
}
