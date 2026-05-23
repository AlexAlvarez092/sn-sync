import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  buildBasicAuthHeader,
  handleHttpError,
  normalizeInstanceUrl,
} from "@shared/services/snHttpService.js";

export interface SnLoginValidationServiceApi {
  validateLogin(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void>;
}

export class SnLoginValidationService implements SnLoginValidationServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = fetch,
  ) {}

  public async validateLogin(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    const savedAuth = await this.authService.getSavedAuth(
      context,
      workspaceFolderUri,
    );

    if (!savedAuth) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(savedAuth.instanceUrl)}/api/now/ui/user/current`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
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
}
