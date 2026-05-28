# Release Workflow

- Workflow file: `.github/workflows/release.yml`
- Purpose: package the VS Code extension (`.vsix`) and create a GitHub Release automatically.

## Triggers

The workflow can run in two ways:

1. Tag push trigger (recommended for real releases): any tag matching `v*`.
2. Manual trigger: `workflow_dispatch` from the Actions tab.

## Preconditions

Before running the workflow, make sure:

1. The repository has Actions enabled.
2. The workflow file exists at `.github/workflows/release.yml`.
3. `package.json` contains the target version to release.
4. Your release tag matches the `package.json` version exactly (without the `v` prefix in `package.json`).

Example:

- `package.json` version: `0.0.6`
- Git tag: `v0.0.6`

## Release execution (tag-based)

Use this flow for normal releases.

1. Ensure local default branch is up to date.

```bash
git switch master
git pull --ff-only
```

2. Update `package.json` version if needed.

3. Commit and push your release changes.

```bash
git add package.json
git commit -m "chore(release): bump version to 0.0.6"
git push
```

4. Create and push the version tag.

```bash
git tag v0.0.6
git push origin v0.0.6
```

5. Open GitHub Actions and monitor `Release` workflow execution.

## Manual execution (workflow_dispatch)

Use this for dry runs or troubleshooting.

1. Go to GitHub -> Actions -> `Release`.
2. Click `Run workflow`.
3. Select branch and run.

Note:

- In manual mode there is no tag context, so tag/version validation step is skipped by design.

## What the workflow does

For each run, the workflow:

1. Checks out the repository.
2. Sets up Node.js 24 with npm cache.
3. Installs dependencies with `npm ci`.
4. Validates tag/version match (tag runs only).
5. Compiles extension code with `npm run compile`.
6. Packages extension with `npx @vscode/vsce package`.
7. Resolves generated `.vsix` file.
8. Creates GitHub Release and uploads `.vsix`.

## Validation rules

- If the tag is `vX.Y.Z`, `package.json` must be `X.Y.Z`.
- If they do not match, the workflow fails with a clear error message.

## Expected outputs

After a successful tag-triggered run:

1. A GitHub Release is created for the tag.
2. The generated `.vsix` is attached to that release.
3. Auto-generated release notes are included.

## Troubleshooting

### Workflow fails on version mismatch

Cause:

- Tag version and `package.json` version are different.

Fix:

1. Align versions.
2. Push a corrected tag.

### Workflow fails with "No .vsix file was produced"

Cause:

- Packaging failed or output file was not generated.

Fix:

1. Check compile and package step logs.
2. Reproduce locally:

```bash
npm ci
npm run compile
npx @vscode/vsce package
```

### Release is not created

Cause:

- Missing repository permission for release creation.

Fix:

1. Confirm workflow/job has `contents: write` permission.
2. Confirm GitHub Actions policy allows creating releases.
