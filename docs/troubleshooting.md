---
layout: default
title: Troubleshooting
nav_order: 5
description: "Common issues and how to fix them in sn-sync."
---

# Troubleshooting
{: .no_toc }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Reading error messages

sn-sync error messages follow this format:

```
<prefix> (<ERROR_CODE>) <details>
```

Examples:
- `Pull failed: (SN_PULL_ALL_FILES_FAILED) network timeout`
- `Push active failed: (SN_PUSH_CURRENT_FAILED) remote conflict against baseline`

For more detail, open the VS Code output channel **sn-sync diagnostics**:

1. Go to `View → Output`
2. Select **sn-sync diagnostics** from the dropdown

The diagnostics channel logs structured entries with the error code, command, category, and timestamp. Sensitive values (passwords, tokens) are always redacted before logging.

---

## Common issues

### "No workspace folder found"

**Cause:** VS Code is open without a folder or workspace.

**Fix:** Open a folder (`File → Open Folder`) and retry the command.

---

### Auth fails or credentials are rejected

**Fix:**

1. Run `sn: auth` → **validate auth** to test current credentials
2. If validation fails, run `sn: auth` → **configure auth** and re-enter credentials
3. Confirm your instance URL is HTTPS and the host matches `*.service-now.com` (or your configured allowed host)

---

### Pull fails with a network error

**Cause:** Instance unreachable, VPN required, wrong instance name, or firewall blocking the connection.

**Fix:**

1. Confirm you can reach `https://<instance>.service-now.com` in your browser
2. Verify the instance name in `.snsyncrc`
3. Connect to VPN if required by your organisation
4. Run `sn: auth` → **validate auth** to confirm auth is working

---

### Push is blocked by a conflict

**Cause:** The remote record changed since your last pull.

**Fix:** Run `sn: push` → **all files**. For each conflicting file, choose one of:

| Action | When to use |
|--------|-------------|
| **merge** | Open VS Code's merge editor and resolve manually |
| **overwrite** | You are confident your local version is correct |
| **discard local** | You want to accept the remote version and abandon local changes |
| **skip** | Come back to this file later |

---

### Index is out of sync / push behaves unexpectedly

**Cause:** The sync index no longer reflects the actual state of local files.

**Fix:**

1. Run `sn: reset` → **reset index**
2. Run `sn: pull` → **all files** to rebuild the index from the remote state

---

### OAuth token expired / refresh fails

**Fix:**

1. Run `sn: auth` → **validate auth**
2. If validation fails, run `sn: auth` → **configure auth** and complete the OAuth flow again

---

## Error categories

When looking at the `sn-sync diagnostics` output, the `category` field helps you decide where to look first:

| Category | Typical cause | First step |
|----------|--------------|-----------|
| `auth` | Invalid, expired, or missing credentials | Re-run `sn: auth` |
| `network` | Instance unreachable or timed out | Check connectivity and instance name |
| `conflict` | Remote record changed since last pull | Pull, resolve conflict, retry push |
| `validation` | Bad input (sys_id, table name, config value) | Check command inputs and `.snsyncrc` |
| `unknown` | Unexpected error | Check full diagnostics and open a bug report |

---

## Filing a bug report

If the issue persists, open a bug report at [github.com/AlexAlvarez092/sn-sync/issues](https://github.com/AlexAlvarez092/sn-sync/issues).

Include:

1. The full error message (with error code)
2. The command that failed
3. Extension version (visible in the Extensions panel)
4. VS Code version and operating system
5. The relevant sanitised line from the `sn-sync diagnostics` output channel
