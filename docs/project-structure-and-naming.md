# Project Structure and Naming Rules

## Naming Rules

### Files

- React component files: `PascalCase.tsx`
- Hook files: `useX.ts`
- Non-component files (utils/services/stores/constants/types): `kebab-case.ts`
- Test files: prefix style, `test-*.ts` or `spec-*.ts`
- Style files: prefix style, `style-*.css`

### Directories (same importance as files)

All **new** directories under `src/`, `electron/`, `docs/`, and `scripts/` must use **kebab-case**:

- Use **lowercase ASCII letters**, optional **digits**, and **single hyphens** between segments.
- Examples: `tools-hub`, `request-workbench`, `background-session` — not `toolsHub`, `RequestWorkbench`, or `request_workbench`.
- Single-word folder names are fine when they read as one concept: `modals`, `bridges`, `browser`, `ipc`, `security`.

Root-level project folders (`src`, `electron`, `dist`, `docs`, `scripts`, `node_modules`) follow normal repo layout; do not introduce camelCase or PascalCase **feature** folder names inside `src/` or `electron/`.

Validation: run `npm run check:dirs` (see `scripts/check-kebab-dirs.mjs`).

## Structure Rules

- Renderer bridge components live under `src/renderer/components/bridges/`.
- Feature components stay grouped by feature folder (`modals`, `tools-hub`, etc.).
- Electron main process code is organized by feature folders:
  - `electron/import/`
  - `electron/network/`
  - `electron/security/`
  - `electron/ipc/`

## Migration Rules

- Prefer move/rename + import updates over behavior changes.
- Keep runtime behavior unchanged during structure refactors.
- After each batch:
  - run `npm run typecheck`
  - run `npm run check:dirs`
  - run `npm run build:app`
