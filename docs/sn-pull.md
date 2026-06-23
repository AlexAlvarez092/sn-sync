---
nav_exclude: true
---

# Command: sn: pull

- Command ID: sn-sync.pull
- Entry point: src/commands/snPullCommand.ts
- Registration: src/extension.ts

## Purpose

Provide a single pull entry point that lets users choose pull scope, mirroring the unified push command UX.

## Default shortcut

- macOS: `cmd+alt+p`
- Windows/Linux: `ctrl+alt+p`

## Scope selector

When executed, `sn: pull` shows a Quick Pick with:

- all files -> delegates to `sn-sync.pull-all-files`
- current file -> delegates to `sn-sync.pull-current`
- table -> delegates to `sn-sync.pull-table`
- by sys_id -> delegates to `sn-sync.pull-by-sys-id`

If the picker is cancelled, the command exits with an informational message.

## Runtime behavior

1. Validates a workspace is open.
2. Shows the pull scope selector.
3. Dispatches to the selected pull command.
4. Shows prefixed command error if dispatch fails.

The underlying pull behavior remains implemented in dedicated commands/services:

- src/commands/snPullAllFilesCommand.ts
- src/commands/snPullCurrentCommand.ts
- src/commands/snPullTableCommand.ts
- src/commands/snPullBySysIdCommand.ts
