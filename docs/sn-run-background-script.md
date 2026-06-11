# sn: run background script

Command ID: `sn-sync.run-background-script`

## What it does

Executes the content of a local file in ServiceNow Scripts - Background (AKA "Scheduled Job Scripts") using the active sn-sync authentication profile.

## Prerequisites

- A workspace is open in VS Code.
- `sn: auth` has been completed for your target ServiceNow instance.
- A local file contains valid JavaScript/GlideScript code.

## Flow

1. Resolves workspace folder.
2. Uses active editor file when available, otherwise prompts for a file.
3. Reads file as UTF-8 and validates it is not empty.
4. Resolves authenticated instance context.
5. Shows a modal confirmation with target instance/user.
6. Sends script content to `sys.scripts.do` with optional scope selection.
7. Shows execution output in `sn-sync background script` output channel.

## Scope resolution

Background scripts run within a specific application scope. sn-sync automatically resolves the scope using this fallback order:

1. **Explicit scope**: If a scope is available during form submission, uses it.
2. **HTML parsing**: Extracts available scope options from the scripts page.
3. **API lookup**: Queries the `sys_scope` table to resolve scope by name.
4. **Global scope**: Falls back to `global` scope if no other options are available.

The service supports scope matching by:

- Exact name match (e.g., "MyScope" matches "MyScope")
- Canonical form (e.g., "my_scope" matches "My Scope")
- Fuzzy substring (e.g., "my" matches "MyScope")

## Output handling

- Output is captured from the ServiceNow `sys.scripts.do` response.
- The command searches for printable output in HTML `<pre>` blocks.
- Common logging calls (`gs.info`, `gs.log`, `gs.warn`, `gs.error`, `gs.print`) are wrapped to ensure visibility in VS Code output channel.
- If the script produces no output, the channel will show "No output captured" message.

## Example

Create a file `debug.js` in your workspace:

```javascript
// Example: Get current user info
gs.print("Current user: " + gs.getUser().getName());
gs.print("User ID: " + gs.getUser().getID());
gs.print("Is admin: " + gs.hasRole("admin"));
```

Then run `sn: run background script` with this file active. Output appears in the output channel.

## Security and safety

- **This command can execute destructive server-side operations.** Use with care in production instances.
- The `sys.scripts.do` endpoint requires authentication—configured via `sn: auth`.
- ServiceNow validates the `ck` (cross-site request forgery) token before executing scripts.
- All network traffic is HTTPS-only (enforced by instance URL policy).

## Error handling

Common errors and their meanings:

| Error | Cause |
|-------|-------|
| `NO_WORKSPACE` | No folder is open in VS Code. |
| `NO_AUTH_CONFIGURED` | `sn: auth` has not been completed. |
| `INVALID_CREDENTIALS` | The saved credentials are expired or incorrect. Run `sn: auth` again. |
| `HTTP_ERROR_401` | Credentials validation failed. |
| `HTTP_ERROR_403` | Access denied; check instance permissions. |
| `EMPTY_SCRIPT` | The selected file is empty. |

## Notes

- In ServiceNow Background Scripts, `gs.info()` typically goes to system logs, not printable script output. Prefer `gs.print(...)` for visible output.
- The command supports both foreground and background script execution modes depending on the ServiceNow endpoint behavior.
- Execution is synchronous from VS Code's perspective—the command waits for the response before displaying results.
- If scope options cannot be resolved, the script executes in `global` scope by default.
