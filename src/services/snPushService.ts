import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import {
  createGotFetchTransport,
  handleHttpError,
  normalizeInstanceUrl,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";
import type { SnSyncIndexEntry } from "@shared/models/syncIndex.js";

export interface SnPushServiceApi {
  getRemoteFieldContent(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    entry: SnSyncIndexEntry,
  ): Promise<string>;
  pushFieldContent(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    entry: SnSyncIndexEntry,
    content: string,
  ): Promise<string>;
}

interface SnRecordResponse {
  result?: Record<string, unknown>;
}

export class SnPushService implements SnPushServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = createGotFetchTransport(),
  ) {}

  public async getRemoteFieldContent(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    entry: SnSyncIndexEntry,
  ): Promise<string> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(connection.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/${entry.table}/${entry.sysId}?sysparm_fields=${encodeURIComponent(entry.fieldName)}`,
      {
        method: "GET",
        headers: {
          Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          ...headers,
        },
      },
    );

    handleHttpError(response, SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX);

    const payload = (await response.json()) as SnRecordResponse;
    const value = payload.result?.[entry.fieldName];

    if (value === undefined || value === null) {
      return "";
    }

    return String(value);
  }

  public async pushFieldContent(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    entry: SnSyncIndexEntry,
    content: string,
  ): Promise<string> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(connection.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/${entry.table}/${entry.sysId}`,
      {
        method: "PATCH",
        headers: {
          Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          "Content-Type": SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          ...headers,
        },
        body: JSON.stringify({
          [entry.fieldName]: content,
        }),
      },
    );

    handleHttpError(response, SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX);

    const payload = (await response.json()) as SnRecordResponse;
    const value = payload.result?.[entry.fieldName];
    return value === undefined || value === null ? "" : String(value);
  }
}
