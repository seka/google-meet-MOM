# Coding Conventions

## 1) Naming Rules

| Item               | Rule                                                                                                     | Example                                                                | Evidence                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Files              | Lowercase role names and kebab-case for multiword source/components; tests use `*.test.ts` beside source | `log-section.ts`, `background.test.ts`                                 | `src/features/recording/components/log-section.ts`, `src/workers/background.test.ts`         |
| Functions/methods  | camelCase                                                                                                | `ensureOffscreenDocument`, `buildSpeakerTranscript`, `getMeetingTitle` | `src/workers/background.ts`, `src/workers/offscreen/transcript.ts`, `src/workers/content.ts` |
| Types/interfaces   | PascalCase                                                                                               | `Recording`, `ExtensionSettings`, `ExtensionMessage`                   | `src/features/recording/types`, `src/features/theme-settings/types`, `src/messages.ts`       |
| Constants/env vars | Upper snake case for exported/default constants and local fixed values; no env vars found                | `DEFAULT_SETTINGS`, `DB_NAME`, `STORE_NAME`                            | `src/features/theme-settings/types`, `src/db.ts`, `docs/codebase/.codebase-scan.txt`         |

## 2) Formatting and Linting

- Formatter: Vite+ formatter configured by `fmt: {}` in `vite.config.ts`.
- Linter: Vite+ lint with `vite-plus/oxlint-plugin`, type-aware linting, and `vite-plus/prefer-vite-plus-imports` set to error.
- Most relevant enforced rules: Vite+ import preference is explicit; additional formatter/linter defaults are `[TODO]` because no expanded generated config was read.
- Run commands: `npx vp check`, `npx vp check --fix`, and `npm run test`.

## 3) Import and Module Conventions

- Import grouping/order: type imports are used where appropriate, followed by runtime imports in existing source; no separate import-order rule was found.
- Alias vs relative import policy: `@core` and `@features` aliases are configured; workers and shared files mostly use relative imports.
- Public exports/barrel policy: feature type directories export through `types/index.ts`; other modules export functions/types directly from their files.

## 4) Error and Logging Conventions

- Error strategy by layer: async Chrome handlers catch errors and convert them into `STATE_CHANGED` or `ERROR` messages; IndexedDB functions reject promises; UI catches some optional content-script failures and skips them.
- Logging style and required context fields: no production logging library or `console.*` logging was found in `src/`.
- Sensitive-data redaction rules: `[TODO]` no explicit redaction policy or helper exists in the repository.

## 5) Testing Conventions

- Test file naming/location rule: co-located `*.test.ts` under `src/`.
- Mocking strategy norm: Vitest-compatible `vi` stubs, especially a global `chrome` stub in `src/test-setup.ts`.
- Coverage expectation: `[TODO]` no coverage command or threshold was found.

## 6) Evidence

- `vite.config.ts`
- `tsconfig.json`
- `src/features/recording/types`
- `src/features/theme-settings/types`
- `src/messages.ts`
- `src/db.ts`
- `src/workers/background.ts`
- `src/workers/content.ts`
- `src/workers/offscreen/transcript.ts`
- `src/test-setup.ts`
- `docs/codebase/.codebase-scan.txt`
