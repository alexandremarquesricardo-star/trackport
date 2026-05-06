import "./App.css";
import { useDevices } from "./hooks/useDevices";
import { useDeviceProfile } from "./hooks/useDeviceProfile";
import { useLibrary } from "./hooks/useLibrary";
import { useSync } from "./hooks/useSync";
import { LibrarySection } from "./components/LibrarySection";
import { SyncDialog } from "./components/SyncDialog";
import type { Device } from "../../shared/devices";
import type { Library } from "../../shared/library";
import { PROFILES } from "../../shared/profiles";

export function App(): JSX.Element {
  const { devices, loading, error } = useDevices();
  const lib = useLibrary();
  const sync = useSync();

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__brand">TrackPort</div>
        <div className="app__version">v{window.api.appVersion}</div>
      </header>

      <section className="app__hero">
        <h1 className="app__title">
          Your music. Your device.
          <br />
          <span className="app__title--accent">Three taps.</span>
        </h1>
        <p className="app__subtitle">
          Get your library onto swim headphones, USB MP3 players, and other offline devices —
          without the 90s file-management ritual.
        </p>
      </section>

      <section className="app__board">
        <LibrarySection
          library={lib.library}
          loading={lib.loading}
          busy={lib.busy}
          onAdd={lib.add}
          onRescan={lib.rescan}
          onRemove={lib.remove}
        />

        <div className="app__devices" aria-live="polite">
          {error ? (
            <div className="app__device-status app__device-status--error">
              Couldn’t read connected devices: {error}
            </div>
          ) : loading ? (
            <div className="app__device-status">Looking for connected devices…</div>
          ) : devices.length === 0 ? (
            <div className="app__device-status">
              <span className="app__pulse" aria-hidden="true" />
              Plug in a device to begin
            </div>
          ) : (
            <ul className="app__device-list">
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  library={lib.library}
                  disabled={sync.isBusy}
                  onSync={(profileId, initialFolder) =>
                    sync.start(device, profileId, initialFolder)
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <SyncDialog
        state={sync.state}
        onConfirm={sync.confirm}
        onCancel={sync.cancel}
        onClose={sync.close}
        onApplyFit={sync.applyFit}
      />
    </main>
  );
}

function DeviceCard({
  device,
  library,
  disabled,
  onSync,
}: {
  device: Device;
  library: Library | null;
  disabled: boolean;
  onSync: (profileId: string, initialFolder?: string) => void;
}): JSX.Element {
  const { profileId, setProfileId } = useDeviceProfile(device.id, device.label);

  return (
    <li className="app__device-card">
      <div className="app__device-info">
        <div className="app__device-label">{device.label}</div>
        <div className="app__device-meta">
          {formatBytes(device.sizeBytes)} <span className="app__device-meta-sep">·</span>{" "}
          <span className="app__device-mount">{device.mountPath}</span>
        </div>
        <label className="app__device-profile">
          <span className="app__device-profile-label">Profile</span>
          <select
            className="app__device-profile-select"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            disabled={disabled}
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="app__device-actions">
        {library && (
          <button
            className="app__btn app__btn--primary"
            type="button"
            onClick={() => onSync(profileId, library.root)}
            disabled={disabled}
          >
            Sync library
          </button>
        )}
        <button
          className={`app__btn ${library ? "app__btn--ghost" : "app__btn--primary"}`}
          type="button"
          onClick={() => onSync(profileId)}
          disabled={disabled}
        >
          {library ? "Sync folder…" : "Sync to this device"}
        </button>
      </div>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
