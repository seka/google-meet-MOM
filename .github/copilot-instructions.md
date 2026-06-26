# Google Meet MOM — Copilot Instructions

Chrome Extension (MV3) that records Google Meet audio locally, transcribes with Whisper WASM, and generates meeting minutes via Ollama. No audio is sent to external services.

## Tech Stack

- **Language**: TypeScript
- **Build**: Vite+ (`vp` command)
- **Transcription**: `@huggingface/transformers` v3 — Whisper WASM, single-threaded (`numThreads = 1`)
- **Minutes generation**: Ollama REST API at `localhost:11434`
- **Audio capture**: `chrome.tabCapture` + `getUserMedia` + Web Audio API (mixed in Offscreen Document)
- **Storage**: IndexedDB for recordings/transcripts, `chrome.storage.sync` for settings

## Key Commands

```bash
npm run dev          # watch + auto-build
npm run build        # production build → dist/
npx vp check         # format + lint + type check
npx vp check --fix   # auto-fix formatting
```

## Architecture

| File                | Role                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `src/background.ts` | Service Worker: recording control, state, Ollama calls                        |
| `src/content.ts`    | Injected into meet.google.com: title + speaker detection via MutationObserver |
| `src/offscreen.ts`  | Audio recording + Whisper WASM (Offscreen Document API)                       |
| `src/sidepanel.ts`  | Side Panel UI: controls, live transcript chunks, final minutes                |
| `src/options.ts`    | Settings page                                                                 |
| `src/messages.ts`   | Typed Chrome message interfaces                                               |
| `src/types.ts`      | Shared types including `ExtensionSettings`                                    |

## Constraints

- `minify: false` — required by Chrome Web Store policy
- Speaker diarization relies on Google Meet DOM selectors (fragile)
- Live transcript chunks have no speaker labels; speaker labels are applied only in the final transcript after recording stops
- See `docs/CONSTRAINTS.md` for full details
