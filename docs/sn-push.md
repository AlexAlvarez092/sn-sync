---
nav_exclude: true
---

# Command: sn: push

- Command ID: sn-sync.push
- Source: src/commands/snPushCommand.ts

## Purpose

Provides a single entry point for push operations and asks which scope to run.

## Scope selector

When executed, the command shows a Quick Pick with:

- all files: runs sn-sync.push-modified
- current file: runs sn-sync.push-current
- report: runs sn-sync.push-report

If the picker is cancelled, the command exits with an informational message.

## Runtime behavior

1. Validates a workspace is open.
2. Shows the push scope selector.
3. Dispatches to the selected push command.

The underlying push logic, conflict handling, and index updates remain implemented in:

- src/commands/snPushCurrentCommand.ts
- src/commands/snPushModifiedCommand.ts
- src/commands/snPushReportCommand.ts
