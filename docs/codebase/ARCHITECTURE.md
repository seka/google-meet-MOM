# Architecture

## 1) Architectural Style

- Primary style: event-driven Chrome Extension with worker/page modules and feature-oriented UI components.
- Why this classification: runtime coordination uses `chrome.runtime.sendMessage` between side panel, background service worker, content script, and offscreen document; Vite inputs and Manifest V3 define independent extension entry points.
- Primary constraints: Manifest V3 service worker lifecycle, offscreen document requirement for tab/microphone capture, local-only transcription/minutes flow, and Google Meet DOM selector fragility.

## 2) System Flow

```text
side panel -> background service worker -> content script + offscreen document -> IndexedDB + Ollama -> side panel output
```

1. The side panel locates the active Google Meet tab, asks the content script for a meeting title, reads settings from `chrome.storage.sync`, and sends `START_RECORDING`.
2. The background worker creates or reuses the offscreen document, gets a tab audio `streamId` through `chrome.tabCapture.getMediaStreamId`, starts content-script speaker tracking, and forwards recording data to the offscreen document.
3. The content script observes Google Meet DOM mutations and stores active speaker events until the background requests them.
4. The offscreen worker captures tab audio and microphone audio, mixes them with Web Audio, records one-second chunks, and periodically sends unlabeled transcript chunks for live preview.
5. On stop, the background collects speaker events and tells the offscreen worker to transcribe the full audio with word timestamps; the offscreen worker saves the recording and transcript through IndexedDB.
6. The background worker sends the final transcript to Ollama `/api/chat`, stores generated minutes, and broadcasts completion state to extension pages.

## 3) Layer/Module Responsibilities

| Layer or module           | Owns                                                                                       | Must not own                                      | Evidence                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Side panel page           | Recording button behavior, status badge, transcript/minutes display, copy/download actions | Direct audio capture, Whisper calls, Ollama calls | `src/pages/sidepanel/sidepanel.ts`                                                     |
| Background service worker | State transitions, offscreen lifecycle, tab capture stream ID, Ollama integration          | Google Meet DOM parsing, audio decoding           | `src/workers/background.ts`                                                            |
| Content script            | Meeting title and speaker event detection from Google Meet DOM                             | Transcription and persistence                     | `src/workers/content.ts`                                                               |
| Offscreen worker          | Audio capture, Web Audio mixing, MediaRecorder, Whisper transcription                      | User-facing page state and options UI             | `src/workers/offscreen/offscreen.ts`                                                   |
| Persistence               | IndexedDB recording CRUD                                                                   | External API calls and rendering                  | `src/db.ts`                                                                            |
| Shared contracts          | Message and setting/recording types                                                        | Side effects                                      | `src/messages.ts`, `src/features/recording/types`, `src/features/theme-settings/types` |

## 4) Reused Patterns

| Pattern                        | Where found                                                           | Why it exists                                                            |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Typed message union            | `src/messages.ts`                                                     | Keeps Chrome runtime message payloads explicit across extension contexts |
| Cached singleton resource      | `src/db.ts`, `src/workers/offscreen/offscreen.ts`                     | Reuses IndexedDB connection and Whisper pipeline across calls            |
| State broadcast                | `src/workers/background.ts`, `src/pages/sidepanel/sidepanel.ts`       | Keeps extension pages updated from the service worker                    |
| DOM observer adapter           | `src/workers/content.ts`                                              | Converts Google Meet DOM changes into speaker events                     |
| Source aliasing for UI modules | `vite.config.ts`, `tsconfig.json`, `src/pages/sidepanel/sidepanel.ts` | Allows feature/core UI imports without long relative paths               |

## 5) Known Architectural Risks

- Google Meet speaker tracking depends on DOM selectors and aria labels, so Meet UI changes can remove speaker labels while transcription still works.
- Offscreen transcription module mixes capture, chunk scheduling, Whisper loading, final transcription, and persistence in one file; this concentrates change risk in the largest TypeScript source file.
- `plan.md` is an active roadmap for a platform-neutral direction, while the current implementation intentionally starts with `https://meet.google.com/*` as the initial phase target.
- Ollama failure moves the extension to `error` after transcription is saved; users may get a transcript but no minutes.

## 6) Evidence

- `README.md`
- `docs/CONSTRAINTS.md`
- `plan.md`
- `public/manifest.json`
- `vite.config.ts`
- `src/pages/sidepanel/sidepanel.ts`
- `src/workers/background.ts`
- `src/workers/content.ts`
- `src/workers/offscreen/offscreen.ts`
- `src/workers/offscreen/transcript.ts`
- `src/db.ts`
