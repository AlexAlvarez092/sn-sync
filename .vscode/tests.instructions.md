---
applyTo: "src/test/**"
---

# Tests — conventions

Tests run inside a real VS Code Electron process via `@vscode/test-cli`. There is no Jest. Use Mocha `suite`/`test` only.

## File naming

Mirror the source path: `src/commands/snFoo.ts` → `src/test/unit/commands/snFoo.test.ts`

## Mock structure

### Service mocks — plain objects satisfying the API interface

```typescript
const fooService = {
  doSomething: async () => "result",
} satisfies Partial<SnFooServiceApi> as SnFooServiceApi;
```

### Runtime mocks — capture side effects in arrays

```typescript
const infos: string[] = [];
const errors: string[] = [];
const runtime: SnFooRuntime = {
  getWorkspaceFolderUri: () => workspaceUri,
  showInformationMessage: async (msg) => { infos.push(msg); return undefined; },
  showErrorMessage: async (msg) => { errors.push(msg); return undefined; },
};
```

## Filesystem

Use real temp directories when the command writes to disk. Do not mock `vscode.workspace.fs.writeFile`.

```typescript
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sn-sync-foo-"));
try {
  // ... test body
  // assert on actual disk state:
  const written = await fs.readFile(path.join(tempDir, "file.js"), "utf8");
  assert.strictEqual(written, "expected content");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
```

## Patching VS Code APIs

For read-only properties use `Object.defineProperty`:

```typescript
const orig = Object.getOwnPropertyDescriptor(vscode.workspace, "workspaceFolders");
Object.defineProperty(vscode.workspace, "workspaceFolders", { configurable: true, value: folders });
try { await run(); } finally { Object.defineProperty(vscode.workspace, "workspaceFolders", orig); }
```

For `vscode.window.*` methods, cast through `unknown`:

```typescript
const w = vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick };
const orig = w.showQuickPick;
w.showQuickPick = mock as unknown as typeof vscode.window.showQuickPick;
try { await run(); } finally { w.showQuickPick = orig; }
```

## Assertions

- `assert.deepStrictEqual` for exact value matches
- `assert.ok(arr.some(m => m.includes("...")))` for partial message checks
- Always assert on **disk state** when the command modifies files — never trust mock call counts alone
- Assert the complete message string (including conflict summary suffix) for success paths

## What to avoid

- Do not use `sinon`, `jest`, or any spy library — patch manually or use captured arrays
- Do not create temp directories if the function under test never reads from disk
- Do not assert only on return values when the command has observable side effects (disk, messages)
- Do not leave temp directories uncleaned — always use `try/finally`
