import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import {
  buildBasicAuthHeader,
  handleHttpError,
  normalizeInstanceUrl,
} from "@shared/services/snHttpService.js";
import type {
  SnScopedApplication,
  SnUpdateSet,
} from "@shared/models/updateSet.js";

interface SnTableResponseRow {
  sys_id?: string;
  name?: string;
  scope?: string;
}

interface SnTableResponse {
  result?: SnTableResponseRow[];
}

export interface SnUpdateSetDataServiceApi {
  listScopedApplications(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnScopedApplication[]>;
  listInProgressUpdateSets(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    applicationSysId: string,
  ): Promise<SnUpdateSet[]>;
}

export class SnUpdateSetDataService implements SnUpdateSetDataServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = fetch,
  ) {}

  public async listScopedApplications(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnScopedApplication[]> {
    const result = await this.requestTable(
      context,
      workspaceFolderUri,
      SN_SYNC_SERVICENOW.TABLES.SCOPE,
      SN_SYNC_SERVICENOW.QUERIES.NON_EMPTY_SCOPE,
      SN_SYNC_SERVICENOW.FIELDS.SCOPED_APPLICATION,
    );

    return result
      .filter(
        (row) =>
          typeof row.sys_id === "string" &&
          typeof row.name === "string" &&
          typeof row.scope === "string",
      )
      .map((row) => ({
        sys_id: row.sys_id as string,
        name: row.name as string,
        scope: row.scope as string,
      }));
  }

  public async listInProgressUpdateSets(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    applicationSysId: string,
  ): Promise<SnUpdateSet[]> {
    const query =
      SN_SYNC_SERVICENOW.QUERIES.inProgressUpdateSets(applicationSysId);

    const result = await this.requestTable(
      context,
      workspaceFolderUri,
      SN_SYNC_SERVICENOW.TABLES.UPDATE_SET,
      query,
      SN_SYNC_SERVICENOW.FIELDS.UPDATE_SET,
    );

    return result
      .filter(
        (row) => typeof row.sys_id === "string" && typeof row.name === "string",
      )
      .map((row) => ({
        sys_id: row.sys_id as string,
        name: row.name as string,
      }));
  }

  private async requestTable(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    tableName: string,
    query: string,
    fields: string,
  ): Promise<SnTableResponseRow[]> {
    const savedAuth = await this.authService.getSavedAuth(
      context,
      workspaceFolderUri,
    );

    if (!savedAuth) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    const normalizedUrl = normalizeInstanceUrl(savedAuth.instanceUrl);
    const encodedQuery = encodeURIComponent(query);
    const encodedFields = encodeURIComponent(fields);

    const response = await this.fetchApi(
      `${normalizedUrl}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/${tableName}?sysparm_query=${encodedQuery}&sysparm_fields=${encodedFields}`,
      {
        method: "GET",
        headers: {
          Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          Authorization: buildBasicAuthHeader(
            savedAuth.username,
            savedAuth.password,
          ),
        },
      },
    );

    handleHttpError(response, SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX);

    const payload = (await response.json()) as SnTableResponse;
    if (!Array.isArray(payload.result)) {
      return [];
    }

    return payload.result;
  }
}
