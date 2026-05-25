# sn-sync

A VS Code extension to sync ServiceNow records to local files and push your changes back safely.

## What this extension does

sn-sync helps you work with ServiceNow scripts in a local workflow:

- Pull records from ServiceNow into your project.
- Edit scripts locally with your usual tools.
- Push updates back with conflict checks.
- Generate a report before pushing modified files.

## Features

- Project initialization command.
- Authentication setup and validation.
- Multiple authentication modes with deterministic priority.
- Pull all configured records or pull by sys_id.
- Push only the active file or all modified files.
- Safe conflict detection before pushing.
- Push report with progress and markdown output.

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

Creates the local sn-sync config for your workspace.

### `sn: auth`

Saves your ServiceNow connection credentials for the workspace.

### `sn: auth validate`

Checks that your saved credentials are valid.

### `sn: reset auth`

Removes the currently active instance credentials from VS Code Secret Storage.

### `sn: pull`

Downloads all configured records into your local files.

### `sn: pull by sys_id`

Downloads one specific record by table + sys_id.

### `sn: reset index`

Resets the local sync index if you need a clean state.

### `sn: push active`

Pushes only the active file in the editor, with conflict checks.

### `sn: push modified`

Pushes all locally modified indexed files, stopping on conflicts.

### `sn: push report`

Generates a markdown report of files that would be pushed.

## Configuration

VS Code settings used by the extension:

- `sn-sync.rootDir`
- `sn-sync.pull.clearBeforePull`

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

## Need more detailed documentation?

Technical and command-level docs are available in [docs/README.md](docs/README.md):

- [docs/sn-init.md](docs/sn-init.md)
- [docs/sn-auth.md](docs/sn-auth.md)
- [docs/sn-auth-validate.md](docs/sn-auth-validate.md)
- [docs/sn-reset-auth.md](docs/sn-reset-auth.md)
- [docs/sn-pull.md](docs/sn-pull.md)
- [docs/sn-pull-by-sys-id.md](docs/sn-pull-by-sys-id.md)
- [docs/sn-reset-index.md](docs/sn-reset-index.md)
- [docs/sn-push-active.md](docs/sn-push-active.md)
- [docs/sn-push-modified.md](docs/sn-push-modified.md)
- [docs/sn-push-report.md](docs/sn-push-report.md)
- [docs/architecture.md](docs/architecture.md)

## For contributors

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
