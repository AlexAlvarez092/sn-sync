# Command: sn: reset auth (internal delegate)

- Command ID: sn-sync.reset-auth
- Entry point: src/commands/snResetAuthCommand.ts
- Registration: src/extension.ts
- Exposure: internal delegate used by `sn: reset`

## Purpose

Remove the currently active instance authentication secret from VS Code Secret Storage.

## When to use it

- Normally through `sn: reset` -> `reset auth`.
- You need to rotate credentials and want a clean auth state first.
- The saved auth payload is stale or invalid.
- You want to force a fresh `sn: auth` flow before future pull/push/report operations.

## Preconditions

1. Workspace must be open.
2. Extension auth service must be available.

## Step-by-step logic

1. Resolve workspaceFolderUri.
2. If missing, show SN_SYNC_MESSAGES.NO_WORKSPACE.
3. Show warning confirmation dialog with SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_PROMPT.
4. If user dismisses or declines, show SN_SYNC_MESSAGES.RESET_AUTH_CANCELLED and stop.
5. Execute authService.resetAuth(context, workspaceFolderUri).
6. On success, show SN_SYNC_MESSAGES.RESET_AUTH_SUCCESS.
7. On failure, show SN_SYNC_MESSAGES.RESET_AUTH_FAILED_PREFIX + details.

## Service behavior

SnAuthService.resetAuth:

1. Resolves the active instance name from `.snsyncrc`.
2. If no instance is configured, exits without secret deletion.
3. Computes the secret key for that instance and workspace.
4. Deletes the secret from VS Code Secret Storage.

## Side effects

- Deletes the active instance auth secret.
- Does not modify local source files.
- Does not call ServiceNow.
- Does not clear sync index state.
- Requires explicit user confirmation before deletion.

## Functional impact after reset

- Auth-dependent commands (pull/push/report/auth validation) will fail with auth-not-configured until `sn: auth` is run again.
- `instance` selector in `.snsyncrc` is preserved; only credentials are removed.

## Error handling

- Missing workspace.
- Secret storage deletion failures.

## Direct dependencies

- SnAuthService
- SN_SYNC_MESSAGES
- snCommandRuntime helpers (getWorkspaceFolderOrShowError, showPrefixedCommandError)

## Sequence diagram

```mermaid
sequenceDiagram
	participant U as User
	participant C as sn: reset auth command
	participant R as Runtime
	participant S as SnAuthService
	participant SEC as VS Code Secret Storage

	U->>C: Run command
	C->>R: getWorkspaceFolderUri()
	alt No workspace
		C->>R: showErrorMessage(NO_WORKSPACE)
	else Workspace exists
		C->>R: showWarningMessage(RESET_AUTH_CONFIRM_PROMPT)
		alt Cancelled
			C->>R: showInformationMessage(RESET_AUTH_CANCELLED)
		else Confirmed
			C->>S: resetAuth(context, workspaceFolderUri)
			S->>SEC: delete(active instance secret)
			alt Success
				C->>R: showInformationMessage(RESET_AUTH_SUCCESS)
			else Failure
				C->>R: showErrorMessage(RESET_AUTH_FAILED_PREFIX + error)
			end
		end
	end
```

## Troubleshooting

- Symptom: "Failed to reset sn-sync auth"
  - Cause: Secret storage operation failed.
  - Resolution: Reload VS Code window and retry.

- Symptom: Pull/push fails right after reset
  - Cause: Auth was intentionally removed.
  - Resolution: Run `sn: auth` to save fresh credentials.

- Symptom: Nothing happened when running reset auth
  - Cause: Confirmation dialog was dismissed or cancelled.
  - Resolution: Run the command again and confirm the warning prompt.
