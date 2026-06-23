---
layout: default
title: Getting Started
nav_order: 2
description: "Install sn-sync and set up your first ServiceNow workspace in VS Code."
---

# Getting Started
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Installation

Install sn-sync from the VS Code Marketplace:

1. Open VS Code
2. Open the Extensions panel (`Cmd+Shift+X` on macOS, `Ctrl+Shift+X` on Windows/Linux)
3. Search for **sn-sync**
4. Click **Install**

Alternatively, install from the terminal:

```bash
code --install-extension AlexAlvarez.sn-sync
```

---

## First-time setup

Follow these steps once per workspace (project folder).

### Step 1 — Open your project folder

Open the folder where you want ServiceNow files to be saved (`File → Open Folder`).

### Step 2 — Initialize the workspace

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`), type **sn: init**, and run it.

This creates a `.snsyncrc` file in the workspace root with default sync settings.

When prompted, enter your ServiceNow **instance name** — the subdomain of your instance URL.

{: .highlight }
> **Example:** for `https://mycompany.service-now.com`, the instance name is `mycompany`.

### Step 3 — Configure authentication

Run **sn: auth** from the Command Palette and choose **configure auth**.

Select an authentication method:

| Method | When to use |
|--------|-------------|
| **basic** | Username + password. Simple setup, good for personal or development instances. |
| **OAuth (PKCE)** | Token-based. Recommended for shared or production instances. |

Follow the prompts. Your credentials are stored securely in VS Code Secret Storage — **never written to disk**.

### Step 4 — Validate authentication

Run **sn: auth** again and choose **validate auth**.

sn-sync will make a test call to your instance and confirm the connection works before you start pulling records.

### Step 5 — Pull records

Run **sn: pull** and choose a scope:

| Scope | What it does |
|-------|-------------|
| **all files** | Pulls all tables and records configured in `.snsyncrc` |
| **current file** | Re-pulls the record for the currently open file |
| **table** | Pulls all records from a single selected table |
| **by sys_id** | Pulls a specific record by its ServiceNow sys_id |

Files are saved under your workspace root, organised by table.

### Step 6 — Edit and push

Edit the pulled files locally. When ready, run **sn: push** and choose:

| Scope | What it does |
|-------|-------------|
| **current file** | Pushes only the file currently open in the editor |
| **all files** | Pushes all modified files with per-file conflict resolution |
| **report** | Generates a Markdown report of pending changes (no push performed) |

---

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|--------|-------|-----------------|
| Pull (scope selector) | `Cmd+Alt+P` | `Ctrl+Alt+P` |
| Pull by sys_id | `Cmd+Alt+Shift+P` | `Ctrl+Alt+Shift+P` |
| Push (scope selector) | `Cmd+Alt+U` | `Ctrl+Alt+U` |
| Open active file in instance | `Cmd+Alt+O` | `Ctrl+Alt+O` |

You can override or remove these in VS Code Keyboard Shortcuts (`Cmd+K Cmd+S`).

---

## Next steps

- Customise which tables are synced → [Configuration](configuration)
- Full command reference → [Commands](commands)
- Something not working? → [Troubleshooting](troubleshooting)
