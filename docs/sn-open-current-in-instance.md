---
nav_exclude: true
---

# Command: sn: open current in instance

- Command ID: sn-sync.open-current-in-instance
- Entry point: src/commands/snOpenCurrentInInstanceCommand.ts
- Registration: src/extension.ts

## Purpose

Open the active indexed file directly as its ServiceNow record in your browser.

## Default shortcut

- macOS: cmd+alt+o
- Windows/Linux: ctrl+alt+o

## Execution feedback

When the command starts, sn-sync shows an immediate status-bar spinner with command-specific text.
The spinner is debounced to avoid flicker on very fast executions.

## Preconditions

1. Workspace is open.
2. Active editor exists.
3. Active file is indexed.
4. Valid auth/connection can be resolved.

## Step-by-step logic

1. Resolve workspace folder.
2. Resolve active editor and workspace-relative path.
3. Resolve index entry by localPath.
4. Resolve connection auth (instance URL).
5. Build record URL as <instance>/<table>.do?sys_id=<sysId>.
6. Open external browser URL.
7. Show success message with table and sys_id.
8. On failure, show prefixed standardized error.

## Side effects

- Opens browser to ServiceNow.
- No remote write.
- No index mutation.

## Error handling

- Missing workspace: NO_WORKSPACE.
- Missing editor: OPEN_CURRENT_NO_EDITOR.
- Non-indexed file: OPEN_CURRENT_NOT_INDEXED.
- Browser open failure: OPEN_CURRENT_OPEN_FAILED.
- Other failures: OPEN_CURRENT_FAILED_PREFIX + standardized error context.

## Troubleshooting

- Symptom: Active file is not indexed.
  - Cause: File has no index entry.
  - Resolution: Run sn: pull (all files) or sn: pull by sys_id first.

- Symptom: Browser does not open.
  - Cause: openExternal failed in VS Code environment.
  - Resolution: Retry and verify OS/browser integration.

- Symptom: Command fails with auth/config error.
  - Cause: Missing or invalid saved credentials/instance configuration.
  - Resolution: Run `sn: auth`, choose `validate auth`, and if needed rerun `configure auth`.
