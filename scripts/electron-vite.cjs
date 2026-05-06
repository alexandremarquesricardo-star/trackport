#!/usr/bin/env node
/**
 * Thin wrapper around `electron-vite` that ensures ELECTRON_RUN_AS_NODE is
 * actually unset before the dev server spawns Electron.
 *
 * VS Code's integrated terminal exports ELECTRON_RUN_AS_NODE=1 (because VS
 * Code itself is built on Electron and uses that flag to run helper Node
 * processes). When that variable leaks into a child electron binary, Electron
 * boots in "node mode" — `require("electron")` returns a path string instead
 * of the runtime API, and main process code crashes immediately on
 * `electron.app.whenReady()`.
 *
 * Setting ELECTRON_RUN_AS_NODE to empty string is *not* enough: Electron's
 * native entrypoint reads it via getenv(), which returns non-null for "".
 * We have to delete it. cross-env can't do that, hence this 12-line script.
 */
"use strict";

delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require("node:child_process");
const args = process.argv.slice(2);

const child = spawn("electron-vite", args, {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
