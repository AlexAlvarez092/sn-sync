# Command: sn: auth validate

- Command ID: sn-sync.auth-validate
- Entry point: src/commands/snAuthValidateCommand.ts
- Registration: src/extension.ts
- Exposure: internal delegate used by `sn: auth`

## Purpose

Validate that the currently resolved connection authentication is accepted by ServiceNow.

## When to use it

- Normally through `sn: auth` -> `validate auth`.
- Immediately after configuring auth.
- When credentials may have expired or been revoked.
- As a pre-flight check before pull/push operations.

## Preconditions

1. Workspace must be open.
2. Auth must be configured for this workspace/instance (`basic` or `oauth`).
3. HTTP connectivity to ServiceNow must be available.

## Step-by-step logic

1. Resolve workspaceFolderUri.
2. If no workspace, return SN_SYNC_MESSAGES.NO_WORKSPACE.
3. Call authService.validateAuth(context, workspaceFolderUri).
4. If validation succeeds, show SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS.
5. If validation fails, show SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX + error details.

## Delegated service behavior

SnAuthService.validateAuth typically:

1. Resolves saved auth from Secret Storage according to the active auth type.
2. Revalidates the stored instance URL against the active host policy (HTTPS + allowed hosts).
3. For OAuth, refreshes token first when needed and possible.
4. Calls a lightweight ServiceNow `sys_user` Table API request (same API family used for pull/push flows).
5. Interprets HTTP responses (including 401) and throws semantic errors.

## Side effects

- No local file modifications.
- No index changes.
- No credential updates.

## Error handling

- SN_SYNC_MESSAGES.NO_WORKSPACE.
- SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED when saved auth is unavailable or incomplete.
- SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX when the stored URL no longer passes host policy.
- SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX + network/HTTP/auth details.

## Direct dependencies

- SnAuthService (through SnAuthValidateServiceApi)
- SN_SYNC_MESSAGES
- snCommandRuntime helpers (getWorkspaceFolderOrShowError, showPrefixedCommandError)

## Sequence diagram

```mermaid
sequenceDiagram
	participant U as User
	participant C as sn: auth validate command
	participant R as Runtime
	participant S as SnAuthService
	participant N as ServiceNow API

	U->>C: Run internal delegate
	C->>R: getWorkspaceFolderUri()
	alt No workspace
		C->>R: showErrorMessage(NO_WORKSPACE)
	else Workspace exists
		C->>S: validateAuth(context, workspaceFolderUri)
		S->>N: GET sys_user table endpoint
		N-->>S: HTTP response
		alt Validation success
			C->>R: showInformationMessage(AUTH_VALIDATE_SUCCESS)
		else Validation failure
			C->>R: showErrorMessage(AUTH_VALIDATE_FAILED_PREFIX + error)
		end
	end
```

## Troubleshooting

- Symptom: "sn-sync auth is not configured"
  - Cause: No valid saved auth is configured for the current instance, or payload is incomplete.
  - Resolution: Run `sn: auth` and verify secrets were saved correctly.

- Symptom: Invalid credentials error (401)
  - Cause: Basic credentials are invalid, or OAuth token/client context is no longer accepted.
  - Resolution: Run `sn: auth`, choose `configure auth`, and save fresh credentials/tokens.

- Symptom: HTTP/network validation failures
  - Cause: Connectivity, DNS, proxy, or instance URL problems.
  - Resolution: Verify instance URL and network path to ServiceNow.
