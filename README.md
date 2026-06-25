# sn-sync

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/AlexAlvarez.sn-sync?label=marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=AlexAlvarez.sn-sync)
[![VS Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/AlexAlvarez.sn-sync)](https://marketplace.visualstudio.com/items?itemName=AlexAlvarez.sn-sync)
[![CI](https://img.shields.io/github/actions/workflow/status/AlexAlvarez092/sn-sync/ci.yml?label=CI)](https://github.com/AlexAlvarez092/sn-sync/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-informational)](https://alexalvarez092.github.io/sn-sync)

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
- Interactive conflict actions per file: overwrite remote or discard local.
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

The complete command catalog and per-command behavior are documented in [developer-docs/README.md](developer-docs/README.md).

Public orchestrator commands:

- `sn: init`
- `sn: auth`
- `sn: reset`
- `sn: pull`
- `sn: push`
- `sn: run background script`
- `sn: open current in instance`

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
  - supported values: `sn-sync.sn-init`, `sn-sync.auth`, `sn-sync.auth-config`, `sn-sync.auth-validate`, `sn-sync.reset`, `sn-sync.reset-auth`, `sn-sync.run-background-script`, `sn-sync.open-current-in-instance`, `sn-sync.pull`, `sn-sync.pull-all-files`, `sn-sync.pull-current`, `sn-sync.pull-table`, `sn-sync.pull-by-sys-id`, `sn-sync.reset-index`, `sn-sync.push`, `sn-sync.push-current`, `sn-sync.push-modified`, `sn-sync.push-report`

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
    "sn-sync.open-current-in-instance"
  ]
}
```

The workspace uses a `.snsyncrc` file only for non-sensitive sync configuration (`instance` selector + `settings`).

Architecture, runtime, auth model, and transport details are maintained in [developer-docs/architecture.md](developer-docs/architecture.md).
Error taxonomy, diagnostics, and redaction rules are maintained in [developer-docs/error-handling.md](developer-docs/error-handling.md).

## Need more detailed documentation?

Technical and command-level docs are centralized in [developer-docs/README.md](developer-docs/README.md).

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
