# Command: sn: pull current

- Command ID: sn-sync.pull-current
- Entry point: src/commands/snPullCurrentCommand.ts
- Registration: src/extension.ts

## Purpose

Pull the ServiceNow record associated with the current indexed file.

## When to use it

- Refresh only the current file's record context.
- Re-sync local files for one record without full pull.
- Recover current file state from remote changes.

## Preconditions

1. Workspace is open.
2. An active text editor exists.
3. Current file is already indexed.
4. Sync settings exist.
5. Valid connection auth is available.

## Step-by-step logic

1. Resolve `workspaceFolderUri`.
2. If missing, show `SN_SYNC_MESSAGES.NO_WORKSPACE`.
3. Resolve active editor.
4. If missing, show `SN_SYNC_MESSAGES.PULL_CURRENT_NO_EDITOR`.
5. Convert active file URI to workspace-relative path.
6. Lookup index entry by local path.
7. If entry missing, show `SN_SYNC_MESSAGES.PULL_CURRENT_NOT_INDEXED`.
8. Load settings.
9. If empty, show `SN_SYNC_MESSAGES.PULL_NO_SETTINGS`.
10. Resolve effective preferences and ensure `rootDir` exists.
11. Start progress with `SN_SYNC_MESSAGES.PULL_PROGRESS_TITLE`.
12. Execute targeted pull:
    - Preferred path: `pullService.pullRecordBySysId(...)` using index `table` + `sysId`.
    - Fallback path: `pullService.pullConfiguredScripts(...)` using settings filtered by matching table and query forced to `sys_id=<entry.sysId>`.
13. Persist metadata with `indexService.recordPullFiles(...)`.
14. Report progress completion.
15. Show success with `SN_SYNC_MESSAGES.PULL_CURRENT_SUCCESS_PREFIX`.
16. On error, show `SN_SYNC_MESSAGES.PULL_CURRENT_FAILED_PREFIX` + normalized details.

## Index behavior

This command performs incremental updates through `recordPullFiles` for files written during the command.

## Side effects

- Writes local files for the current record context.
- Updates index entries for those written files.

## Direct dependencies

- `SnSyncConfigService`
- `SnPullService`
- `SnSyncIndexService`
- `snPreferencesService` (`resolvePreferences`)
- `snFolderService` (`ensureDirectoryExists`)
- `snPullProgressService` (`createPullFileWrittenHandler`)
- `snCommandRuntime` helpers (`getWorkspaceFolderOrShowError`, `withNotificationProgress`, `showPrefixedCommandError`)
