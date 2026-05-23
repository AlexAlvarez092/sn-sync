import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import { SN_SYNC_SECRET_KEYS } from "@shared/constants/snSyncConstants.js";
import type { SnAuthInput, SnAuthSecret } from "@shared/models/auth.js";

export class SnAuthService {
  public constructor(
    private readonly configService: SnSyncConfigService = new SnSyncConfigService(),
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

  private getSecretKey(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): string {
    return `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:${instanceName}`;
  }
}
