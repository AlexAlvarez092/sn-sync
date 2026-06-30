---
layout: default
title: Commands
nav_order: 4
description: "Full reference for all sn-sync commands."
---

# Commands
{: .no_toc }

All sn-sync commands are available from the VS Code Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`). Type `sn:` to filter.

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Quick reference

| Command | Description | Shortcut (macOS) | Shortcut (Win/Linux) |
|---------|-------------|------------------|----------------------|
| `sn: init` | Initialise workspace | — | — |
| `sn: auth` | Configure or validate auth | — | — |
| `sn: pull` | Pull records (scope selector) | `Cmd+Alt+P` | `Ctrl+Alt+P` |
| `sn: pull current` | Re-pull the active file | — | — |
| `sn: pull by sys_id` | Pull a record by sys_id | `Cmd+Alt+Shift+P` | `Ctrl+Alt+Shift+P` |
| `sn: push` | Push changes (scope selector) | `Cmd+Alt+U` | `Ctrl+Alt+U` |
| `sn: run background script` | Execute script in ServiceNow | — | — |
| `sn: open current in instance` | Open active file in browser | `Cmd+Alt+O` | `Ctrl+Alt+O` |
| `sn: reset` | Reset auth or sync index | — | — |

---

## sn: init

Initialises sn-sync in the current workspace. Creates `.snsyncrc` with default sync settings (common ServiceNow script tables) and prompts for your instance name.

**Run this first** when setting up a new workspace.

**Preconditions:**
- A folder must be open in VS Code
- Write permissions in the workspace root

---

## sn: auth

Entry point for all authentication actions. Shows a menu with two options:

### configure auth

Set up or update credentials for the active workspace instance. You choose the authentication method:

- **basic** — enter your ServiceNow username and password
- **OAuth (PKCE)** — complete a token exchange flow (recommended for production)

Credentials are stored in VS Code Secret Storage. They are never written to `.snsyncrc` or any file.

### validate auth

Tests the currently saved credentials against your ServiceNow instance. Run this to confirm your auth is working before pulling or pushing.

{: .highlight }
> Run **validate auth** any time a pull or push fails with an auth error.

---

## sn: pull

Pulls records from ServiceNow into local files. Shows a scope selector:

| Scope | What gets pulled |
|-------|-----------------|
| **all files** | Every table and record configured in `.snsyncrc` |
| **current file** | The record for the file currently open in the editor |
| **table** | All records from a single table you select |
| **by sys_id** | A specific record — prompts for table name and sys_id |

Files are written to your workspace root, organised by table.

{: .note }
> After pulling, the sync index is updated with a baseline hash for each file. sn-sync uses this to detect changes when you push.

---

## sn: push

Pushes local changes back to ServiceNow. Shows a scope selector:

| Scope | What gets pushed |
|-------|-----------------|
| **current file** | Only the file currently open in the editor |
| **all files** | All files that have changed since the last pull or push |
| **report** | No push — generates a Markdown report of pending changes |

### Auto-save before push

When pushing the **current file**, if the active editor has unsaved changes, sn-sync saves the file automatically before reading its content. This ensures what is pushed to ServiceNow matches exactly what is visible in the editor. If the save fails, the push is aborted and an error message is shown.

### Conflict resolution

When a remote record has changed since your last pull, sn-sync shows a per-file conflict menu:

| Action | What happens |
|--------|-------------|
| **overwrite remote** | Your local version is pushed regardless of remote changes |
| **discard local** | Your local file is reverted to the remote version |

---

## sn: run background script

Executes the contents of the active editor (or the current text selection) as a ServiceNow background script. Results are displayed in a dedicated VS Code panel.

When you run this command:

1. sn-sync reads the active editor (or selection)
2. You are prompted to choose a scope (`global` or a specific application scope)
3. The script is sent to your ServiceNow instance
4. The output is shown in a new panel

**Preconditions:**
- An editor with a script file must be open
- Valid auth must be saved

---

## sn: open current in instance

Opens the ServiceNow record for the currently active file directly in your browser.

**Preconditions:**
- The active file must be an indexed sn-sync record (i.e. it was pulled with sn-sync)

---

## sn: reset

Clears saved state. Shows a menu with two options:

### reset auth

Removes all stored credentials for the active workspace instance. Use this when switching accounts or if credentials become corrupted.

After resetting auth, run `sn: auth` → **configure auth** to set up new credentials.

### reset index

Clears the local sync index. Use this if the index becomes inconsistent and pull/push behaviour is unexpected.

{: .warning }
> After resetting the index, run `sn: pull` → **all files** to rebuild it before attempting to push.
