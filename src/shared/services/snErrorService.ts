import * as vscode from "vscode";
import type {
  SnCommandErrorContext,
  SnErrorCategory,
  SnSyncErrorDiagnostic,
} from "@shared/models/error.js";
import { SN_SYNC_DIAGNOSTICS } from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

const REDACTED = "[REDACTED]";
const REDACT_KEYS = /(password|token|cookie|authorization|secret|bearer)/i;
const REDACT_VALUE_PATTERNS: RegExp[] = [
  /^(?:bearer|basic)\s+[a-z0-9+/_\-.=]+$/i,
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/,
  /(?:^|[?&])(?:access_token|id_token|refresh_token|token|apikey|api_key|client_secret)=[^&\s]+/i,
  /\b(?:xox[pbar]-|ghp_|glpat-|sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,})[A-Za-z0-9\-_]*\b/,
  /(?:^|\s)(?:set-cookie:|cookie:)\s*[^\s]+/i,
];

let diagnosticsChannel: vscode.OutputChannel | undefined;

// Test-only helper to reset module-level output channel state.
export function resetDiagnosticsChannelForTests(): void {
  diagnosticsChannel = undefined;
}

export function normalizeCommandError(
  error: unknown,
  context: SnCommandErrorContext,
): SnSyncErrorDiagnostic {
  const message = getErrorMessage(error);

  return {
    code: context.code,
    command: context.command,
    category: context.category ?? inferErrorCategory(message),
    message,
    timestamp: new Date().toISOString(),
    context: sanitizeErrorContext(context.context),
  };
}

export function logCommandErrorDiagnostic(
  diagnostic: SnSyncErrorDiagnostic,
): void {
  const channel = getDiagnosticsChannel();
  if (!channel) {
    return;
  }

  channel.appendLine(JSON.stringify(diagnostic));
}

export function buildCommandErrorMessage(
  prefix: string,
  diagnostic: SnSyncErrorDiagnostic,
): string {
  return `${prefix} (${diagnostic.code}) ${diagnostic.message}`;
}

function getDiagnosticsChannel(): vscode.OutputChannel | undefined {
  if (diagnosticsChannel) {
    return diagnosticsChannel;
  }

  try {
    diagnosticsChannel = vscode.window.createOutputChannel(
      SN_SYNC_DIAGNOSTICS.CHANNEL_NAME,
    );
    return diagnosticsChannel;
  } catch {
    return undefined;
  }
}

function inferErrorCategory(message: string): SnErrorCategory {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("auth") ||
    normalized.includes("credential") ||
    normalized.includes("unauthorized") ||
    normalized.includes("401")
  ) {
    return "auth";
  }

  if (normalized.includes("conflict") || normalized.includes("baseline")) {
    return "conflict";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("socket") ||
    normalized.includes("fetch") ||
    normalized.includes("econn")
  ) {
    return "network";
  }

  if (normalized.includes("invalid") || normalized.includes("missing")) {
    return "validation";
  }

  return "unknown";
}

function sanitizeErrorContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  return sanitizeValue(context, new WeakSet<object>()) as Record<
    string,
    unknown
  >;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeStringValue(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(record)) {
    if (REDACT_KEYS.test(key)) {
      sanitized[key] = REDACTED;
      continue;
    }

    sanitized[key] = sanitizeValue(item, seen);
  }

  return sanitized;
}

function sanitizeStringValue(value: string): string {
  for (const pattern of REDACT_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      return REDACTED;
    }
  }

  return value;
}
