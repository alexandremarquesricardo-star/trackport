import { defineConfig } from "vitest/config";

/**
 * Vitest config kept deliberately minimal. The pure-logic modules under
 * src/shared and the file-system scanner in src/main/library run fine in
 * a Node environment — no DOM, no Electron required. Adding renderer
 * tests later means swapping in `environment: "happy-dom"` for the
 * relevant glob.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Keep tests out of the build output — the bundler ignores them via
    // glob already, but exclude here ensures `vitest run` doesn't pick up
    // anything stray from the ignored dirs.
    exclude: ["node_modules/**", "out/**", "out-tsc/**", "release/**"],
  },
});
