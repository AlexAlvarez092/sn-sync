# sn-sync Documentation

This folder contains technical documentation for all extension commands and the overall architecture.

Canonical references:

- Architecture, runtime, activation, and data flows: [architecture.md](architecture.md)
- Error model, diagnostics, and redaction policy: [error-handling.md](error-handling.md)

Documented commands:

- sn: init -> sn-sync.sn-init
- sn: auth -> sn-sync.auth
- sn: auth config -> sn-sync.auth-config (internal delegate)
- sn: auth validate -> sn-sync.auth-validate (internal delegate)
- sn: reset -> sn-sync.reset
- sn: reset auth -> sn-sync.reset-auth (internal delegate)
- sn: run background script -> sn-sync.run-background-script
- sn: open active in instance -> sn-sync.open-active-in-instance
- sn: pull -> sn-sync.pull
- sn: pull all files -> sn-sync.pull-all-files (internal delegate)
- sn: pull current -> sn-sync.pull-current
- sn: pull table -> sn-sync.pull-table
- sn: pull by sys_id -> sn-sync.pull-by-sys-id
- sn: reset index -> sn-sync.reset-index (internal delegate)
- sn: push -> sn-sync.push
- sn: push modified -> sn-sync.push-modified
- sn: push current -> sn-sync.push-current
- sn: push report -> sn-sync.push-report

Push sub-options exposed by sn: push:

- all files -> delegates to sn-sync.push-modified
- current file -> delegates to sn-sync.push-current
- report -> delegates to sn-sync.push-report

Files:

- sn-init.md
- sn-auth.md
- sn-auth-config.md
- sn-auth-validate.md
- sn-reset.md
- sn-reset-auth.md
- sn-run-background-script.md
- sn-open-active-in-instance.md
- sn-pull.md
- sn-pull-all-files.md
- sn-pull-current.md
- sn-pull-table.md
- sn-pull-by-sys-id.md
- sn-reset-index.md
- sn-push.md
- sn-push-current.md
- sn-push-modified.md
- sn-push-report.md
- error-handling.md
- architecture.md
- release-workflow.md (includes Versioning policy section)
