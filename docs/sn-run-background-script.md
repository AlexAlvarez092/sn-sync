# Command: sn: run background script

- Command ID: sn-sync.run-background-script
- Entry point: src/commands/snRunBackgroundScriptCommand.ts
- Registration: src/extension.ts

## Purpose

Execute JavaScript/TypeScript from the active editor against ServiceNow Scripts - Background using the authenticated workspace instance.

## Preconditions

1. Workspace must be open.
2. An active editor must be open.
3. Active editor language must be `javascript` or `typescript`.
4. The selected text (or full file fallback) must not be empty.
5. `sn: auth` must already be configured for the target instance.

## Step-by-step logic

1. Resolve workspace folder.
2. Resolve active editor; fail if there is no active editor.
3. Validate language (`javascript` or `typescript`).
4. Resolve script content from selected text; if selection is empty, use full document.
5. Resolve authenticated execution context.
6. Prompt scope mode (`Global` or `Custom`).
7. If `Custom`, prompt for scope name.
8. Execute script in ServiceNow with the selected scope.
9. Open raw HTML result in a dedicated webview tab.
10. Show success info message.

## Scope selection

Scope is selected explicitly before execution:

- `Global`: executes using `global`.
- `Custom`: user enters a scope name.

If the scope picker or custom scope input is cancelled, command execution stops with a cancellation message.

## Output handling

- The ServiceNow HTML response is rendered in a dedicated webview panel.
- Relative links/resources in the HTML are rewritten to absolute URLs using the authenticated instance base URL.
- Re-running the command replaces the previous result panel with a fresh one.

## Security and safety

- This command can execute destructive server-side operations. Use with care in production instances.
- Authentication is required and comes from saved workspace auth (`sn: auth`).
- Instance URL validation and HTTPS policy are enforced by shared auth/runtime services.

## Error handling

Command-level failures include:

- no workspace open
- no active editor
- invalid editor language
- empty script content
- cancelled scope selection
- background execution failure (network/auth/ServiceNow response issues)

For normalized diagnostics and redaction behavior, see [error-handling.md](error-handling.md).
