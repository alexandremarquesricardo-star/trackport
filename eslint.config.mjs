// Flat config (ESLint 9). One file covers main, preload, renderer, and the
// build scripts — each gets its own rule slice scoped by `files`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "out/**",
      "out-tsc/**",
      "release/**",
      "build/icons/**",
      "build/icon.svg",
      "package-lock.json",
      // Server runs its own tsconfig and tooling; root linter would
      // mis-scope its globals. Keep it self-contained.
      "server/**",
      // Static landing page — browser-target JS, no build step, separate
      // concern from the Electron app source.
      "site/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TS / TSX project files. We deliberately don't enable type-aware rules
  // (no `parserOptions.project`) — typecheck already covers types, and
  // type-aware lint roughly doubles CI lint time. Re-enable on a per-rule
  // basis if a rule we care about needs it.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // Renderer: browser globals + React.
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // automatic JSX runtime
      "react/prop-types": "off", // TypeScript handles prop typing
    },
    settings: {
      react: { version: "detect" },
    },
  },

  // Main + preload: Node globals.
  {
    files: ["src/main/**/*.ts", "src/preload/**/*.ts", "electron.vite.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // CommonJS build scripts.
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Last entry wins: turn off any stylistic rules that fight Prettier.
  prettier,
);
