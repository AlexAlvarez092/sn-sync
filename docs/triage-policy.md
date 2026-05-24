# Issue Triage Policy

This policy defines how maintainers classify and prioritize issues in this repository.

## Label groups

Every issue should receive labels from these groups:

1. Exactly one type label.
2. Exactly one status label.
3. Exactly one priority label.
4. One area label when the scope is known.

Recommended labels are defined in [.github/labels.yml](../.github/labels.yml).

## Triage flow

1. New issue starts with status: needs-triage.
2. Maintainer validates scope and reproduction details.
3. Assign type, area, and priority labels.
4. Move status to ready if actionable.
5. Move status to needs-info if reporter input is missing.
6. Move status to blocked if waiting on external dependency.
7. Move status to in-progress when work starts.
8. Mark duplicate or wontfix when applicable.

## Priority guidance

1. priority: p0 for broken core workflows, data loss risk, or security-sensitive defects.
2. priority: p1 for high-impact regressions and key feature gaps.
3. priority: p2 for normal enhancements, low-risk bugs, and cleanup work.

## Community labels

1. Use good first issue for small, self-contained tasks with clear acceptance criteria.
2. Use help wanted when maintainers are open to external pull requests.
