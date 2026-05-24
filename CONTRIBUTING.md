# Contributing to sn-sync

Thanks for your interest in contributing.

This project welcomes bug reports, feature proposals, documentation improvements, and pull requests.

## Before you start

1. Read the docs under `docs/`.
2. Search existing issues and PRs to avoid duplicates.
3. Open an issue first for significant changes, so we can align on scope.

## Development setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Build once:

```bash
npm run compile
```

4. Run tests with coverage:

```bash
npm run coverage
```

## Branching and commits

- Create a dedicated branch per change.
- Keep commits small and focused.
- Use descriptive commit messages.

Suggested prefixes:

- `fix:` for bug fixes
- `feat:` for new features
- `refactor:` for internal cleanup
- `docs:` for documentation updates
- `test:` for test-only changes

## Code quality expectations

- Keep behavior deterministic and testable.
- Prefer explicit error handling and user-facing messages.
- Avoid introducing breaking changes unless discussed first.
- Maintain or improve test coverage.
- Keep public command behavior documented in `docs/`.

## Tests and validation

Run before opening a PR:

```bash
npm run coverage
```

If your change affects command behavior, update/add:

- unit tests in `src/test/unit/**`
- command docs in `docs/`

## Pull request process

1. Open a PR against the default branch.
2. Fill out the PR template completely.
3. Link related issue(s) with `Closes #...` when applicable.
4. Respond to review feedback and keep discussion in one PR thread.

## Reporting bugs and requesting features

- Use GitHub Issue templates:
  - **Bug report** for reproducible defects
  - **Feature request** for enhancements

For usage questions, use Discussions (if enabled by repository settings).

## Security

Please do not report security issues in public issues.

See `SECURITY.md` for responsible disclosure guidance.
