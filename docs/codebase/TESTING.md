# Testing Patterns

## 1) Test Stack and Commands

- Primary test framework: Vitest through Vite+ test override; tests import from `vite-plus/test`.
- Assertion/mocking tools: `expect`, `describe`, `it`, `vi`, `beforeEach`, `beforeAll` from `vite-plus/test`.
- Commands:

```bash
npm run test
vp test
npx vp check
```

- Integration/E2E command: `[TODO]` no integration or E2E test command was found.
- Coverage command: `[TODO]` no coverage command was found.

## 2) Test Layout

- Test file placement pattern: tests are co-located with source under `src/`.
- Naming convention: `*.test.ts`.
- Setup files and where they run: `vite.config.ts` configures `./test-setup.ts`; because Vite root is `src`, this resolves to `src/test-setup.ts`.

## 3) Test Scope Matrix

| Scope       | Covered?    | Typical target                                                                              | Notes                                                       |
| ----------- | ----------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Unit        | yes         | transcript assembly, content DOM helpers, UI helper components, background message handling | Evidence from six `*.test.ts` files under `src/`            |
| Integration | partial     | background message flow with Chrome API stubs                                               | Uses mocked Chrome APIs, not real browser extension runtime |
| E2E         | no evidence | `[TODO]`                                                                                    | No Playwright/Puppeteer/WebDriver config or command found   |

## 4) Mocking and Isolation Strategy

- Main mocking approach: `src/test-setup.ts` stubs global `chrome`; individual tests replace mocked functions and capture message handlers with `vi.fn()`.
- Isolation guarantees: `beforeEach` in representative tests clears mocks and resets stubs.
- Common failure mode in tests: Chrome extension runtime behavior, offscreen documents, tab capture, MediaRecorder, AudioContext, Hugging Face model loading, and Ollama HTTP calls are not exercised against real implementations by current tests.

## 5) Coverage and Quality Signals

- Coverage tool + threshold: `[TODO]` no coverage config or threshold was found.
- Current reported coverage: `[TODO]` tests were not run as part of this documentation pass because the repository instructions say not to run tests/lint/format on code changes unless instructed.
- Known gaps/flaky areas: no automated browser-extension E2E coverage found; offscreen audio/Whisper/Ollama flows are high-risk areas without real integration tests in the files inspected.

## 6) Evidence

- `package.json`
- `vite.config.ts`
- `src/test-setup.ts`
- `src/workers/background.test.ts`
- `src/workers/content.test.ts`
- `src/workers/offscreen/transcript.test.ts`
- `src/features/recording/components/log-section.test.ts`
- `src/features/recording/components/log-item.test.ts`
- `src/core/components/atoms/badge.test.ts`
- `docs/codebase/.codebase-scan.txt`
