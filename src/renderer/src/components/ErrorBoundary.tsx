import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level safety net for renderer crashes. Without this, a thrown
 * exception in any descendant React component unmounts the whole tree
 * and leaves the user with a black window — which on Electron desktop
 * looks like the app died and is the worst possible failure mode.
 *
 * The fallback gives them an actionable next step (Reload) and surfaces
 * the error message so support requests carry signal. We log the
 * componentStack to console so the dev tools have it; in a packaged
 * build that's the only logging surface we have until we wire crash
 * reporting (separate iteration).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] uncaught render error", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert" aria-live="assertive">
          <div className="error-boundary__panel">
            <div className="error-boundary__title">Something went wrong</div>
            <p className="error-boundary__sub">
              The app hit an unexpected error and stopped rendering. Reloading usually clears it. If
              it keeps happening, the message below helps diagnose:
            </p>
            <pre className="error-boundary__message">{this.state.error.message}</pre>
            <button type="button" className="error-boundary__btn" onClick={this.handleReload}>
              Reload TrackPort
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
