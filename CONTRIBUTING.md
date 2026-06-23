# Contributing to sn-sync

Thanks for your interest in contributing.

This project welcomes bug reports, feature proposals, documentation improvements, and pull requests.

## Before you start

1. Read the docs under `developer-docs/`.
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
- **Maintain 100% test coverage** (statements, branches, functions, lines).
- Keep public command behavior documented in `developer-docs/`.

## Tests and validation

Run before opening a PR:

```bash
npm run coverage
```

This must report **100% coverage** across all metrics (statements, branches, functions, lines).

If your change affects command behavior, update/add:

- unit tests in `src/test/unit/**`
- command docs in `developer-docs/`

## Pull request process

1. Open a PR against the default branch.
2. Fill out the PR template completely.
3. Link related issue(s) with `Closes #...` when applicable.
4. Respond to review feedback and keep discussion in one PR thread.

## Standard workflow for a new feature

Use this end-to-end workflow for consistency across contributors.

1. Pick and assign an issue

- Confirm the issue is approved for implementation.
- Assign the issue to yourself in GitHub before coding.
- If needed, add a short implementation note to align scope.

2. Create a standardized branch

- Branch from the latest default branch.
- Naming convention:
  - `feature/<short-kebab-description>` for new features
  - `fix/<short-kebab-description>` for bug fixes
  - `docs/<short-kebab-description>` for docs-only work

Example:

```bash
git switch master
git pull --ff-only
git switch -c feature/error-reporting-standardization
```

3. Implement in small, reviewable commits

- Keep commits focused on one logical change.
- Prefer conventional commit style.
- Recommended format: `<type>(<scope>): <summary>`

Examples:

- `feat(errors): add normalized error model and mapper`
- `test(push): cover patch response branches`
- `docs(contributing): add feature workflow standard`

4. Validate locally before pushing

Run quality checks before opening a PR:

```bash
npm run coverage
```

5. Push and open PR with template

- Push branch to origin.
- Open a PR and complete every section of the PR template.
- Ensure the PR body includes a linked issue (for example `Closes #18`).
- Keep PR scoped; avoid unrelated changes.

Example:

```bash
git push -u origin feature/error-reporting-standardization
```

6. Review cycle and merge readiness

- Address review comments with follow-up commits.
- Re-run validation after each substantial change.
- Keep conversation and decisions in the PR thread for traceability.

7. Post-merge cleanup

- Delete merged branch in remote and local.
- Sync your local default branch.

Example:

```bash
git switch master
git pull --ff-only
git branch -d feature/error-reporting-standardization
git fetch --prune
```

### Minimal checklist for contributors

- Issue assigned before implementation.
- Branch name follows convention.
- Commits are focused and descriptive.
- `npm run coverage` passes.
- PR template fully completed.
- Issue linked with `Closes #...`.

## Reporting bugs and requesting features

- Use GitHub Issue templates:
  - **Bug report** for reproducible defects
  - **Feature request** for enhancements

For usage questions, use Discussions (if enabled by repository settings).

## Security

Please do not report security issues in public issues.

See `SECURITY.md` for responsible disclosure guidance.
