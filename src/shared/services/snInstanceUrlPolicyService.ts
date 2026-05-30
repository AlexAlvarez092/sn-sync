import { isIP } from "node:net";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

const DEFAULT_SERVICENOW_HOST = "service-now.com";

export interface InstanceUrlPolicyPreferences {
  allowCustomHosts: boolean;
  customHosts: string[];
}

export function normalizeAndValidateInstanceUrl(
  rawInstanceUrl: string,
  preferences: InstanceUrlPolicyPreferences,
): string {
  const parsedUrl = parseInstanceUrl(rawInstanceUrl);
  const protocol = parsedUrl.protocol.toLowerCase();

  if (protocol !== "https:") {
    throwInvalidInstanceUrl("Only HTTPS URLs are allowed.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throwInvalidInstanceUrl("Embedded credentials in the URL are not allowed.");
  }

  if (parsedUrl.port && parsedUrl.port !== "443") {
    throwInvalidInstanceUrl("Only the default HTTPS port is allowed.");
  }

  const normalizedHost = parsedUrl.hostname.trim().toLowerCase();

  if (
    normalizedHost === "localhost" ||
    normalizedHost.endsWith(".localhost") ||
    isIP(normalizedHost) !== 0
  ) {
    throwInvalidInstanceUrl("IP addresses and localhost are not allowed.");
  }

  const isDefaultServiceNowHost =
    normalizedHost === DEFAULT_SERVICENOW_HOST ||
    normalizedHost.endsWith(`.${DEFAULT_SERVICENOW_HOST}`);

  if (!isDefaultServiceNowHost) {
    const allowedCustomHosts = new Set(
      preferences.customHosts
        .map((host) => normalizeConfiguredHost(host))
        .filter((host): host is string => Boolean(host)),
    );
    const isAllowedCustomHost =
      preferences.allowCustomHosts && allowedCustomHosts.has(normalizedHost);

    if (!isAllowedCustomHost) {
      throwInvalidInstanceUrl(
        "Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.",
      );
    }
  }

  return `https://${normalizedHost}`;
}

function parseInstanceUrl(rawInstanceUrl: string): URL {
  const trimmed = rawInstanceUrl.trim();
  if (!trimmed) {
    throwInvalidInstanceUrl("URL is required.");
  }

  try {
    return new URL(trimmed);
  } catch {
    throwInvalidInstanceUrl("URL must be a valid absolute URL.");
  }
}

function normalizeConfiguredHost(rawHost: string): string | undefined {
  const trimmed = rawHost.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalizedFromUrl = tryNormalizeHostFromUrl(trimmed);
  const normalized = normalizedFromUrl ?? trimmed.toLowerCase();

  if (!normalized || normalized.includes("/") || normalized.includes("@")) {
    return undefined;
  }

  if (normalized.startsWith(".") || normalized.endsWith(".")) {
    return undefined;
  }

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isIP(normalized) !== 0
  ) {
    return undefined;
  }

  return normalized;
}

function tryNormalizeHostFromUrl(rawValue: string): string | undefined {
  try {
    const parsed = new URL(rawValue);
    if (parsed.username || parsed.password) {
      return undefined;
    }

    return parsed.hostname.trim().toLowerCase();
  } catch {
    return undefined;
  }
}

function throwInvalidInstanceUrl(reason: string): never {
  throw new Error(
    `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} ${reason}`,
  );
}
