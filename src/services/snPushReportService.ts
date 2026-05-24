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
import type { SnSyncIndexCandidate } from "@services/snSyncIndexService.js";
import type { SavedSnAuth } from "@shared/models/auth.js";

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
    private readonly fetchApi: typeof fetch = fetch,
  ) {}

  public async buildPushReport(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    candidates: SnSyncIndexCandidate[],
    options?: SnPushReportBuildOptions,
  ): Promise<SnPushReportData> {
    const savedAuth = await this.authService.getSavedAuth(
      context,
      workspaceFolderUri,
    );

    if (!savedAuth) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

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
          scopeInfo = await this.loadRecordScope(savedAuth, candidate);
          scopeCache.set(recordKey, scopeInfo);
        } catch (error) {
          if (!this.isNotFoundError(error)) {
            throw error;
          }

          scopeInfo = {
            scopeId: "unknown",
            scopeName: "unknown",
          };
          scopeCache.set(recordKey, scopeInfo);
          resolutionNote = "Record not found in instance (404).";
        }
      }

      let updateSetInfo = updateSetCache.get(scopeInfo.scopeId);
      if (!updateSetInfo && scopeInfo.scopeId !== "unknown") {
        try {
          updateSetInfo = await this.loadScopeUpdateSet(
            savedAuth,
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
            resolutionNote ?? "Update set table is not available (404).";
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
    savedAuth: SavedSnAuth,
    candidate: SnSyncIndexCandidate,
  ): Promise<{ scopeId: string; scopeName: string }> {
    const response = await this.fetchApi(
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/${candidate.entry.table}/${candidate.entry.sysId}?sysparm_fields=sys_scope,sys_scope.scope,sys_scope.name`,
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

    const payload = (await response.json()) as SnRecordResponse;
    const record =
      payload.result && !Array.isArray(payload.result)
        ? payload.result
        : ({} as Record<string, unknown>);

    const scopeId =
      this.normalize(record["sys_scope.scope"]) ||
      this.normalize(record.sys_scope) ||
      "global";

    const scopeName =
      this.normalize(record["sys_scope.name"]) ||
      (scopeId === "global" ? "global" : scopeId);

    return {
      scopeId,
      scopeName,
    };
  }

  private async loadScopeUpdateSet(
    savedAuth: SavedSnAuth,
    scopeId: string,
  ): Promise<{ updateSetId?: string; updateSetName?: string }> {
    const preferredUpdateSetId =
      await this.loadScopeUpdateSetFromUserPreference(savedAuth, scopeId);

    if (preferredUpdateSetId) {
      let preferredUpdateSetName: string | undefined;
      try {
        preferredUpdateSetName = await this.loadUpdateSetNameById(
          savedAuth,
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
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/sys_update_set?sysparm_query=${query}&sysparm_fields=sys_id,name&sysparm_limit=1`,
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
    savedAuth: SavedSnAuth,
    scopeId: string,
  ): Promise<string | undefined> {
    const query = encodeURIComponent(
      `name=updateSetForScope${scopeId}^user.user_name=${savedAuth.username}`,
    );

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/sys_user_preference?sysparm_query=${query}&sysparm_fields=value&sysparm_limit=1`,
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

    const payload = (await response.json()) as SnRecordResponse;
    const rows = Array.isArray(payload.result) ? payload.result : [];
    const row = rows[0];

    return this.normalize(row?.value);
  }

  private async loadUpdateSetNameById(
    savedAuth: SavedSnAuth,
    updateSetId: string,
  ): Promise<string | undefined> {
    const response = await this.fetchApi(
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/sys_update_set/${updateSetId}?sysparm_fields=name`,
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

    const payload = (await response.json()) as SnRecordResponse;
    const row =
      payload.result && !Array.isArray(payload.result) ? payload.result : {};

    return this.normalize(row.name);
  }

  private normalize(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = String(value).trim();
    return normalized || undefined;
  }

  private isNotFoundError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    return message.includes("404") && message.includes("not found");
  }
}
