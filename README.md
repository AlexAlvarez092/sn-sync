# sn-sync

A VS Code extension for syncing ServiceNow script records to local files and safely pushing local changes back.

## Why this project exists

sn-sync is built for developers who need a predictable local workflow around ServiceNow records:

- Pull configured records into a local source tree.
- Track local baseline hashes in a workspace index.
- Push safely with remote conflict checks.
- Generate a push report grouped by scope and update set metadata.

## Features

- Workspace bootstrap command.
- Auth setup and auth validation.
- Full pull and pull by sys_id.
- Index reset.
- Push active file with conflict protection.
- Push all modified files with all-or-nothing conflict gate.
- Push report generation with progress and markdown output.

## Commands

- sn: init
- sn: auth
- sn: auth validate
- sn: pull
- sn: pull by sys_id
- sn: reset index
- sn: push active
- sn: push modified
- sn: push report

Detailed command documentation:

- [docs/sn-init.md](docs/sn-init.md)
- [docs/sn-auth.md](docs/sn-auth.md)
- [docs/sn-auth-validate.md](docs/sn-auth-validate.md)
- [docs/sn-pull.md](docs/sn-pull.md)
- [docs/sn-pull-by-sys-id.md](docs/sn-pull-by-sys-id.md)
- [docs/sn-reset-index.md](docs/sn-reset-index.md)
- [docs/sn-push-active.md](docs/sn-push-active.md)
- [docs/sn-push-modified.md](docs/sn-push-modified.md)
- [docs/sn-push-report.md](docs/sn-push-report.md)

Architecture overview:

- [docs/architecture.md](docs/architecture.md)

## Configuration

VS Code settings contributed by the extension:

- sn-sync.rootDir
- sn-sync.pull.clearBeforePull

The project also uses .snsyncrc in workspace root for sync settings.

## Development

Install dependencies:

    npm install

Compile:

    npm run compile

Run coverage:

    npm run coverage

## Contributing and community

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support guide: [SUPPORT.md](SUPPORT.md)

Issue and PR templates are available under [.github](.github).

## License

This project is licensed under GNU Affero General Public License v3.0 or later.

See [LICENSE](LICENSE).
