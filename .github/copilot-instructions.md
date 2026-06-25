# sn-sync — Copilot Instructions

## Development workflow

Follow this workflow for every implementation, no matter how small.

### 1. Start with an issue

Before writing any code, create a GitHub issue that documents:
- What problem is being solved and why
- What the proposed change is
- Acceptance criteria

Use the issue templates in `.github/ISSUE_TEMPLATE/`. Reference the issue number in all subsequent branch names, commits, and the PR.

### 2. Create a branch

```bash
git checkout -b feat/<issue-number>-<short-slug>   # new feature
git checkout -b fix/<issue-number>-<short-slug>    # bug fix
git checkout -b refactor/<issue-number>-<short-slug>
```

Never work directly on `master`.

### 3. Review before every commit

Before running `git commit`, review the full diff:
- No dead imports, dead variables, or dead fields
- No inline hardcoded strings (use constants)
- No leftover debug code
- Types are as narrow as they need to be — not wider
- Every parameter passed to a function is actually read by the receiver

### 4. Final quality gate before opening a PR

Before opening a pull request, verify all of the following:

1. `npm run compile` — zero errors
2. `npm test` — all tests pass
3. `npm run coverage` — 100% coverage (statements, branches, functions, lines)
4. All documentation updated:
   - User behavior changes → `docs/`
   - Command logic changes → `developer-docs/sn-<command>.md`
   - Architecture changes → `developer-docs/architecture.md`
5. Full code review: logic, dead code, type contracts, test quality, doc accuracy
6. Update these Copilot instructions with any lessons learned from the implementation

### 5. Open a PR using the template

Use `.github/pull_request_template.md`. Fill in every section. Reference `Closes #<issue>`.

### 6. Update this file after every implementation

At the end of each implementation, add any new lessons learned to the **Lessons learned** section at the bottom of this file. This keeps Copilot's context accurate for future sessions.

---

## Language

**English is the primary language of this project.** All of the following must be written in English:

- Code (identifiers, comments, docstrings)
- Commit messages
- Issue titles and bodies
- Pull request titles and bodies
- Documentation (`docs/`, `developer-docs/`, `AGENTS.md`)
- GitHub comments and review notes

---

## What this project is

sn-sync is a **VS Code extension** that syncs ServiceNow script records (server-side scripts, client scripts, etc.) to local files. It allows developers to edit ServiceNow code locally and push/pull changes bidirectionally. The extension authenticates via Basic auth or OAuth, tracks a local sync index for conflict detection, and surfaces all operations through VS Code commands and a status bar.

## Tech stack

- **TypeScript** with `"module": "Node16"` and `"strict": true`
- **VS Code Extension API** (`@types/vscode` v1.120+)
- **Mocha** via `@vscode/test-cli` and `@vscode/test-electron` — tests run inside a real VS Code instance
- **got** for HTTP calls to the ServiceNow REST API
- **tsc-alias** to resolve path aliases in compiled output
- **ESLint** with `typescript-eslint`

## Module system — critical

The project uses **Node16 module resolution**. This means:

- All imports **must use `.js` extensions** even when importing `.ts` files: `import { foo } from "./foo.js"`
- **Do not install ESM-only packages** — they will fail at runtime with Node16/CJS. Check `"type"` in a package's `package.json` before adding it.
- CJS interop shims (`.cts` files) are sometimes needed for packages with ESM-only type exports.

## Path aliases

| Alias | Resolves to |
|-------|------------|
| `@shared/*` | `src/shared/*` |
| `@commands/*` | `src/commands/*` |
| `@services/*` | `src/services/*` |
| `@test/*` | `src/test/*` |
| `@/*` | `src/*` |

Always use aliases in imports, never relative `../../` paths across directory boundaries.

## Architecture

### Command pattern (runtime injection)

Every command follows this pattern for testability:

```typescript
// 1. Define a Runtime interface extending SnBaseCommandRuntime
export interface SnFooRuntime extends SnBaseCommandRuntime {
  getSomething(): Something | undefined;
}

// 2. Declare a defaultRuntime wiring real VS Code APIs
const defaultRuntime: SnFooRuntime = {
  ...defaultBaseRuntime,
  getSomething: () => vscode.window.something,
};

// 3. Command function accepts runtime as optional last parameter
export async function runSnFooCommand(
  context: vscode.ExtensionContext,
  someService: SomeServiceApi,
  runtime: SnFooRuntime = defaultRuntime,
): Promise<void> { ... }

// 4. Register in extension.ts using registerCommandWithStatus
export function registerSnFooCommand(context: vscode.ExtensionContext): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.FOO,
    task: () => runSnFooCommand(context, new SomeService()),
    message: "sn-sync: doing foo...",
  });
}
```

`SnBaseCommandRuntime` provides: `getWorkspaceFolderUri()`, `showErrorMessage()`, `showInformationMessage()`.

### Index service

`SnSyncIndexService` is the source of truth for sync state. It persists entries in `vscode.workspaceState`. Each entry tracks:

```typescript
{ localPath, table, sysId, fieldName, baseHash, updatedAt }
```

- `baseHash` is a SHA256 of the last known clean content (after pull or successful push)
- Push commands compare `hash(localContent)` vs `entry.baseHash` to detect local changes
- Push commands compare `hash(remoteContent)` vs `entry.baseHash` to detect remote conflicts

### Conflict resolution

When `remoteHash !== entry.baseHash`, the push command calls `runtime.resolveConflict()`. The resolver presents a quick pick with two options:

- **Overwrite remote** — push local content as-is
- **Discard local** — write remote content to disk and update baseline (no push)

If the picker is dismissed or the discard confirmation is declined, the result is `skip` (internal only, not shown to users).

### Error handling

