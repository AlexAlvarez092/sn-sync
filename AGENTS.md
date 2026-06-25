# AGENTS.md — sn-sync

This file describes the repository structure, conventions, and workflows for AI agents (GitHub Copilot, Claude, Codex, etc.) contributing to sn-sync.

## What this project does

sn-sync is a **VS Code extension** that syncs ServiceNow script records to local files. Developers edit code locally, then push/pull via VS Code commands. The extension handles authentication, conflict detection, and batch operations.

## Repository layout

```
src/
  commands/       One file per VS Code command (e.g. snPushCurrentCommand.ts)
  services/       Business logic (SnPushService, SnPullService, SnAuthService, SnSyncIndexService)
  shared/
    constants/    All UI strings, error codes, command IDs, storage keys
    models/       Shared TypeScript types
    services/     Cross-cutting services (hashService, snCommandRuntime, snErrorService, ...)
    utils/        Pure utilities
  extension.ts    Activation entry point — registers all commands and services
  test/
    unit/         Unit tests (mirror src/ structure)

docs/             User-facing documentation (Markdown, rendered as GitHub Pages)
developer-docs/   Developer documentation — architecture, command specs, error handling
.github/
  copilot-instructions.md   Copilot Chat global instructions
  ISSUE_TEMPLATE/           Bug and feature request templates
  pull_request_template.md  PR template
.vscode/
  *.instructions.md   Scoped Copilot instructions (commands, tests)
```

## How to build and test

```bash
npm run compile   # TypeScript compile (clean → tsc → tsc-alias)
npm run lint      # ESLint
npm test          # compile + lint + run all tests in VS Code
npm run coverage  # compile + lint + test with coverage report
```

Tests run inside a real VS Code Electron process — not Node directly.

## Key architectural patterns

### 1. Runtime injection (testability)

Commands never call VS Code APIs directly. Instead, they accept a `Runtime` interface:

```typescript
export interface SnFooRuntime extends SnBaseCommandRuntime {
  getActiveEditor(): vscode.TextEditor | undefined;
}

const defaultRuntime: SnFooRuntime = {
  ...defaultBaseRuntime,
  getActiveEditor: () => vscode.window.activeTextEditor,
};

export async function runSnFooCommand(
  context: vscode.ExtensionContext,
  service: SnFooServiceApi,
  runtime: SnFooRuntime = defaultRuntime,
): Promise<void> { ... }
```

Tests inject a mock runtime. Production code uses `defaultRuntime`.

### 2. Index service as source of truth

`SnSyncIndexService` tracks which local files map to which ServiceNow records and their last-known-good content hash (`baseHash`). Push commands use this to:
- Detect local changes: `hash(localContent) !== entry.baseHash`
- Detect remote conflicts: `hash(remoteContent) !== entry.baseHash`

### 3. Centralized constants

Every user-visible string and every error code is in `src/shared/constants/`. Never hardcode strings in command or service files.

### 4. Error normalization

All errors are handled via `showPrefixedCommandError(runtime, PREFIX, error)`, which categorizes, redacts sensitive data, displays a user message, and logs a diagnostic.

## Conflict resolution

When a push detects a remote conflict, the user sees a quick pick with **two options only**:
- **Overwrite remote** — push local content
- **Discard local** — accept remote, update local file and baseline

There is no merge option. It was removed in PR #90 (see issue #87).

## Things agents must not do

| Do not | Reason |
|--------|--------|
| Install ESM-only packages | Project uses Node16/CJS — ESM-only packages break the build |
| Use `_open.*` VS Code APIs | Private, undocumented, unreliable |
| Hardcode user-facing strings | All strings must be in `SN_SYNC_MESSAGES` |
| Add a `merge` conflict option | Deliberately removed — see issues #87, #89 |
| Use `jest`/`sinon` in tests | Project uses Mocha with manual mocks only |
| Use relative `../../` imports across boundaries | Use path aliases (`@shared/`, `@commands/`, etc.) |
| Omit `.js` extension in imports | Node16 module resolution requires explicit `.js` extensions |

## Pull request process

1. Create a branch: `feat/<issue>-<slug>` or `fix/<issue>-<slug>`
2. Run `npm test` locally — all tests must pass
3. Run `npm run coverage` — coverage must remain at 100% (statements, branches, functions, lines)
4. Open PR using `.github/pull_request_template.md`
5. Reference the related issue with `Closes #<n>`

## Documentation

- User behavior changes → update `docs/`
- Command logic changes → update `developer-docs/sn-<command>.md`
- Architecture changes → update `developer-docs/architecture.md`
- Error handling changes → update `developer-docs/error-handling.md`
