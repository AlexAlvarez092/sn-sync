import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SECRET_KEYS,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import type {
  SavedSnAuth,
  SnAuthInput,
  SnAuthSecret,
} from "@shared/models/auth.js";
import {
  buildBasicAuthHeader,
  createGotFetchTransport,
  normalizeInstanceUrl,
} from "@shared/services/snHttpService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnServiceNowConnectionAuth {
  instanceUrl: string;
  headers: Record<string, string>;
  username?: string;
}

interface SnAuthRequestOptions {
  method: "GET";
  headers: Record<string, string>;
  timeout: {
    request: number;
  };
}

interface SnAuthResponse {
  statusCode: number;
  statusMessage?: string;
}

type SnAuthRequestApi = (
  url: string,
  options: SnAuthRequestOptions,
) => Promise<SnAuthResponse>;

export class SnAuthService {
  private readonly fetchApi = createGotFetchTransport();
  private readonly requestApi: SnAuthRequestApi;

  public constructor(
    private readonly configService: SnSyncConfigService = new SnSyncConfigService(),
    requestApi?: SnAuthRequestApi,
  ) {
    this.requestApi = requestApi ?? this.requestWithGot.bind(this);
  }

  public async saveAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    authInput: SnAuthInput,
  ): Promise<void> {
    await this.configService.setInstanceName(
      workspaceFolderUri,
      authInput.instanceName,
    );
    const secretKey = this.getSecretKey(
      workspaceFolderUri,
      authInput.instanceName,
    );
    const secretValue: SnAuthSecret = {
      instanceUrl: authInput.instanceUrl,
      username: authInput.username,
      password: authInput.password,
    };

    await context.secrets.store(secretKey, JSON.stringify(secretValue));
  }

  public async getSavedAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SavedSnAuth | undefined> {
    const instanceName =
      await this.configService.getInstanceName(workspaceFolderUri);

    if (!instanceName) {
      return undefined;
    }

    const secretKey = this.getSecretKey(workspaceFolderUri, instanceName);
    const rawSecret = await context.secrets.get(secretKey);

    if (!rawSecret) {
      return undefined;
    }

    try {
      const parsedSecret = JSON.parse(rawSecret) as unknown;

      if (!this.isSnAuthSecret(parsedSecret)) {
        return undefined;
      }

      return {
        instanceName,
        ...parsedSecret,
      };
    } catch {
      return undefined;
    }
  }

  public async validateAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    const connection = await this.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );

    const normalizedUrl = normalizeInstanceUrl(connection.instanceUrl);
    const username = connection.username?.trim();
    if (!username) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }
    const validationUrl = `${normalizedUrl}/api/now/v2/table/sys_user?user_name=${encodeURIComponent(username)}&sysparm_fields=user_name,name`;

    try {
      const response = await this.requestApi(validationUrl, {
        method: "GET",
        headers: {
          Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          ...connection.headers,
        },
        timeout: {
          request: 90000,
        },
      });

      this.handleValidateAuthStatus(response);
    } catch (error) {
      if (error instanceof Error && this.isNetworkError(error)) {
        throw new Error(
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} ${getErrorMessage(error)} (${normalizedUrl})`,
        );
      }

      throw error;
    }
  }

  private async requestWithGot(
    url: string,
    options: SnAuthRequestOptions,
  ): Promise<SnAuthResponse> {
    const response = await this.fetchApi(url, {
      method: options.method,
      headers: options.headers,
    });

    return {
      statusCode: response.status,
      statusMessage: response.statusText,
    };
  }

  private handleValidateAuthStatus(response: SnAuthResponse): void {
    const statusText = response.statusMessage ?? "";

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
    }

    throw new Error(
      `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} ${response.statusCode} ${statusText}`.trim(),
    );
  }

  private isNetworkError(error: Error): boolean {
    return (
      /^(TypeError|FetchError|RequestError)$/i.test(error.name) ||
      /(ERR_EMPTY_RESPONSE|fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|certificate|TLS|SSL)/i.test(
        error.message,
      )
    );
  }

  public async resetAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    const instanceName =
      await this.configService.getInstanceName(workspaceFolderUri);

    if (!instanceName) {
      return;
    }

    const secretKey = this.getSecretKey(workspaceFolderUri, instanceName);
    await context.secrets.delete(secretKey);
  }

  public async resolveConnectionAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnServiceNowConnectionAuth> {
    const savedAuth = await this.getSavedAuth(context, workspaceFolderUri);
    const instanceUrl = savedAuth?.instanceUrl;

    if (!instanceUrl || !savedAuth.username || !savedAuth.password) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    return {
      instanceUrl,
      headers: {
        Authorization: buildBasicAuthHeader(
          savedAuth.username,
          savedAuth.password,
        ),
      },
      username: savedAuth.username,
    };
  }

  private getSecretKey(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): string {
    return `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:${instanceName}`;
  }

  private isSnAuthSecret(value: unknown): value is SnAuthSecret {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.instanceUrl === "string" &&
      typeof candidate.username === "string" &&
      typeof candidate.password === "string"
    );
  }
}