All command errors are normalized through `showPrefixedCommandError(runtime, PREFIX, error)`. This:
1. Categorizes the error (auth / network / conflict / validation / unknown)
2. Redacts sensitive values (tokens, passwords, JWTs) from context
3. Shows a user message: `<PREFIX> (<ERROR_CODE>) <details>`
4. Logs a full diagnostic to the `sn-sync diagnostics` output channel

### Constants

All user-facing strings live in `src/shared/constants/snSyncConstants.ts` (barrel). Never hardcode UI strings inline — always add to `SN_SYNC_MESSAGES`, `SN_SYNC_PUSH_CONFLICT_UI`, etc.

## Test conventions

Tests run inside a real VS Code process. There is no Jest — only Mocha `suite`/`test`.

### Service mocks

Mock services as plain objects satisfying the `*Api` interface:

```typescript
const pushService = {
  getRemoteFieldContent: async () => "remote",
  pushFieldContent: async () => "stored",
} satisfies Partial<SnPushServiceApi> as SnPushServiceApi;
```

### Runtime mocks

```typescript
const runtime: SnFooRuntime = {
  getWorkspaceFolderUri: () => vscode.Uri.file(tempDir),
  showErrorMessage: async (msg) => { errors.push(msg); return undefined; },
  showInformationMessage: async (msg) => { infos.push(msg); return undefined; },
  getSomething: () => mockValue,
};
```

### Filesystem

Use real temp directories when the command writes to disk:

```typescript
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sn-sync-foo-"));
try {
  // ... test body
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
```

### Patching VS Code APIs

Use `Object.defineProperty` to patch read-only VS Code properties:

```typescript
function withPatchedWorkspaceFolders(folders, run) {
  const orig = Object.getOwnPropertyDescriptor(vscode.workspace, "workspaceFolders");
  Object.defineProperty(vscode.workspace, "workspaceFolders", { configurable: true, value: folders });
  try { return run(); } finally { Object.defineProperty(vscode.workspace, "workspaceFolders", orig); }
}
```

For `vscode.window.*` methods (showQuickPick, showWarningMessage), cast through `unknown`:

```typescript
const w = vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick };
const orig = w.showQuickPick;
w.showQuickPick = myMock as unknown as typeof vscode.window.showQuickPick;
try { await run(); } finally { w.showQuickPick = orig; }
```

### Assertions

- Capture messages/calls in arrays inside the mock, then assert on the captured values
- Use `assert.deepStrictEqual` for exact matches, `assert.ok(arr.some(...))` for partial checks
- Always assert on **disk state** (read the file with `fs.readFile`) when the command writes to disk — mock writes are not enough

## What NOT to do

- **Do not use `_open.*`** — any VS Code API prefixed with `_` is private and unreliable
- **Do not install ESM-only packages** — they break Node16/CJS builds
- **Do not hardcode UI strings** — add them to the constants files
- **Do not use `as` casts without `unknown` in between** when the types don't overlap
- **Do not write to disk inside mocks** — keep mocks pure; use real temp dirs for disk operations
- **Do not add `merged` field to `SnPushConflictStats`** — merge was removed intentionally; see issue #87
- **Do not reference `SnBaseSnapshotStore` or `diff3`** — both were removed; see issues #87, #89

## Running the project

```bash
npm run compile     # clean + tsc + tsc-alias
npm run lint        # eslint src/
npm test            # compile + lint + vscode-test (449 tests)
npm run coverage    # compile + lint + vscode-test --coverage
```

---

## Lessons learned

This section is updated after each implementation. It captures mistakes, surprises, and decisions that future sessions should know about.

### Interface fields must match what the implementation actually reads

When refactoring, always check that every field declared in an interface is actually read by the function that receives it. In the merge removal (PR #90), `SnPushConflictResolverInput` kept `workspaceFolderUri` and `remoteContent` after the merge path was deleted — the resolver only used `candidate.localPath`. Similarly, `SnPushConflictCandidate.localContent` was kept after merge was removed, even though the resolver never reads content. Unused fields were caught only in review, not during the initial implementation. **Before committing: grep every field of every modified interface and confirm it is read.**

### Test helpers must not do I/O for unused values

The `withPatchedConflictUi` test helper created a real temp directory solely to produce a `workspaceFolderUri` that the function under test never read. Always ask: does the function under test actually use this value? If not, use a stub (`vscode.Uri.file("/fake")`).

### `_open.mergeEditor` is private and unusable

The VS Code `_open.mergeEditor` command is prefixed with `_` (private). With an empty base it auto-resolves to local content and shows "0 Conflicts Remaining" regardless of configuration. It cannot be used for conflict resolution. Do not attempt to use any `_`-prefixed VS Code command or API.

### node-diff3 is ESM-only and incompatible with Node16/CJS

`node-diff3` v3.2.1 exports ESM-only types. Static `import` from a CJS context (`.ts` file with `"module": "Node16"`) fails with TS1479. A `.cts` shim with `require()` is a workaround, but adds complexity. Before installing any npm package, verify it is CJS-compatible by checking its `"type"` field and `"exports"` map in `package.json`.

### Conflict marker UX is not acceptable

Writing raw diff3 conflict markers (`<<<<<<< local`, `=======`, `>>>>>>> remote`) to a file and asking the user to edit them manually is not acceptable UX for a VS Code extension. The merge option was removed entirely in PR #90. If a merge/3-way diff UX is needed in the future, it must use a proper editor integration — not raw conflict markers written to the working file.

### Review in layers, not all at once

Doing a single review pass at the end misses issues introduced mid-implementation. After each logical change (e.g. removing a feature, adding a service, rewriting a test helper), do a focused review of just that change before moving on. Defer broad review to the end only for catching interactions between changes.
