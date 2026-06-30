# Codebase Concerns

## 1) Top Risks (Prioritized)

| Severity | Concern                                                                                                              | Evidence                                                                 | Impact                                                                | Suggested action                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| high     | Speaker labels depend on Google Meet DOM selectors and aria labels                                                   | `docs/CONSTRAINTS.md`, `src/workers/content.ts`                          | Meet UI changes can remove speaker attribution from final transcripts | Add manual regression checklist or browser tests against representative Meet DOM fixtures |
| high     | Offscreen worker concentrates audio capture, chunk scheduling, Whisper loading, final transcription, and persistence | `src/workers/offscreen/offscreen.ts`, `docs/codebase/.codebase-scan.txt` | Changes in recording or transcription can regress unrelated behavior  | Split pure transcription/chunk scheduling helpers where tests can cover them              |
| medium   | Ollama call has no timeout/retry and no structured fallback beyond error state                                       | `src/workers/background.ts`                                              | A hanging or slow local Ollama can block completion feedback          | Add `AbortController` timeout and user-facing retry behavior                              |
| medium   | Recordings store audio blobs in IndexedDB without visible retention controls                                         | `src/db.ts`, `src/types.ts`, `plan.md`                                   | Browser storage can grow indefinitely across meetings                 | Add listing/deletion/retention behavior or document manual cleanup                        |
| low      | No CI/CD pipeline detected                                                                                           | `docs/codebase/.codebase-scan.txt`                                       | Checks depend on local discipline                                     | Add GitHub Actions for `npm run test`, `npm run build`, and `npx vp check`                |

## 2) Technical Debt

| Debt item                                                        | Why it exists                                                                                                           | Where                                                       | Risk if ignored                                                                     | Suggested fix                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Offscreen workflow is large and stateful                         | Audio APIs, Whisper, MediaRecorder, and messaging are implemented in one module                                         | `src/workers/offscreen/offscreen.ts`                        | Higher regression risk and harder unit testing                                      | Extract chunk scheduler, audio decode/resample, and transcription orchestration |
| Active roadmap and implementation phase need to be read together | `plan.md` describes the platform-neutral target, while the current implementation intentionally starts with Google Meet | `plan.md`, `public/manifest.json`, `src/workers/content.ts` | New contributors may mistake the current Google Meet-only scope for the final scope | Keep `plan.md` active and note phase boundaries in implementation docs          |
| Validation around settings is minimal                            | Options page trims some values but accepts arbitrary URL/model strings                                                  | `src/pages/options/options.ts`, `src/types.ts`              | Misconfiguration becomes runtime errors                                             | Add URL validation and clearer test coverage                                    |

## 3) Security Concerns

| Risk                                                            | OWASP category (if applicable)                                                                                   | Evidence                                                    | Current mitigation                                   | Gap                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Wide local audio data retention                                 | N/A                                                                                                              | `src/db.ts`, `src/types.ts`                                 | README states audio is not sent to external services | No retention/deletion policy found in code             |
| User-configurable Ollama URL                                    | SSRF category is not directly applicable inside an extension, but arbitrary local/network URLs can be configured | `src/pages/options/options.ts`, `src/workers/background.ts` | Default URL is local `http://localhost:11434`        | No allowlist, timeout, or explicit trust warning found |
| Host permissions include Hugging Face CDNs and localhost Ollama | N/A                                                                                                              | `public/manifest.json`                                      | Permissions match documented integrations            | No security policy document detected by scan           |

## 4) Performance and Scaling Concerns

| Concern                                                                            | Evidence                                                             | Current symptom                                                                   | Scaling risk                                                                   | Suggested improvement                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Whisper WASM can be slower than real time                                          | `docs/CONSTRAINTS.md`, `src/workers/offscreen/offscreen.ts`          | Live preview can lag and skip queued parallelism                                  | Long meetings or slower machines increase delay                                | Surface processing delay clearly and keep final transcription path isolated      |
| Full recording is kept as accumulated blobs and then transcribed as one audio blob | `src/workers/offscreen/offscreen.ts`                                 | No immediate symptom documented                                                   | Long meetings increase memory/storage pressure                                 | Consider segmented final transcription or persistence strategy for long sessions |
| Offscreen model pipeline is cached by first loaded model only                      | `src/workers/offscreen/offscreen.ts`, `src/pages/options/options.ts` | `[TODO]` no behavior is documented for changing Whisper model after pipeline load | Options changes may not affect an already cached pipeline until context reload | Track model name alongside pipeline and reload when it changes                   |

## 5) Fragile/High-Churn Areas

| Area                               | Why fragile                                                             | Churn signal                      | Safe change strategy                                         |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `src/messages.ts`                  | Shared cross-context contract                                           | 5 changes in scan high-churn list | Update message union and all sender/receiver tests together  |
| `vite.config.ts`                   | Build, lint, test, aliases, and extension entry outputs are centralized | 5 changes in scan high-churn list | Verify build output names still match `public/manifest.json` |
| `public/manifest.json`             | Permissions, CSP, and entry paths determine extension behavior          | 5 changes in scan high-churn list | Review permissions/CSP together with runtime API usage       |
| `src/pages/sidepanel/sidepanel.ts` | Main user control surface and message listener                          | 4 changes in scan high-churn list | Test state transitions and live/final transcript UI together |
| `src/workers/background.ts`        | State machine, offscreen lifecycle, Ollama call, and message routing    | 4 changes in scan high-churn list | Add focused tests for each message type before changing flow |

## 6) `[ASK USER]` Questions

1. [ASK USER] What retention policy should apply to stored audio blobs and transcripts in IndexedDB?
2. [ASK USER] Should arbitrary Ollama URLs be allowed, or should the extension restrict them to localhost/private endpoints?

## 7) Evidence

- `docs/codebase/.codebase-scan.txt`
- `README.md`
- `docs/CONSTRAINTS.md`
- `plan.md`
- `public/manifest.json`
- `src/workers/content.ts`
- `src/workers/offscreen/offscreen.ts`
- `src/workers/background.ts`
- `src/pages/options/options.ts`
- `src/db.ts`
- `src/messages.ts`
