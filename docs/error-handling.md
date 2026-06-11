# Error handling and diagnostics

This document describes the standardized error model used by sn-sync commands and how to troubleshoot errors consistently.

## User-facing error format

Command failures surfaced through standardized runtime handling use:

`<prefix> (<ERROR_CODE>) <details>`

Examples:

- `Pull failed: (SN_PULL_ALL_FILES_FAILED) network timeout`
- `Push active failed: (SN_PUSH_CURRENT_FAILED) remote conflict against baseline`

## Error categories

The normalized error model classifies errors into one of:

- `auth`
- `conflict`
- `network`
- `validation`
- `unknown`

Commands provide a stable `code` and `command` identifier.
When category is not explicitly set, it is inferred from the error message.

Validation errors can also occur before any network call when sn-sync rejects malformed ServiceNow path segments used to build Table API URLs.
Validation errors also include instance URL policy rejections (for example non-HTTPS URL or host not allowed by configured policy).

## Diagnostics output

Diagnostics are written as structured JSON lines to the VS Code output channel:

- Channel name: `sn-sync diagnostics`

Diagnostic fields:

- `code`
- `command`
- `category`
- `message`
- `timestamp`
- `context` (optional, sanitized)

### Redaction policy

Sensitive keys are redacted before logging.
The redaction matcher includes keys containing:

- `password`
- `token`
- `cookie`
- `authorization`
- `secret`
- `bearer`

Redacted values are replaced with `[REDACTED]`.

## Initial error code catalog

Current standardized command failure codes:

- `SN_AUTH_FAILED` -> `sn-sync.auth`
- `SN_AUTH_VALIDATE_FAILED` -> `sn-sync.auth-validate`
- `SN_INIT_FAILED` -> `sn-sync.sn-init`
- `SN_OPEN_ACTIVE_IN_INSTANCE_FAILED` -> `sn-sync.open-active-in-instance`
- `SN_PULL_ALL_FILES_FAILED` -> `sn-sync.pull-all-files`
- `SN_PULL_BY_SYS_ID_FAILED` -> `sn-sync.pull-by-sys-id`
- `SN_PUSH_FAILED` -> `sn-sync.push`
- `SN_PUSH_CURRENT_FAILED` -> `sn-sync.push-current`
- `SN_PUSH_MODIFIED_FAILED` -> `sn-sync.push-modified`
- `SN_PUSH_REPORT_FAILED` -> `sn-sync.push-report`
- `SN_RESET_AUTH_FAILED` -> `sn-sync.reset-auth`
- `SN_RESET_INDEX_FAILED` -> `sn-sync.reset-index`

## Troubleshooting workflow

1. Read the user-facing message and capture the `ERROR_CODE`.
2. Open output channel `sn-sync diagnostics` and locate matching entries by `code` and timestamp.
3. Confirm whether category is auth/conflict/network/validation/unknown.
4. Apply category-first remediation:
   - auth: re-run `sn: auth` / `sn: auth validate`
   - conflict: run pull, merge, and retry
   - network: retry and verify instance/network availability
   - validation: verify command inputs, workspace preconditions, and indexed/configured ServiceNow identifiers (for example blank `sys_id`, missing workspace, or invalid/empty configuration values)
5. If unresolved, open a bug report and include:
   - error code
   - command
   - sanitized diagnostics line
   - extension version, VS Code version, OS

## Notes for contributors

- Prefer `showPrefixedCommandError` for command-level catch blocks.
- Always pass command error metadata (`code`, `command`) when available.
- Keep error codes stable once published in this document.
