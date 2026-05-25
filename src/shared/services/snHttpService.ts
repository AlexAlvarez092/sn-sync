import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { CookieJar } from "tough-cookie";

const DEFAULT_SN_REQUEST_TIMEOUT_MS = 90000;

export interface ConnectionHeadersInput {
  headers?: Record<string, string>;
  username?: string;
  password?: string;
}

export function normalizeInstanceUrl(instanceUrl: string): string {
  return instanceUrl.replace(/\/+$/, "");
}

export function buildBasicAuthHeader(
  username: string,
  password: string,
): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`;
}

export function resolveConnectionHeaders(
  connection: ConnectionHeadersInput | undefined,
): Record<string, string> {
  if (!connection) {
    throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
  }

  if (connection.headers && Object.keys(connection.headers).length > 0) {
    return connection.headers;
  }

  if (connection.username && connection.password) {
    return {
      Authorization: buildBasicAuthHeader(
        connection.username,
        connection.password,
      ),
    };
  }

  throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
}

export function handleHttpError(
  response: Response,
  httpStatusErrorPrefix: string,
): void {
  if (response.ok) {
    return;
  }

  if (response.status === 401) {
    throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
  }

  throw new Error(
    `${httpStatusErrorPrefix} ${response.status} ${response.statusText}`.trim(),
  );
}

export function createGotFetchTransport(
  timeoutMs = DEFAULT_SN_REQUEST_TIMEOUT_MS,
): typeof fetch {
  const cookieJar = new CookieJar();

  return async (input: string | URL | Request, init?: RequestInit) => {
    const gotModule = await import("got");
    const response = await gotModule.default(input.toString(), {
      method: normalizeMethod(init?.method) as never,
      headers: toRecordHeaders(init?.headers),
      body: normalizeBody(init?.body),
      timeout: {
        request: timeoutMs,
      },
      cookieJar,
      throwHttpErrors: false,
      responseType: "text",
    });

    return new Response(response.body, {
      status: response.statusCode,
      statusText: response.statusMessage,
      headers: response.headers as Record<string, string>,
    });
  };
}

function normalizeMethod(method: string | undefined): string {
  return (method ?? "GET").toUpperCase();
}

function normalizeBody(
  body: RequestInit["body"] | null | undefined,
): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  return typeof body === "string" ? body : String(body);
}

function toRecordHeaders(
  headers: RequestInit["headers"] | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of headers) {
      normalized[key] = String(value);
    }

    return normalized;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = String(value);
  }

  return normalized;
}
