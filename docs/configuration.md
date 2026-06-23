---
layout: default
title: Configuration
nav_order: 3
description: "Configure .snsyncrc and VS Code settings for sn-sync."
---

# Configuration
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## .snsyncrc

The `.snsyncrc` file lives in your workspace root and holds the non-sensitive sync configuration. It is created automatically by `sn: init`. Commit it to your repository — it contains no credentials.

{: .warning }
> Never put passwords or tokens in `.snsyncrc`. Credentials are managed by `sn: auth` and stored in VS Code Secret Storage.

### Instance name

```json
{
  "instance": "mycompany"
}
```

This is the subdomain of your ServiceNow URL. For `https://mycompany.service-now.com`, use `mycompany`.

To update it, run `sn: init` again or edit the file directly.

### Sync settings (tables)

The `settings` array defines which ServiceNow tables and fields are synced. Each entry maps a table to the script field(s) you want to pull and push.

`sn: init` pre-populates the most common script tables:

| Table name | Record type |
|------------|-------------|
| `sys_script` | Business Rules |
| `sys_script_include` | Script Includes |
| `sys_script_client` | Client Scripts |
| `sys_ui_action` | UI Actions |
| `sys_security_acl` | ACL Scripts |
| `sysauto_script` | Scheduled Jobs |
| `sysevent_script_action` | Script Actions |
| `sp_widget` | Service Portal Widgets |

You can add, remove, or modify entries to match the tables your project uses.

---

## VS Code settings

These settings are configured in VS Code (`Cmd+,` / `Ctrl+,` or `settings.json`).

### General

| Setting | Default | Description |
|---------|---------|-------------|
| `sn-sync.rootDir` | _(workspace root)_ | Override the root directory where pulled files are saved |
| `sn-sync.pull.clearBeforePull` | `false` | Delete the pull destination folder contents before each pull |

### Status bar

The status bar gives you one-click access to common commands without opening the Command Palette.

| Setting | Default | Description |
|---------|---------|-------------|
| `sn-sync.statusBar.enabled` | `true` | Show sn-sync items in the status bar |
| `sn-sync.statusBar.mode` | `minimal` | `minimal` (single menu button) or `expanded` (individual buttons) |
| `sn-sync.statusBar.visibleCommands` | _(all)_ | Subset of command IDs to show in the status bar or menu |

#### Minimal mode (recommended for most users)

One status bar button that opens a quick-pick menu:

```json
{
  "sn-sync.statusBar.enabled": true,
  "sn-sync.statusBar.mode": "minimal",
  "sn-sync.statusBar.visibleCommands": ["sn-sync.pull", "sn-sync.push"]
}
```

#### Expanded mode (power users)

Individual buttons for each command:

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

#### All available command IDs

```
sn-sync.sn-init
sn-sync.auth
sn-sync.auth-config
sn-sync.auth-validate
sn-sync.reset
sn-sync.reset-auth
sn-sync.run-background-script
sn-sync.open-current-in-instance
sn-sync.pull
sn-sync.pull-all-files
sn-sync.pull-current
sn-sync.pull-table
sn-sync.pull-by-sys-id
sn-sync.reset-index
sn-sync.push
sn-sync.push-current
sn-sync.push-modified
sn-sync.push-report
```
