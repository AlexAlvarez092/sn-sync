import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnAuthValidateServiceApi {
  validateAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void>;
}

export interface SnAuthValidateRuntime extends SnBaseCommandRuntime {}

const defaultRuntime: SnAuthValidateRuntime = defaultBaseRuntime;

export async function runSnAuthValidateCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthValidateServiceApi,
  runtime: SnAuthValidateRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    await authService.validateAuth(context, workspaceFolderUri);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS);
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnAuthValidateCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthValidateServiceApi = new SnAuthService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.AUTH_VALIDATE,
    () => runSnAuthValidateCommand(context, authService),
  );

  context.subscriptions.push(disposable);
}
