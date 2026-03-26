# Autonomous Browser

Electron + React + TypeScript renderer.

## Process architecture

| Artifact | Role |
|----------|------|
| [`electron/main.ts`](electron/main.ts) → `dist/electron/electron/main.js` | **Required** — `BrowserWindow`, IPC, dialogs, paths. Entry is [`package.json`](package.json) `"main"`. |
| [`electron/preload.ts`](electron/preload.ts) | **Required** — `contextBridge` API for the renderer. |
| [`electron/data-manager.ts`](electron/data-manager.ts), Chrome/Firefox importers | **Required** for persisted data and migration flows in the **main** process (not a substitute for the React UI). |

The renderer has **no** dependency on legacy `renderer.js` (archived as `renderer.legacy.js.txt`). UI logic lives under [`src/renderer/`](src/renderer/).

Old root-level main-process scripts are kept only as archives (`*.legacy.js.txt`, e.g. `chrome-importer.legacy.js.txt`, `preload.legacy.js.txt`). The real sources are under [`electron/`](electron/).

**Note:** A root-level `main.js` (if present) is **not** used by this project; the canonical entry is `electron/main.ts` as compiled above.
