# sn-sync

A VS Code extension to sync ServiceNow records to local files and push your changes back safely.

## What this extension does

sn-sync helps you work with ServiceNow scripts in a local workflow:

- Pull records from ServiceNow into your project.
- Edit scripts locally with your usual tools.
- Push updates back with interactive conflict resolution.
- Generate a report before pushing modified files.

## Features

- Project initialization command.
- Authentication setup and validation.
- Multiple authentication modes with deterministic priority.
- Pull all configured records or pull by sys_id.
- Open the active indexed file directly in ServiceNow.
- Push only the active file or all modified files.
- Interactive conflict actions per file: overwrite, merge, discard local, skip.
- Push report with progress and markdown output.
- Immediate command feedback in status bar with debounced spinner.

## Quick start

1. Open your project folder in VS Code.
2. Run `sn: init`.
3. Run `sn: auth` and complete your ServiceNow credentials.
4. Run `sn: pull` to bring records into your local source folder.
5. Edit files locally.
6. Run `sn: push active` or `sn: push modified`.

If you only need one specific record, use `sn: pull by sys_id`.

## Commands

### `sn: init`

Creates the local sn-sync config for your workspace and prompts for the instance name.

### `sn: auth`

Saves your ServiceNow connection credentials for the workspace.

### `sn: auth validate`

Checks that your saved credentials are valid.

### `sn: reset auth`

Removes the currently active instance credentials from VS Code Secret Storage.

### `sn: run background script`

Executes a local file as a ServiceNow Scripts - Background script against the authenticated instance.

### `sn: open active in instance`

Opens the indexed active file as its ServiceNow record in your browser.

### `sn: pull`

Downloads all configured records into your local files.

### `sn: pull by sys_id`

Downloads one specific record by table + sys_id.

### `sn: reset index`

Resets the local sync index if you need a clean state.

### `sn: push active`

Pushes only the active file in the editor, with interactive conflict resolution.

### `sn: push modified`

Pushes all locally modified indexed files, resolves conflicts file-by-file, and groups remote writes by record (table + sys_id) when possible.

### `sn: push report`

Generates a markdown report of files that would be pushed.
The report is best effort: if some metadata lookups fail, the command still returns partial results and adds details in the Note column.

## Keyboard shortcuts

Default shortcuts for common sync workflows:

- Pull: `cmd+alt+p` (macOS) / `ctrl+alt+p` (Windows/Linux)
- Pull by sys_id: `cmd+alt+shift+p` / `ctrl+alt+shift+p`
- Push active: `cmd+alt+u` / `ctrl+alt+u`
- Push modified: `cmd+alt+shift+u` / `ctrl+alt+shift+u`
- Push report: `cmd+alt+r` / `ctrl+alt+r`
- Open active in instance: `cmd+alt+o` / `ctrl+alt+o`

These shortcuts are optional defaults. You can override or remove them in VS Code Keyboard Shortcuts.

## Status bar shortcuts

sn-sync can expose one-click status bar actions for common commands.

- minimal mode: one `sn-sync` status bar item that opens a quick-pick menu.
- expanded mode: direct command buttons.

Status bar actions respect context:

- hidden when no workspace is open.
- editor-dependent actions (for example `sn: push active`) are hidden when there is no active editor.

## Configuration

VS Code settings used by the extension:

- `sn-sync.rootDir`
- `sn-sync.pull.clearBeforePull`
- `sn-sync.statusBar.enabled`
- `sn-sync.statusBar.mode`
- `sn-sync.statusBar.visibleCommands`

Status bar setting details:

- `sn-sync.statusBar.enabled`: enable or disable status bar shortcuts (`true` by default).
- `sn-sync.statusBar.mode`: `minimal` or `expanded` (`minimal` by default).
- `sn-sync.statusBar.visibleCommands`: subset of supported command IDs shown in status bar/menu.
  - supported values: `sn-sync.sn-init`, `sn-sync.auth`, `sn-sync.auth-validate`, `sn-sync.reset-auth`, `sn-sync.run-background-script`, `sn-sync.open-active-in-instance`, `sn-sync.pull`, `sn-sync.pull-by-sys-id`, `sn-sync.reset-index`, `sn-sync.push-active`, `sn-sync.push-modified`, `sn-sync.push-report`

