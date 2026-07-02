# External Integrations

## 1) Integration Inventory

| System                         | Type (API/DB/Queue/etc)                | Purpose                                                                   | Auth model                                                            | Criticality | Evidence                                                                                         |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| Google Meet web page           | DOM integration through content script | Meeting title and active speaker detection                                | Chrome content script host permission for `https://meet.google.com/*` | high        | `public/manifest.json`, `src/workers/content.ts`                                                 |
| Chrome Extension APIs          | Browser platform APIs                  | Side panel, tab capture, offscreen document, settings, alarms, active tab | Extension permissions in manifest                                     | high        | `public/manifest.json`, `src/workers/background.ts`, `src/pages/sidepanel/sidepanel.ts`          |
| Hugging Face model hosting/CDN | Network download for model files       | First-use Whisper model download for `@huggingface/transformers`          | No app credential found; allowed by CSP/host permissions              | high        | `public/manifest.json`, `README.md`, `docs/CONSTRAINTS.md`, `src/workers/offscreen/offscreen.ts` |
| Ollama                         | Local HTTP API                         | Generate Markdown meeting minutes from transcript                         | No auth in current request; URL/model user-configured                 | high        | `src/workers/background.ts`, `src/features/theme-settings/types`, `README.md`                    |
| Microphone and tab audio       | Browser media capture                  | Capture local microphone and Google Meet tab audio                        | Browser permission mediated by Chrome APIs                            | high        | `public/manifest.json`, `src/workers/background.ts`, `src/workers/offscreen/offscreen.ts`        |

## 2) Data Stores

| Store                                                           | Role                                                                              | Access layer                                                                                      | Key risk                                                                 | Evidence                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| IndexedDB database `google-meet-mom`, object store `recordings` | Stores audio blob, transcript, minutes, title, date, duration                     | `src/db.ts`                                                                                       | Browser storage size and blob retention behavior are not bounded in code | `src/db.ts`, `src/features/recording/types`                         |
| `chrome.storage.sync`                                           | Stores settings such as Ollama URL/model, Whisper model, language, chunk interval | `src/pages/options/options.ts`, `src/workers/background.ts`, `src/workers/offscreen/offscreen.ts` | Sync storage is user/browser scoped; validation is minimal               | `src/features/theme-settings/types`, `src/pages/options/options.ts` |

## 3) Secrets and Credentials Handling

- Credential sources: none found in source or templates.
- Hardcoding checks: default local Ollama URL/model and allowed remote Hugging Face hosts are hardcoded; no API keys were found.
- Rotation or lifecycle notes: `[TODO]` no credential lifecycle is documented because no credential-bearing integration was found.

## 4) Reliability and Failure Behavior

- Retry/backoff behavior: none found for Ollama requests, Hugging Face model download, media capture, or IndexedDB operations.
- Timeout policy: none found for `fetch` to Ollama or model loading.
- Circuit-breaker or fallback behavior: transcription proceeds without speaker labels when no speaker events exist; chunk transcription failure rewinds the processed cursor for retry; Ollama failure sets an error state after transcription.

## 5) Observability for Integrations

- Logging around external calls: no production logging library or `console.*` calls found in `src/`.
- Metrics/tracing coverage: none found.
- Missing visibility gaps: model download/transcription progress is sent to extension UI, but Ollama latency/failure details and media capture diagnostics are not structured beyond error messages.

## 6) Evidence

- `README.md`
- `docs/CONSTRAINTS.md`
- `public/manifest.json`
- `src/features/recording/types`
- `src/features/theme-settings/types`
- `src/db.ts`
- `src/workers/background.ts`
- `src/workers/content.ts`
- `src/workers/offscreen/offscreen.ts`
- `src/pages/options/options.ts`
- `docs/codebase/.codebase-scan.txt`
