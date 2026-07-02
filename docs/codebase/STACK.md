# Technology Stack

## 1) Runtime Summary

| Area                | Value                                                                                                                                     | Evidence                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Primary language    | TypeScript                                                                                                                                | `package.json`, `tsconfig.json`, `docs/codebase/.codebase-scan.txt` |
| Runtime + version   | Chrome Extension Manifest V3; TypeScript target ES2020. Node runtime version is `[TODO]` because no `.nvmrc` or engines field is present. | `public/manifest.json`, `tsconfig.json`, `package.json`             |
| Package manager     | npm 11.17.0                                                                                                                               | `package.json`                                                      |
| Module/build system | Vite+ with Vite-compatible Rollup inputs, ESNext modules, bundled from `src/` to `dist/`                                                  | `package.json`, `vite.config.ts`, `tsconfig.json`                   |

## 2) Production Frameworks and Dependencies

| Dependency                  | Version                                                                  | Role in system                                                                  | Evidence                                                                                |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@huggingface/transformers` | `^3.0.0`                                                                 | Whisper WASM automatic speech recognition in the offscreen worker               | `package.json`, `src/workers/offscreen/offscreen.ts`                                    |
| Chrome Extension APIs       | Manifest V3 APIs declared in manifest                                    | Side panel, tab capture, offscreen document, storage, alarms, active tab access | `public/manifest.json`, `src/workers/background.ts`, `src/pages/sidepanel/sidepanel.ts` |
| Ollama REST API             | Configured by URL/model, default `http://localhost:11434` and `llama3.2` | Local LLM minutes generation through `/api/chat`                                | `README.md`, `src/features/theme-settings/types`, `src/workers/background.ts`           |

## 3) Development Toolchain

| Tool                          | Purpose                                                              | Evidence                                                           |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Vite+ (`vp`)                  | Build, watch, lint, format, type-aware check, git hook configuration | `package.json`, `vite.config.ts`, `AGENTS.md`                      |
| TypeScript                    | Strict type checking and browser/Chrome types                        | `tsconfig.json`, `package.json`                                    |
| Vitest via Vite+ test package | Unit tests using `vite-plus/test` imports                            | `package.json`, `vite.config.ts`, `src/workers/background.test.ts` |
| happy-dom                     | DOM-like test environment                                            | `package.json`, `vite.config.ts`                                   |
| `@types/chrome`               | Chrome extension type definitions                                    | `package.json`, `tsconfig.json`                                    |

## 4) Key Commands

```bash
npm install
npm run build
npm run test
npx vp check
npm run dev
```

## 5) Environment and Config

- Config sources: `public/manifest.json`, `vite.config.ts`, `tsconfig.json`, `src/features/theme-settings/types`, `chrome.storage.sync`.
- Required env vars: none found; no `.env.example` or `.env.template` was detected by the scan.
- Runtime constraints: Chrome 114+ and local Ollama are documented prerequisites; Whisper model downloads from Hugging Face on first use; Chrome CSP allows Hugging Face CDN hosts and `http://localhost:11434`.
- Container/CI: no containerization or CI pipeline was detected by the scan.

## 6) Evidence

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `public/manifest.json`
- `README.md`
- `docs/codebase/.codebase-scan.txt`
