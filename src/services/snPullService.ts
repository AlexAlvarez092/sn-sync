import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";

interface SnTableResponse {
  result?: Array<Record<string, unknown>>;
}

export interface SnPullSummary {
  settings: number;
  records: number;
  files: number;
}

export interface SnPullServiceApi {
  pullConfiguredScripts(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    settings: ExtensionConfigSetting[],
  ): Promise<SnPullSummary>;
}

export class SnPullService implements SnPullServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = fetch,
    private readonly pageSize = 1000,
  ) {}

  public async pullConfiguredScripts(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    settings: ExtensionConfigSetting[],
  ): Promise<SnPullSummary> {
    let pulledRecords = 0;
    let writtenFiles = 0;

    for (const setting of settings) {
      const fieldNames = new Set<string>([setting.key]);

      for (const field of setting.fields) {
        fieldNames.add(field.field_name);
      }

      for (const token of this.extractSubDirTokens(setting.subDirPattern)) {
        fieldNames.add(token);
      }

      const records = await this.requestAllTableRows(
        context,
        workspaceFolderUri,
        setting.table,
        setting.query,
        Array.from(fieldNames).join(","),
      );

      for (const record of records) {
        const keyValue = this.normalizeRecordValue(record[setting.key]);
        if (!keyValue) {
          continue;
        }

        pulledRecords += 1;
        writtenFiles += await this.writeRecordFiles(
          workspaceFolderUri,
          setting,
          keyValue,
          record,
        );
      }
    }

    return {
      settings: settings.length,
      records: pulledRecords,
      files: writtenFiles,
    };
  }

  private async writeRecordFiles(
    workspaceFolderUri: vscode.Uri,
    setting: ExtensionConfigSetting,
    keyValue: string,
    record: Record<string, unknown>,
  ): Promise<number> {
    const safeKeyValue = this.sanitizePathSegment(keyValue);

    const baseParts = ["src", setting.folder];
    if (setting.subDirPattern) {
      baseParts.push(...this.resolveSubDirParts(setting.subDirPattern, record));
    } else if (setting.fields.length > 1) {
      baseParts.push(safeKeyValue);
    }

    const targetDirUri = vscode.Uri.joinPath(workspaceFolderUri, ...baseParts);
    await vscode.workspace.fs.createDirectory(targetDirUri);

    for (const field of setting.fields) {
      const fileName = `${safeKeyValue}.${field.extension}`;
      const fileUri = vscode.Uri.joinPath(targetDirUri, fileName);
      const content =
        this.normalizeRecordValue(record[field.field_name], true) ?? "";

      await vscode.workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(content),
      );
    }

    return setting.fields.length;
  }

  private resolveSubDirParts(
    pattern: string,
    record: Record<string, unknown>,
  ): string[] {
    return pattern
      .split("/")
      .map((part) => {
        const tokenMatch = /^<([^>]+)>$/.exec(part.trim());
        if (!tokenMatch) {
          return this.sanitizePathSegment(part.trim());
        }

        const tokenValue =
          this.normalizeRecordValue(record[tokenMatch[1]]) ?? "unknown";
        return this.sanitizePathSegment(tokenValue);
      })
      .filter((part) => Boolean(part));
  }

  private extractSubDirTokens(pattern: string | undefined): string[] {
    if (!pattern) {
      return [];
    }

    const matches = pattern.match(/<([^>]+)>/g) ?? [];
    return matches.map((token) => token.slice(1, -1));
  }

  private sanitizePathSegment(value: string): string {
    const sanitized = value.replace(/[\\/:*?"<>|]/g, "_").trim();
    return sanitized || "unnamed";
  }

  private normalizeRecordValue(
    value: unknown,
    allowEmpty = false,
  ): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = String(value).trim();
    if (!allowEmpty && !normalized) {
      return undefined;
    }

    return normalized;
  }

  private async requestAllTableRows(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    tableName: string,
    query: string,
    fields: string,
  ): Promise<Array<Record<string, unknown>>> {
    const savedAuth = await this.authService.getSavedAuth(
      context,
      workspaceFolderUri,
    );

    if (!savedAuth) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    const normalizedUrl = savedAuth.instanceUrl.replace(/\/+$/, "");
    const encodedQuery = encodeURIComponent(query);
    const encodedFields = encodeURIComponent(fields);

    const limit = this.pageSize;
    const allRows: Array<Record<string, unknown>> = [];

    for (let offset = 0; ; offset += limit) {
      const response = await this.fetchApi(
        `${normalizedUrl}/api/now/table/${tableName}?sysparm_query=${encodedQuery}&sysparm_fields=${encodedFields}&sysparm_limit=${limit}&sysparm_offset=${offset}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(
              `${savedAuth.username}:${savedAuth.password}`,
              "utf-8",
            ).toString("base64")}`,
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
        }

        throw new Error(
          `${SN_SYNC_MESSAGES.ACTIVATE_STATUS_HTTP_STATUS_PREFIX} ${response.status} ${response.statusText}`.trim(),
        );
      }

      const payload = (await response.json()) as SnTableResponse;
      const rows = Array.isArray(payload.result) ? payload.result : [];

      for (const row of rows) {
        allRows.push(row);
      }

      if (rows.length < limit) {
        break;
      }
    }

    return allRows;
  }
}
