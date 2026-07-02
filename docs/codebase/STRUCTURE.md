# Codebase Structure

## 1) Top-Level Map

| Path            | Purpose                                                                                            | Evidence                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/`          | Extension source code, including workers, pages, shared types, storage, and UI components          | `docs/codebase/.codebase-scan.txt`, `vite.config.ts`                                                                    |
| `src/workers/`  | Background service worker, content script, offscreen audio/transcription worker, and related tests | `vite.config.ts`, `src/workers/background.ts`, `src/workers/content.ts`, `src/workers/offscreen/offscreen.ts`           |
| `src/pages/`    | Side panel and options page HTML/CSS/TS entry points                                               | `vite.config.ts`, `src/pages/sidepanel/sidepanel.ts`, `src/pages/options/options.ts`                                    |
| `src/core/`     | Shared design tokens and generic UI component styles/helpers                                       | `src/core/components/styles/tokens.css`, `src/core/components/atoms/badge.ts`                                           |
| `src/features/` | Feature-specific UI components and domain types                                                    | `src/features/recording/components/log-section.ts`, `src/features/recording/types`, `src/features/theme-settings/types` |
| `public/`       | Extension manifest and icon assets copied into the build output                                    | `public/manifest.json`, `scripts/gen-icons.mjs`                                                                         |
| `docs/`         | Project constraints and generated codebase documentation                                           | `docs/CONSTRAINTS.md`, `docs/codebase/.codebase-scan.txt`                                                               |
| `.github/`      | PR template, issue templates, and Copilot project instructions                                     | `.github/pull_request_template.md`, `.github/copilot-instructions.md`                                                   |

## 2) Entry Points

- Main runtime entry: `src/workers/background.ts`, selected by `public/manifest.json` as `background.service_worker` and by `vite.config.ts` as the `background` build input.
- Secondary entry points: `src/workers/content.ts`, `src/workers/offscreen/offscreen.html`, `src/pages/sidepanel/sidepanel.html`, `src/pages/options/options.html`.
- How entry is selected: Chrome Manifest V3 selects background/content/side panel/options paths; Vite+ Rollup inputs build matching JS/HTML outputs.

## 3) Module Boundaries

| Boundary                                     | What belongs here                                                                                                           | What must not be here                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/workers/background.ts`                  | Extension state, side panel behavior setup, offscreen lifecycle, tab capture stream ID retrieval, Ollama minutes generation | DOM scraping logic and raw audio transcription implementation |
| `src/workers/content.ts`                     | Google Meet DOM queries, meeting title extraction, active speaker tracking                                                  | Recording, Whisper, IndexedDB writes, Ollama calls            |
| `src/workers/offscreen/`                     | Media stream capture/mixing, chunk transcription, final transcription, speaker transcript assembly                          | Side panel UI control and Meet DOM selectors                  |
| `src/pages/sidepanel/`                       | User recording controls, live log display, copy/download UI, options link                                                   | Audio processing and external API calls                       |
| `src/pages/options/`                         | User settings persisted to `chrome.storage.sync`, Whisper microphone test UI                                                | Normal meeting recording flow                                 |
| `src/db.ts`                                  | IndexedDB persistence for recordings                                                                                        | UI rendering and message routing                              |
| `src/messages.ts` and `src/features/*/types` | Shared message and feature domain types                                                                                     | Runtime side effects                                          |

## 4) Naming and Organization Rules

- File naming pattern: source files are primarily kebab-case or lowercase by role (`sidepanel.ts`, `offscreen.ts`, `log-section.ts`, `badge.ts`); tests use colocated `*.test.ts`.
- Directory organization pattern: mixed page/worker/feature/core organization, not a pure layered architecture.
- Import aliasing or path conventions: `@core/*` and `@features/*` aliases map to `src/core/*` and `src/features/*`; other local imports are relative.

## 5) Evidence

- `docs/codebase/.codebase-scan.txt`
- `vite.config.ts`
- `public/manifest.json`
- `src/workers/background.ts`
- `src/workers/content.ts`
- `src/workers/offscreen/offscreen.ts`
- `src/pages/sidepanel/sidepanel.ts`
- `src/pages/options/options.ts`
- `tsconfig.json`
