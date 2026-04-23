# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile      # Development build (webpack)
npm run watch        # Watch mode for development
npm run package      # Production build (hidden source maps)
npx vsce package     # Package as .vsix for distribution
```

There is no dedicated test command; tests use VS Code's built-in runner via the `@vscode/test-electron` infrastructure. The test file at `src/test/extension.test.ts` is a minimal placeholder.

Linting uses ESLint with the config in `eslint.config.mjs` (TypeScript rules: camelCase/PascalCase naming, strict equality, curly braces, no throw literals, semicolons).

## Architecture

CEVIZ is a VS Code sidebar extension (WebviewViewProvider) for hybrid AI chat. The backend is a separate server (Ollama + Claude proxy) running at a configurable IP — the extension is pure client.

**Two source files:**

- **`src/extension.ts`** — Activation entry point. Registers the `CevizPanel` as a webview view provider for the `ceviz.chatView` sidebar slot, and registers three commands: `ceviz.newSession`, `ceviz.toggleEnglish`, `ceviz.openDashboard`.

- **`src/panel.ts`** — All extension logic. `CevizPanel` (implements `WebviewViewProvider`) manages:
  - Session state persisted to `vscode.ExtensionContext.globalState`
  - AI mode switching: Local (Ollama gemma variants), Cloud (Claude), Hybrid
  - HTTP polling every 15s to `GET /status` and `GET /models` at the backend
  - Main inference via `POST /prompt` using Axios
  - The entire webview HTML/CSS/JS embedded in the `_html()` method
  - English tutor mode (prompt wrapping)
  - Task difficulty heuristics (warns if local mode may be insufficient)
  - Cloud-response learning (re-sends cloud answers to local model)
  - Multi-agent Soti-Skill dashboard tab

**Webview ↔ Extension message protocol:**
- Webview → Extension: `sendPrompt`, `newSession`, `switchSession`, `ready`, `deleteSession`, `learnLocally`
- Extension → Webview: `addMessage`, `updateStatus`, `loadSessions`, `updateModels`, `sessionCreated`

**Backend endpoints (configurable via `ceviz.serverIp` setting, default `100.69.155.43:8000`):**
- `GET /status` — health check
- `GET /models` — available local models
- `POST /prompt` — inference; response includes `result`, `agent`, `tier` (0=system/local, 1=local, 2=cloud), `engine`, `token_estimate`

**Build output:** Webpack bundles everything to `dist/extension.js` (commonjs2). The `vscode` module is an external and never bundled.
