# sn-sync Documentation

This folder contains technical documentation for all extension commands and the overall architecture.

Authentication model summary:

- Connection auth is resolved from VS Code Secret Storage only.
- Runtime resolution uses the explicit auth type saved by `sn: auth` (`basic` or `oauth`).
- OAuth flow uses Authorization Code + PKCE with browser sign-in and pasted authorization code.
- Instance URL policy enforces HTTPS and allows only `service-now.com` hosts by default.
- Custom hosts are opt-in via `sn-sync.auth.allowCustomHosts` and `sn-sync.auth.customHosts`.

Transport and runtime summary:

- ServiceNow HTTP traffic is centralized in a shared got-based transport helper.
- Command handlers share runtime helpers for workspace resolution, notification progress, and prefixed error reporting.
- Command registrations provide immediate status-bar execution feedback with per-command messages and debounce.

Documented commands:

- sn: init -> sn-sync.sn-init
- sn: auth -> sn-sync.auth
- sn: auth validate -> sn-sync.auth-validate
- sn: reset auth -> sn-sync.reset-auth
- sn: run background script -> sn-sync.run-background-script
- sn: open active in instance -> sn-sync.open-active-in-instance
- sn: pull -> sn-sync.pull
- sn: pull by sys_id -> sn-sync.pull-by-sys-id
- sn: reset index -> sn-sync.reset-index
- sn: push active -> sn-sync.push-active
- sn: push modified -> sn-sync.push-modified
- sn: push report -> sn-sync.push-report

Files:

- sn-init.md
- sn-auth.md
- sn-auth-validate.md
- sn-reset-auth.md
- sn-run-background-script.md
- sn-open-active-in-instance.md
- sn-pull.md
- sn-pull-by-sys-id.md
- sn-reset-index.md
- sn-push-active.md
- sn-push-modified.md
- sn-push-report.md
- error-handling.md
- architecture.md
- release-workflow.md (includes Versioning policy section)
