import "./App.css";

export function App(): JSX.Element {
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

      <section className="app__cta">
        <button className="app__btn app__btn--primary" type="button" disabled>
          Connect a device
        </button>
        <span className="app__cta-hint">Device detection lands in the next iteration.</span>
      </section>
    </main>
  );
}