Recommended presets:

Minimal workflow (focus on pull + push):

```json
{
  "sn-sync.statusBar.enabled": true,
  "sn-sync.statusBar.mode": "minimal",
  "sn-sync.statusBar.visibleCommands": [
    "sn-sync.pull",
    "sn-sync.push-active",
    "sn-sync.push-modified"
  ]
}
```

Expanded workflow (power users):

```json
{
  "sn-sync.statusBar.enabled": true,
  "sn-sync.statusBar.mode": "expanded",
  "sn-sync.statusBar.visibleCommands": [
    "sn-sync.auth",
    "sn-sync.auth-validate",
    "sn-sync.pull",
    "sn-sync.pull-by-sys-id",
    "sn-sync.push-active",
    "sn-sync.push-modified",
    "sn-sync.push-report",
    "sn-sync.open-active-in-instance"
  ]
}
```

The workspace uses a `.snsyncrc` file only for non-sensitive sync configuration (`instance` selector + `settings`).

Security strategy:

- All authentication data is stored in VS Code Secret Storage.
- `.snsyncrc` must not contain authentication fields or credentials.

Auth precedence at runtime:

1. Session headers (when present in saved secret payload)
2. Bearer header (when present in saved secret payload)
3. Basic auth from credentials saved with `sn: auth`

If none of the above is available, commands that call ServiceNow fail with an auth-not-configured error.

HTTP transport strategy:

- All ServiceNow HTTP calls go through a shared got-based transport helper.
- Pull, push, push-report, and auth-validate use the same transport layer and timeout behavior.

Command runtime strategy:

- Commands share common runtime helpers for workspace resolution, progress notifications, and prefixed error reporting.
- All registered commands also use immediate status-bar execution feedback with a short debounce to avoid flicker on very fast commands.

## Need more detailed documentation?

Technical and command-level docs are available in [docs/README.md](docs/README.md):

- [docs/sn-init.md](docs/sn-init.md)
- [docs/sn-auth.md](docs/sn-auth.md)
- [docs/sn-auth-validate.md](docs/sn-auth-validate.md)
- [docs/sn-reset-auth.md](docs/sn-reset-auth.md)
- [docs/sn-run-background-script.md](docs/sn-run-background-script.md)
- [docs/sn-open-active-in-instance.md](docs/sn-open-active-in-instance.md)
- [docs/sn-pull.md](docs/sn-pull.md)
- [docs/sn-pull-by-sys-id.md](docs/sn-pull-by-sys-id.md)
- [docs/sn-reset-index.md](docs/sn-reset-index.md)
- [docs/sn-push-active.md](docs/sn-push-active.md)
- [docs/sn-push-modified.md](docs/sn-push-modified.md)
- [docs/sn-push-report.md](docs/sn-push-report.md)
- [docs/error-handling.md](docs/error-handling.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/release-workflow.md](docs/release-workflow.md)

## For contributors

Quick contribution flow:

1. Pick or open an issue and assign it to yourself.
2. Create a branch using project conventions (`feature/*`, `fix/*`, `docs/*`).
3. Implement with focused commits and clear messages.
4. Run `npm run coverage` before opening a PR.
5. Open a PR using the template and link the issue with `Closes #...`.

For full contribution standards and examples, see [CONTRIBUTING.md](CONTRIBUTING.md).

Development and contribution details:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

Issue and PR templates are in [.github](.github).

## Acknowledgment

This project was inspired by the extension [ikosak-sync-now](https://marketplace.visualstudio.com/items?itemName=AndreKosak.ikosak-sync-now), which I used for years in real ServiceNow workflows.

If you are evaluating alternatives, it is also worth checking out [ikosak-sync-now](https://marketplace.visualstudio.com/items?itemName=AndreKosak.ikosak-sync-now).

## License

This project is licensed under GNU Affero General Public License v3.0 or later.

See [LICENSE](LICENSE).
