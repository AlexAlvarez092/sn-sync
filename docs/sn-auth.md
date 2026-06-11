# Command: sn: auth

- Command ID: sn-sync.auth
- Entry point: src/commands/snAuthCommand.ts
- Registration: src/extension.ts

## Purpose

Capture and persist the ServiceNow auth used by this workspace, and set the workspace instance identity/URL.

## Input fields

1. Auth method (`basic` or `oauth`)
2. Instance name
3. Instance URL
4. If `basic`: username + password
5. If `oauth`: OAuth client id + one-time authorization code

## When to use it

- Before running pull/push/report commands.
- When credentials change.
- When switching to a different ServiceNow instance.

## Preconditions

1. Workspace must be open.
2. VS Code input interaction must be available.

## Step-by-step logic

1. Resolve workspaceFolderUri.
2. If no workspace, return SN_SYNC_MESSAGES.NO_WORKSPACE.
3. Execute collectAuthInput(runtime).
4. collectAuthInput starts with auth-method selection (QuickPick).
5. collectAuthInput then prompts for instance name + instance URL.
6. For `basic`, it collects username + password.
7. For `oauth`, it collects client id, generates PKCE auth parameters via service, opens browser to ServiceNow authorize URL, then asks for pasted authorization code.
8. askRequiredInput trims values and treats empty/whitespace values as invalid.
9. If any required step returns undefined, the collection returns undefined.
10. If authInput is undefined, command shows SN_SYNC_MESSAGES.AUTH_CANCELLED and exits.
11. If input is complete, call authService.saveAuth(context, workspaceFolderUri, authInput).
12. On success, show SN_SYNC_MESSAGES.AUTH_SUCCESS.
13. On failure, show SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX + normalized error.

## Cancellation policy

- Canceling any InputBox aborts the full flow.
- Whitespace-only input is treated as empty.

## Side effects

- Persists `instance` in `.snsyncrc` as a non-sensitive selector.
- Stores auth data in VS Code Secret Storage.
  - `basic`: normalized `instanceUrl`, `username`, `password`
  - `oauth`: normalized `instanceUrl`, `clientId`, `accessToken`, `tokenType`, optional refresh metadata

## Authentication model

- This command stores exactly one explicit auth type for the active workspace instance.
- Downstream commands use the saved auth type directly.
- There is no fallback from OAuth to basic auth (or vice versa).

## Instance URL policy

- URL must be absolute and use `https`.
- Embedded URL credentials (`user:pass@host`) are rejected.
- Non-default HTTPS ports are rejected.
- Allowed hosts by default: `service-now.com` and its subdomains.
- Optional custom hosts:
  - enable `sn-sync.auth.allowCustomHosts`
  - add exact hostnames to `sn-sync.auth.customHosts`
- The URL is normalized and persisted as `https://<host>`.

## Error handling

- SN_SYNC_MESSAGES.NO_WORKSPACE when no folder is open.
- SN_SYNC_MESSAGES.AUTH_CANCELLED for user cancellation/invalid input.
- SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX for save failures.
- SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX when URL policy checks fail.

## Direct dependencies

- SnAuthService
- SN_SYNC_INPUTS
- SN_SYNC_MESSAGES
- snCommandRuntime helpers (getWorkspaceFolderOrShowError, showPrefixedCommandError)
- SnAuthRuntime

## Sequence diagram

```mermaid
sequenceDiagram
	participant U as User
	participant C as sn: auth command
	participant R as Runtime
	participant S as SnAuthService
	participant B as Browser

	U->>C: Run command
	C->>R: getWorkspaceFolderUri()
	alt No workspace
		C->>R: showErrorMessage(NO_WORKSPACE)
	else Workspace exists
		C->>R: askChoice(authMethod)
		C->>R: askInput(instanceName)
		C->>R: askInput(instanceUrl)
		alt authMethod == basic
			C->>R: askInput(username)
			C->>R: askInput(password)
		else authMethod == oauth
			C->>R: askInput(clientId)
			C->>S: beginOAuthSignIn(workspaceFolderUri, instanceUrl, clientId)
			S-->>C: authorizationUrl + codeVerifier
			C->>R: showInformationMessage(open browser message)
			C->>B: openExternal(authorizationUrl)
			C->>R: askInput(authorizationCode)
		end
		alt Any required value canceled or empty
			C->>R: showInformationMessage(AUTH_CANCELLED)
		else Complete auth payload
			C->>S: saveAuth(context, workspaceFolderUri, authInput)
			alt Success
				C->>R: showInformationMessage(AUTH_SUCCESS)
			else Failure
				C->>R: showErrorMessage(AUTH_FAILED_PREFIX + error)
			end
			end
		end
	end
```

## Troubleshooting

- Symptom: Command exits with "sn-sync auth cancelled"
  - Cause: One input was canceled or blank.
  - Resolution: Rerun command and complete all fields.

- Symptom: "Failed to save sn-sync auth"
  - Cause: Secret storage/config write failure.
  - Resolution: Check VS Code workspace permissions and retry.

- Symptom: Later commands still fail auth
  - Cause: Saved auth is invalid, expired, or incomplete for the selected auth type.
  - Resolution: Run sn: auth validate. If needed, rerun sn: auth and re-save the intended method.

- Symptom: OAuth flow fails during token exchange/refresh
  - Cause: Invalid client id/code, expired code, missing refresh token, or network issues.
  - Resolution: Rerun sn: auth (OAuth path), complete sign-in again, and validate with sn: auth validate.
