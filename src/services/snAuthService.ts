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
  handleHttpError,
  normalizeInstanceUrl,
} from "@shared/services/snHttpService.js";

export class SnAuthService {
  public constructor(
    private readonly configService: SnSyncConfigService = new SnSyncConfigService(),
    private readonly fetchApi: typeof fetch = fetch,
  ) {}

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
    const savedAuth = await this.getSavedAuth(context, workspaceFolderUri);

    if (!savedAuth) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}${SN_SYNC_SERVICENOW.CURRENT_USER_API_PATH}`,
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

    handleHttpError(
      response,
      SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX,
    );
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
