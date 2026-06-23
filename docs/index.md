---
layout: default
title: Home
nav_order: 1
description: "sn-sync — VS Code extension to sync ServiceNow script records to local files."
permalink: /
---

# sn-sync
{: .fs-9 }

Sync ServiceNow script records to local files and push your changes back safely — all inside VS Code.
{: .fs-6 .fw-300 }

[Get started now](getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/AlexAlvarez092/sn-sync){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## What it does

sn-sync lets you work with ServiceNow scripts in a local development workflow:

- **Pull** records from ServiceNow into your project folder
- **Edit** scripts locally with VS Code, your favourite extensions, and version control
- **Push** updates back with interactive conflict resolution
- **Report** on pending changes before committing them

No browser switching. No copy-paste. Just your editor.

---

## Why use it

| Feature | Details |
|---------|---------|
| Auth stored securely | Credentials live in VS Code Secret Storage, never in files |
| Two auth methods | Basic (username + password) or OAuth with PKCE |
| Conflict resolution | Per-file choices: overwrite, merge, discard local, or skip |
| Status bar shortcuts | One-click access to common commands |
| Background scripts | Run scripts directly in ServiceNow from VS Code |

---

## Requirements

- VS Code 1.80 or later
- Access to a ServiceNow instance
- User account with permission to read/write the script tables you want to sync
