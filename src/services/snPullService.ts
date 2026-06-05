import * as vscode from "vscode";
import * as path from "node:path";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_DEFAULTS,
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
  SN_SYNC_VALUES,
} from "@shared/constants/snSyncConstants.js";
import {
  buildServiceNowTableApiUrl,
  createGotFetchTransport,
  handleHttpError,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import { hashText } from "@shared/services/hashService.js";
import {
  getWorkspacePathSegments,
  resolveWorkspaceChildUri,
  type WorkspacePathFragmentInput,
} from "@shared/services/snWorkspacePathService.js";

interface SnTableResponse {
  result?: Array<Record<string, unknown>>;
}

export interface SnPullSummary {
  settings: number;
  records: number;
  files: number;
}

export interface SnPullProgressEvent {
  settingFolder: string;
  fileName: string;
  localPath?: string;
  table?: string;
  sysId?: string;
  fieldName?: string;
  baseHash?: string;
}

export interface SnPullOptions {
  onFileWritten?: (event: SnPullProgressEvent) => void | Promise<void>;
  rootDir?: string;
}

export interface SnPullServiceApi {
  pullConfiguredScripts(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    settings: ExtensionConfigSetting[],
    options?: SnPullOptions,
  ): Promise<SnPullSummary>;
}

export class SnPullService implements SnPullServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = createGotFetchTransport(),
    private readonly pageSize = 1000,
  ) {}

  public async pullConfiguredScripts(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    settings: ExtensionConfigSetting[],
    options?: SnPullOptions,
  ): Promise<SnPullSummary> {
    let pulledRecords = 0;
    let writtenFiles = 0;

    for (const setting of settings) {
      const fieldNames = new Set<string>([setting.key, "sys_id"]);

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
          options,
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
    options?: SnPullOptions,
  ): Promise<number> {
    const safeKeyValue = this.sanitizePathSegment(keyValue);
    const sysId = this.normalizeRecordValue(record.sys_id);

    const baseFragments: WorkspacePathFragmentInput[] = [
      {
        value: options?.rootDir ?? SN_SYNC_DEFAULTS.ROOT_DIR,
        label: "rootDir",
        allowHierarchy: true,
      },
      {
        value: setting.folder,
        label: "folder",
        allowHierarchy: true,
      },
    ];
    if (setting.subDirPattern) {
      baseFragments.push(
        ...this.resolveSubDirParts(setting.subDirPattern, record).map(
          (part) => ({
            value: part,
            label: "subDirPattern segment",
          }),
        ),
      );
    } else if (setting.fields.length > 1) {
      baseFragments.push({
        value: safeKeyValue,
        label: "record key path segment",
      });
    }

    const targetDirUri = resolveWorkspaceChildUri(
      workspaceFolderUri,
      baseFragments,
    );
    await vscode.workspace.fs.createDirectory(targetDirUri);

    const seenOutputFileNames = new Set<string>();

    for (const field of setting.fields) {
      const safeExtension = getWorkspacePathSegments({
        value: field.extension,
        label: "file extension",
      })[0];
      const fileName = `${safeKeyValue}.${safeExtension}`;
      const comparableFileName = fileName.toLowerCase();

      if (seenOutputFileNames.has(comparableFileName)) {
        throw new Error(
          `${SN_SYNC_MESSAGES.PULL_DUPLICATE_OUTPUT_FILE_PREFIX} ${setting.folder}/${fileName}`,
        );
      }

      seenOutputFileNames.add(comparableFileName);

      const fileUri = resolveWorkspaceChildUri(workspaceFolderUri, [
        ...baseFragments,
        {
          value: fileName,
          label: "file name",
        },
      ]);
      const content =
        this.normalizeRecordValue(record[field.field_name], true) ?? "";

      await vscode.workspace.fs.writeFile(
        fileUri,
        new TextEncoder().encode(content),
      );

      const localPath = path
        .relative(workspaceFolderUri.fsPath, fileUri.fsPath)
        .replace(/\\/g, "/");

      await options?.onFileWritten?.({
        settingFolder: setting.folder,
        fileName,
        localPath,
        table: setting.table,
        sysId,
        fieldName: field.field_name,
        baseHash: hashText(content),
      });
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
          return getWorkspacePathSegments({
            value: part.trim(),
            label: "subDirPattern literal",
          })[0];
        }

        const tokenValue =
          this.normalizeRecordValue(record[tokenMatch[1]]) ??
          SN_SYNC_VALUES.UNKNOWN;
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
    if (sanitized === "." || sanitized === "..") {
      return SN_SYNC_VALUES.UNNAMED_PATH_SEGMENT;
    }
    return sanitized || SN_SYNC_VALUES.UNNAMED_PATH_SEGMENT;
  }

  private normalizeRecordValue(
    value: unknown,
    allowEmpty = false,
  ): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (allowEmpty) {
      // Preserve exact server content for synced fields to avoid baseline hash drift.
      return String(value);
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
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);

    const limit = this.pageSize;
    const allRows: Array<Record<string, unknown>> = [];
    let previousPageSignature: string | undefined;

    for (let offset = 0; ; offset += limit) {
      const response = await this.fetchApi(
        buildServiceNowTableApiUrl(connection.instanceUrl, tableName, {
          queryParams: {
            sysparm_query: query,
            sysparm_fields: fields,
            sysparm_limit: limit,
            sysparm_offset: offset,
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

      const payload = (await response.json()) as SnTableResponse;
      const rows = Array.isArray(payload.result) ? payload.result : [];

      if (rows.length === 0) {
        break;
      }

      const currentPageSignature = JSON.stringify(rows);
      if (offset > 0 && currentPageSignature === previousPageSignature) {
        break;
      }
      previousPageSignature = currentPageSignature;

      for (const row of rows) {
        allRows.push(row);
      }
    }

    return allRows;
  }
}
