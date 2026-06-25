---
applyTo: "src/commands/**"
---

# Commands — conventions

Every file in `src/commands/` implements one VS Code command. Follow this structure exactly.

## File structure

```
1. imports
2. Runtime interface (extends SnBaseCommandRuntime)
3. defaultRuntime constant
4. Helper functions (pure, no vscode side effects)
5. runSnXxxCommand() — exported async function, runtime as last optional param
6. registerSnXxxCommand() — exported registration function
```

## Runtime interface

- Extend `SnBaseCommandRuntime` from `@shared/services/snCommandRuntime.js`
- Add only the VS Code interactions this command needs (text editor, quick picks, etc.)
- Use `?` for optional capabilities (e.g. `resolveConflict?`)
- Keep the interface narrow — only what the implementation actually reads

## Services

- Accept services as typed `*Api` interface parameters, not concrete classes
- Services are injected at registration time in `extension.ts`
- Never instantiate services inside the command function body

## Error handling

Always wrap the command body with `showPrefixedCommandError`:

```typescript
} catch (error) {
  showPrefixedCommandError(runtime, SN_SYNC_MESSAGES.FOO_FAILED_PREFIX, error);
}
```

## User messages

- Use `void runtime.showInformationMessage(...)` (fire-and-forget) for success messages
- Use `showPrefixedCommandError` (not `runtime.showErrorMessage` directly) for errors
- All message strings must come from `SN_SYNC_MESSAGES` — no inline strings

## Status bar spinner

Use `runWithCommandStatus` from `@shared/services/snCommandRuntime.js` to show a spinner:

```typescript
export function registerSnFooCommand(context, service) {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.FOO,
    task: () => runSnFooCommand(context, service),
    message: "sn-sync: doing foo...",
  });
}
```
