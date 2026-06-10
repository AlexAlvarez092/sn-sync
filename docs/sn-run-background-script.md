# sn: run background script

Command ID: `sn-sync.run-background-script`

## What it does

Executes the content of a local file in ServiceNow Scripts - Background using the active sn-sync authentication profile.

## Flow

1. Resolves workspace folder.
2. Uses active editor file when available, otherwise prompts for a file.
3. Reads file as UTF-8 and validates it is not empty.
4. Resolves authenticated instance context.
5. Shows a modal confirmation with target instance/user.
6. Sends script content to `sys.scripts.do`.
7. Shows execution output in `sn-sync background script` output channel.

## Notes

- This command can execute destructive server-side operations.
- Use with care in production instances.
- Authentication must be configured with `sn: auth`.
- Output panel shows printable script output line-by-line.
- In ServiceNow Background Scripts, `gs.info()` typically goes to system logs, not printable script output.
- If you want visible output in VS Code, prefer `gs.print(...)` (or `gs.warn(...)` when applicable).
- sn-sync now wraps common logging calls (`gs.info`, `gs.log`, `gs.warn`, `gs.error`, and `gs.print`) so they are also echoed into printable output when the instance allows it.
