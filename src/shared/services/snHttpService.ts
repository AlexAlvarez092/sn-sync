import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

export function normalizeInstanceUrl(instanceUrl: string): string {
  return instanceUrl.replace(/\/+$/, "");
}

export function buildBasicAuthHeader(
  username: string,
  password: string,
): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`;
}

export function handleHttpError(
  response: Response,
  httpStatusErrorPrefix: string,
): void {
  if (response.ok) {
    return;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
  }

  throw new Error(
    `${httpStatusErrorPrefix} ${response.status} ${response.statusText}`.trim(),
  );
}
