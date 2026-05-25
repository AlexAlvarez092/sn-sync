# Command: sn: push report

- Command ID: sn-sync.push-report
- Entry point: src/commands/snPushReportCommand.ts
- Registration: src/extension.ts

## Purpose

Generate a Markdown report for modified files that are candidates for push, grouped by scope and enriched with resolved update set metadata.

## Output

Opens a temporary Markdown document in VS Code containing:

1. Modified file count summary.
2. Scope summary table.
3. Files-to-push table with:
   - File
   - Table
   - Field
   - Scope
   - Update set
   - Note

## Preconditions

1. Workspace is open.
2. Index contains entries.
3. Valid connection auth exists for report service calls.

## Step-by-step logic

1. Resolve workspaceFolderUri.
2. If missing, show SN_SYNC_MESSAGES.NO_WORKSPACE.
3. Get modified candidates via getModifiedCandidates.
4. If empty, show SN_SYNC_MESSAGES.PUSH_REPORT_NO_LOCAL_CHANGES.
5. Execute withProgress using SN_SYNC_MESSAGES.PUSH_REPORT_TITLE.
6. Emit initial progress message: Analyzing N modified files...
7. Invoke reportService.buildPushReport(context, workspace, candidates, { onProgress }).
8. Service onProgress callback reports:
   - increment: 100 / total
   - message: Resolving X/Y: localPath
9. Format final data into Markdown via formatPushReport.
10. Open markdown in editor through openMarkdownReport.
11. Show SN_SYNC_MESSAGES.PUSH_REPORT_SUCCESS.
12. On failure, show SN_SYNC_MESSAGES.PUSH_REPORT_FAILED_PREFIX + details.

## Markdown formatting details

formatPushReport:

1. Builds the title block.
2. Writes summary sentence.
3. Renders scope table.
4. Renders file detail table.
5. Escapes pipe characters with escapePipes for valid Markdown tables.
6. Formats update set through formatUpdateSet:
   - no id -> SN_SYNC_MESSAGES.PUSH_REPORT_NO_UPDATE_SET
   - id without name -> id
   - name + id -> Name (id)

## Update set resolution (service-level)

The command delegates all resolution to SnPushReportService, which:

1. Processes modified candidates.
2. Resolves scope per record.
3. Resolves update set metadata by scope using service rules.
4. Adds resolution notes for partial failure paths (for example 404 cases).

## Side effects

- No content push occurs.
- No index mutation occurs.
- Creates/opens a Markdown document in editor.
- Performs read-only ServiceNow metadata calls.

## Error handling

- Missing workspace errors.
- Auth/API errors while building report data.
- Document open/render errors.

All are surfaced with SN_SYNC_MESSAGES.PUSH_REPORT_FAILED_PREFIX + reason.

## Direct dependencies

- SnSyncIndexService
- SnPushReportService
- snCommandRuntime helpers (withNotificationProgress, getWorkspaceFolderOrShowError, showPrefixedCommandError)
- Runtime with openMarkdownReport
- SN_SYNC_MESSAGES

## Sequence diagram

```mermaid
sequenceDiagram
   participant U as User
   participant C as sn: push report command
   participant I as SnSyncIndexService
   participant S as SnPushReportService
   participant R as Runtime

   U->>C: Run command
   C->>R: getWorkspaceFolderUri()
   alt No workspace
      C->>R: showErrorMessage(NO_WORKSPACE)
   else Workspace exists
      C->>I: getModifiedCandidates()
      alt No modified files
         C->>R: showInformationMessage(PUSH_REPORT_NO_LOCAL_CHANGES)
      else Modified files found
         C->>R: withProgress(PUSH_REPORT_TITLE)
         C->>S: buildPushReport(..., onProgress)
         loop Each candidate
            S-->>C: onProgress(processed/total/path)
            C->>R: progress.report(...)
         end
         S-->>C: report data
         C->>C: formatPushReport()
         C->>R: openMarkdownReport(content)
         C->>R: showInformationMessage(PUSH_REPORT_SUCCESS)
      end
   end
```

## Troubleshooting

- Symptom: Empty report path (no candidates)
  - Cause: No local modifications vs baseline.
  - Resolution: Confirm local edits are saved and indexed.

- Symptom: Report fails with auth/HTTP error
  - Cause: Invalid credentials or ServiceNow connectivity issue.
  - Resolution: Run sn: auth validate and verify network access.

- Symptom: Report opens but update set fields are empty
  - Cause: Scope/update set resolution returned no match.
  - Resolution: Verify update set/user preference configuration in ServiceNow.
