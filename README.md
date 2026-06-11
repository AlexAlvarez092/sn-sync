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
- Explicit authentication mode selection: basic or OAuth (PKCE).
- Pull all configured records, current record, table-scoped records, or pull by sys_id.
- Execute ServiceNow background scripts directly from VS Code.
- Open the active indexed file directly in ServiceNow.
- Push only the active file or all modified files.
- Interactive conflict actions per file: overwrite, merge, discard local, skip.
- Push report with progress and markdown output.
- Immediate command feedback in status bar with debounced spinner.

## Quick start

1. Open your project folder in VS Code.
2. Run `sn: init`.
3. Run `sn: auth`, choose `basic` or `oauth`, and complete the prompts.
4. Run `sn: pull` and choose a scope.
5. Edit files locally.
6. Run `sn: push` and choose `current file`, `all files`, or `report`.

If you only need one specific record, use `sn: pull current` or `sn: pull by sys_id`.
If you only need one configured table, use `sn: pull table`.

## Commands

### `sn: init`

Creates the local sn-sync config for your workspace and prompts for the instance name.

### `sn: auth`

Unified auth entry point that lets you choose whether to configure auth or validate the currently saved auth.

### `sn: auth config` (internal delegate)

Saves your ServiceNow connection auth for the workspace (basic credentials or OAuth tokens).

### `sn: auth validate` (internal delegate)

Checks that your currently saved auth for the workspace is valid.

### `sn: reset`

Unified reset entry point that lets you choose `reset auth` or `reset index`.

### `sn: reset auth` (internal delegate)

Removes the currently active instance credentials from VS Code Secret Storage.

### `sn: run background script`

Executes a local file as a ServiceNow Scripts - Background script against the authenticated instance.

### `sn: open active in instance`

Opens the indexed active file as its ServiceNow record in your browser.

### `sn: pull`

Unified pull entry point that lets you choose:

- all files
- current file
- table
- by sys_id

### `sn: pull all files` (internal delegate)

Downloads all configured records into your local files.

### `sn: pull current`

Downloads the ServiceNow record associated with the current indexed file.

### `sn: pull table`

Prompts for a configured table and downloads records for that table only.

### `sn: pull by sys_id`

Downloads one specific record by table + sys_id.

### `sn: reset index` (internal delegate)

Resets the local sync index if you need a clean state.

### `sn: push`

Unified push entry point that lets you choose `all files`, `current file`, or `report`.

### `sn: push current`

Pushes only the current file in the editor, with interactive conflict resolution.

### `sn: push modified`

Pushes all locally modified indexed files, resolves conflicts file-by-file, and groups remote writes by record (table + sys_id) when possible.

### `sn: push report`

Generates a markdown report of files that would be pushed.
The report is best effort: if some metadata lookups fail, the command still returns partial results and adds details in the Note column.

## Keyboard shortcuts

Default shortcuts for common sync workflows:

- Pull: `cmd+alt+p` (macOS) / `ctrl+alt+p` (Windows/Linux)
- Pull by sys_id: `cmd+alt+shift+p` / `ctrl+alt+shift+p`
- Push (scope selector): `cmd+alt+u` / `ctrl+alt+u`
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
  - supported values: `sn-sync.sn-init`, `sn-sync.auth`, `sn-sync.auth-config`, `sn-sync.auth-validate`, `sn-sync.reset`, `sn-sync.reset-auth`, `sn-sync.run-background-script`, `sn-sync.open-active-in-instance`, `sn-sync.pull`, `sn-sync.pull-all-files`, `sn-sync.pull-current`, `sn-sync.pull-table`, `sn-sync.pull-by-sys-id`, `sn-sync.reset-index`, `sn-sync.push`, `sn-sync.push-current`, `sn-sync.push-modified`, `sn-sync.push-report`

Recommended presets:

Minimal workflow (focus on pull + push):

```json
{
  "sn-sync.statusBar.enabled": true,
  "sn-sync.statusBar.mode": "minimal",
  "sn-sync.statusBar.visibleCommands": ["sn-sync.pull", "sn-sync.push"]
}
```

Expanded workflow (power users):

```json
{
  "sn-sync.statusBar.enabled": true,
  "sn-sync.statusBar.mode": "expanded",
  "sn-sync.statusBar.visibleCommands": [
    "sn-sync.auth",
    "sn-sync.pull",
    "sn-sync.pull-current",
    "sn-sync.pull-table",
    "sn-sync.pull-by-sys-id",
    "sn-sync.push",
    "sn-sync.push-current",
    "sn-sync.push-modified",
    "sn-sync.push-report",
    "sn-sync.open-active-in-instance"
  ]
}
```

The workspace uses a `.snsyncrc` file only for non-sensitive sync configuration (`instance` selector + `settings`).

Security strategy:

- All authentication data is stored in VS Code Secret Storage (basic credentials or OAuth token payloads).
- `.snsyncrc` must not contain authentication fields or credentials.

Auth model at runtime:

1. `sn: auth` is the public auth entry point and delegates to either `configure auth` or `validate auth`.
2. `configure auth` stores one explicit auth type per workspace instance (`basic` or `oauth`).
3. `basic` uses username/password and builds an Authorization header.
4. `oauth` uses bearer tokens and refreshes automatically when token expiry is near.

There is no implicit fallback between auth types. If saved auth is incomplete or invalid, commands fail with auth-not-configured or auth-validation errors.

HTTP transport strategy:

- All ServiceNow HTTP calls go through a shared got-based transport helper.
- Pull, push, push-report, and auth validation use the same transport layer and timeout behavior.

Command runtime strategy:

- Commands share common runtime helpers for workspace resolution, progress notifications, and prefixed error reporting.
- All registered commands also use immediate status-bar execution feedback with a short debounce to avoid flicker on very fast commands.

## Need more detailed documentation?

Technical and command-level docs are available in [docs/README.md](docs/README.md):

- [docs/sn-init.md](docs/sn-init.md)
- [docs/sn-auth.md](docs/sn-auth.md)
- [docs/sn-auth-config.md](docs/sn-auth-config.md)
- [docs/sn-auth-validate.md](docs/sn-auth-validate.md)
- [docs/sn-reset.md](docs/sn-reset.md)
- [docs/sn-reset-auth.md](docs/sn-reset-auth.md)
- [docs/sn-run-background-script.md](docs/sn-run-background-script.md)
- [docs/sn-open-active-in-instance.md](docs/sn-open-active-in-instance.md)
- [docs/sn-pull.md](docs/sn-pull.md)
- [docs/sn-pull-all-files.md](docs/sn-pull-all-files.md)
- [docs/sn-pull-current.md](docs/sn-pull-current.md)
- [docs/sn-pull-table.md](docs/sn-pull-table.md)
- [docs/sn-pull-by-sys-id.md](docs/sn-pull-by-sys-id.md)
- [docs/sn-reset-index.md](docs/sn-reset-index.md)
- [docs/sn-push-current.md](docs/sn-push-current.md)
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
4. Run `npm run coverage` to ensure 100% test coverage is maintained.
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
