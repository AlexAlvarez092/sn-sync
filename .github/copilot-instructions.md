# sn-sync — Copilot Instructions

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
