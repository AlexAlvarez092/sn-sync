import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import {
  buildServiceNowTableApiUrl,
  createGotFetchTransport,
  handleHttpError,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";
import type { SnSyncIndexCandidate } from "@services/snSyncIndexService.js";
import type { SnServiceNowConnectionAuth } from "@services/snAuthService.js";
import { normalizeOptionalString } from "@shared/services/snStringService.js";
import { SN_SYNC_VALUES } from "@shared/constants/snSyncConstants.js";

interface SnRecordResponse {
  result?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface SnPushReportFileItem {
  localPath: string;
  table: string;
  fieldName: string;
  scopeId: string;
  scopeName: string;
  updateSetId?: string;
  updateSetName?: string;
  resolutionNote?: string;
}

export interface SnPushReportScopeSummaryItem {
  scopeId: string;
  scopeName: string;
  files: number;
  updateSetId?: string;
  updateSetName?: string;
}

export interface SnPushReportData {
  files: SnPushReportFileItem[];
  scopes: SnPushReportScopeSummaryItem[];
}

export interface SnPushReportBuildProgress {
  processed: number;
  total: number;
  localPath: string;
}

export interface SnPushReportBuildOptions {
  onProgress?: (progress: SnPushReportBuildProgress) => void;
}

export interface SnPushReportServiceApi {
  buildPushReport(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    candidates: SnSyncIndexCandidate[],
    options?: SnPushReportBuildOptions,
  ): Promise<SnPushReportData>;
}

export class SnPushReportService implements SnPushReportServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = createGotFetchTransport(),
  ) {}

  public async buildPushReport(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    candidates: SnSyncIndexCandidate[],
    options?: SnPushReportBuildOptions,
  ): Promise<SnPushReportData> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);

    const scopeCache = new Map<
      string,
      { scopeId: string; scopeName: string }
    >();
    const updateSetCache = new Map<
      string,
      { updateSetId?: string; updateSetName?: string }
    >();
    const files: SnPushReportFileItem[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const recordKey = `${candidate.entry.table}:${candidate.entry.sysId}`;
      let scopeInfo = scopeCache.get(recordKey);
      let resolutionNote: string | undefined;

      if (!scopeInfo) {
        try {
          scopeInfo = await this.loadRecordScope(
            connection,
            headers,
            candidate,
          );
          scopeCache.set(recordKey, scopeInfo);
        } catch (error) {
          if (!this.isNotFoundError(error)) {
            throw error;
          }

          scopeInfo = {
            scopeId: SN_SYNC_VALUES.UNKNOWN,
            scopeName: SN_SYNC_VALUES.UNKNOWN,
          };
          scopeCache.set(recordKey, scopeInfo);
          resolutionNote = SN_SYNC_MESSAGES.PUSH_REPORT_RECORD_NOT_FOUND_NOTE;
        }
      }

      let updateSetInfo = updateSetCache.get(scopeInfo.scopeId);
      if (!updateSetInfo && scopeInfo.scopeId !== SN_SYNC_VALUES.UNKNOWN) {
        try {
          updateSetInfo = await this.loadScopeUpdateSet(
            connection,
            headers,
            scopeInfo.scopeId,
          );
          updateSetCache.set(scopeInfo.scopeId, updateSetInfo);
        } catch (error) {
          if (!this.isNotFoundError(error)) {
            throw error;
          }

          updateSetInfo = {};
          updateSetCache.set(scopeInfo.scopeId, updateSetInfo);
          resolutionNote =
            resolutionNote ??
            SN_SYNC_MESSAGES.PUSH_REPORT_UPDATE_SET_TABLE_UNAVAILABLE_NOTE;
        }
      }

      const resolvedUpdateSetInfo = updateSetInfo ?? {};

      files.push({
        localPath: candidate.entry.localPath,
        table: candidate.entry.table,
        fieldName: candidate.entry.fieldName,
        scopeId: scopeInfo.scopeId,
        scopeName: scopeInfo.scopeName,
        updateSetId: resolvedUpdateSetInfo.updateSetId,
        updateSetName: resolvedUpdateSetInfo.updateSetName,
        resolutionNote,
      });

      options?.onProgress?.({
        processed: index + 1,
        total: candidates.length,
        localPath: candidate.entry.localPath,
      });
    }

    const scopesMap = new Map<string, SnPushReportScopeSummaryItem>();
    for (const file of files) {
      const current = scopesMap.get(file.scopeId);
      if (current) {
        current.files += 1;
        continue;
      }

      scopesMap.set(file.scopeId, {
        scopeId: file.scopeId,
        scopeName: file.scopeName,
        files: 1,
        updateSetId: file.updateSetId,
        updateSetName: file.updateSetName,
      });
    }

    return {
      files,
      scopes: Array.from(scopesMap.values()).sort((a, b) =>
        a.scopeName.localeCompare(b.scopeName),
      ),
    };
  }

  private async loadRecordScope(
    connection: SnServiceNowConnectionAuth,
    headers: Record<string, string>,
    candidate: SnSyncIndexCandidate,
  ): Promise<{ scopeId: string; scopeName: string }> {
    const response = await this.fetchApi(
      buildServiceNowTableApiUrl(
        connection.instanceUrl,
        candidate.entry.table,
        {
          pathSegments: [{ value: candidate.entry.sysId, label: "sys_id" }],
          queryParams: {
            sysparm_fields: "sys_scope,sys_scope.scope,sys_scope.name",
          },
        },
      ),
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
    const record =
      payload.result && !Array.isArray(payload.result)
        ? payload.result
        : ({} as Record<string, unknown>);

    const scopeId =
      this.normalize(record["sys_scope.scope"]) ||
      this.normalize(record.sys_scope) ||
      SN_SYNC_VALUES.GLOBAL;

    const scopeName =
      this.normalize(record["sys_scope.name"]) ||
      (scopeId === SN_SYNC_VALUES.GLOBAL ? SN_SYNC_VALUES.GLOBAL : scopeId);

    return {
      scopeId,
      scopeName,
    };
  }

  private async loadScopeUpdateSet(
    connection: SnServiceNowConnectionAuth,
    headers: Record<string, string>,
    scopeId: string,
  ): Promise<{ updateSetId?: string; updateSetName?: string }> {
    const preferredUpdateSetId =
      await this.loadScopeUpdateSetFromUserPreference(
        connection,
        headers,
        scopeId,
      );

    if (preferredUpdateSetId) {
      let preferredUpdateSetName: string | undefined;
      try {
        preferredUpdateSetName = await this.loadUpdateSetNameById(
          connection,
          headers,
          preferredUpdateSetId,
        );
      } catch (error) {
        if (!this.isNotFoundError(error)) {
          throw error;
        }
      }

      return {
        updateSetId: preferredUpdateSetId,
        updateSetName: preferredUpdateSetName,
      };
    }

    const query = encodeURIComponent(
      `sys_scope=${scopeId}^is_default=true^ORDERBYDESCsys_updated_on`,
    );

    const response = await this.fetchApi(
      buildServiceNowTableApiUrl(connection.instanceUrl, "sys_update_set", {
        queryParams: {
          sysparm_query: `sys_scope=${scopeId}^is_default=true^ORDERBYDESCsys_updated_on`,
          sysparm_fields: "sys_id,name",
          sysparm_limit: 1,
        },
      }),
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
    const rows = Array.isArray(payload.result) ? payload.result : [];
    const row = rows[0];

    if (!row) {
      return {};
    }

    return {
      updateSetId: this.normalize(row.sys_id),
      updateSetName: this.normalize(row.name),
    };
  }

  private async loadScopeUpdateSetFromUserPreference(
    connection: SnServiceNowConnectionAuth,
    headers: Record<string, string>,
    scopeId: string,
  ): Promise<string | undefined> {
    if (!connection.username) {
      return undefined;
    }

    const response = await this.fetchApi(
      buildServiceNowTableApiUrl(
        connection.instanceUrl,
        "sys_user_preference",
        {
          queryParams: {
            sysparm_query: `name=updateSetForScope${scopeId}^user.user_name=${connection.username}`,
            sysparm_fields: "value",
            sysparm_limit: 1,
          },
        },
      ),
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
    const rows = Array.isArray(payload.result) ? payload.result : [];
    const row = rows[0];

    return this.normalize(row?.value);
  }

  private async loadUpdateSetNameById(
    connection: SnServiceNowConnectionAuth,
    headers: Record<string, string>,
    updateSetId: string,
  ): Promise<string | undefined> {
    const response = await this.fetchApi(
      buildServiceNowTableApiUrl(connection.instanceUrl, "sys_update_set", {
        pathSegments: [{ value: updateSetId, label: "update set id" }],
        queryParams: {
          sysparm_fields: "name",
        },
      }),
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
    const row =
      payload.result && !Array.isArray(payload.result) ? payload.result : {};

    return this.normalize(row.name);
  }

  private normalize(value: unknown): string | undefined {
    return normalizeOptionalString(
      value === undefined || value === null ? undefined : String(value),
    );
  }

  private isNotFoundError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    return message.includes("404") && message.includes("not found");
  }
}
