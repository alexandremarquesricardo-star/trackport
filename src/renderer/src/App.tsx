import "./App.css";
import { useDevices } from "./hooks/useDevices";
import type { Device } from "../../shared/devices";

export function App(): JSX.Element {
  const { devices, loading, error } = useDevices();

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

      <section className="app__devices" aria-live="polite">
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
              <DeviceCard key={device.id} device={device} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DeviceCard({ device }: { device: Device }): JSX.Element {
  return (
    <li className="app__device-card">
      <div className="app__device-info">
        <div className="app__device-label">{device.label}</div>
        <div className="app__device-meta">
          {formatBytes(device.sizeBytes)} <span className="app__device-meta-sep">·</span>{" "}
          <span className="app__device-mount">{device.mountPath}</span>
        </div>
      </div>
      <button className="app__btn app__btn--primary" type="button" disabled>
        Sync to this device
      </button>
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
