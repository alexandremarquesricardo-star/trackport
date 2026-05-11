/**
 * Ephemeral HTTP server that catches the Spotify OAuth redirect.
 *
 * Flow:
 *   1. Caller starts the server on 127.0.0.1:<port>.
 *   2. Caller opens the Spotify authorize URL in the user's browser.
 *   3. User logs in, approves. Spotify redirects to
 *      http://127.0.0.1:<port>/callback?code=...&state=...
 *   4. We render a one-shot "you can close this tab" HTML response and
 *      resolve with { code, state }.
 *   5. Server shuts down. Subsequent listens reuse a fresh instance.
 *
 * If anything goes wrong (Spotify sends `error=...`, the user aborts, the
 * timeout expires, the port is busy), the promise rejects. Callers should
 * surface a clean error to the renderer rather than retrying blindly.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — Spotify login + consent time

export interface CallbackResult {
  code: string;
  state: string;
}

export class CallbackServerError extends Error {
  constructor(
    public reason:
      | "port_in_use"
      | "timeout"
      | "spotify_error"
      | "missing_params"
      | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "CallbackServerError";
  }
}

/** Renders the "you can close this tab" page. Stays inline so we don't ship
 *  an extra static asset. Inline styles keep it self-contained. */
function successHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TrackPort — Connected</title>
  <style>
    body { background:#0e0f12; color:#e8eaf0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { text-align:center; max-width:380px; padding:24px 32px; }
    h1 { font-size:22px; margin:0 0 8px; }
    p { color:#9aa0ac; line-height:1.5; margin:0; }
    .ok { color:#5b8cff; font-size:36px; line-height:1; margin-bottom:12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="ok">✓</div>
    <h1>Connected to Spotify</h1>
    <p>You can close this tab and return to TrackPort.</p>
  </div>
</body>
</html>`;
}

function errorHtml(reason: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>TrackPort — Connection failed</title>
  <style>
    body { background:#0e0f12; color:#e8eaf0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { text-align:center; max-width:420px; padding:24px 32px; }
    h1 { font-size:22px; margin:0 0 8px; }
    p { color:#9aa0ac; line-height:1.5; margin:0; }
    .x { color:#ffb09a; font-size:36px; line-height:1; margin-bottom:12px; }
    code { background:#16181d; padding:2px 6px; border-radius:4px; font-size:13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="x">✕</div>
    <h1>Couldn't complete sign-in</h1>
    <p><code>${reason.replace(/[<>&"]/g, "")}</code></p>
    <p style="margin-top:12px;">You can close this tab and try again in TrackPort.</p>
  </div>
</body>
</html>`;
}

/**
 * Spin up a one-shot HTTP server, await the OAuth callback, return the
 * code + state. Caller is responsible for opening the browser AFTER
 * `listen()` resolves so the redirect can't race the bind.
 */
export class CallbackServer {
  private server: Server | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private port: number,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Bind the server. Resolves once it's listening, ready for the redirect. */
  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          reject(new CallbackServerError("port_in_use", `Port ${this.port} is already in use`));
        } else {
          reject(err);
        }
      });
      // 127.0.0.1 explicitly — binding to "localhost" can resolve to ::1 on
      // some OSes, and Spotify's redirect URI must be exactly 127.0.0.1.
      server.listen(this.port, "127.0.0.1", () => {
        this.server = server;
        resolve();
      });
    });
  }

  /** Await the inbound /callback request. Rejects on timeout / bad request. */
  awaitCallback(): Promise<CallbackResult> {
    return new Promise((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new CallbackServerError("invalid_request", "Server hasn't been started"));
        return;
      }

      const settle = (fn: () => void): void => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        fn();
      };

      this.timer = setTimeout(() => {
        settle(() =>
          reject(
            new CallbackServerError(
              "timeout",
              `No OAuth callback received within ${Math.round(this.timeoutMs / 1000)}s`,
            ),
          ),
        );
      }, this.timeoutMs);

      server.on("request", (req: IncomingMessage, res: ServerResponse) => {
        // Only handle GET /callback; everything else is browser noise
        // (favicon, etc.) — respond 204 so the user's browser doesn't
        // render a confusing error.
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
        if (req.method !== "GET" || url.pathname !== "/callback") {
          res.statusCode = 204;
          res.end();
          return;
        }

        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(errorHtml(error));
          settle(() =>
            reject(new CallbackServerError("spotify_error", `Spotify returned error: ${error}`)),
          );
          return;
        }

        if (!code || !state) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(errorHtml("missing parameters"));
          settle(() =>
            reject(
              new CallbackServerError(
                "missing_params",
                "Callback missing required `code` or `state` parameter",
              ),
            ),
          );
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(successHtml());
        settle(() => resolve({ code, state }));
      });
    });
  }

  /** Idempotent close. Safe to call from a finally block. */
  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
