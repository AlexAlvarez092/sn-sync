import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

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
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    await authService.validateAuth(context, workspaceFolderUri);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.AUTH_VALIDATE_FAILED,
        command: SN_SYNC_COMMANDS.AUTH_VALIDATE,
      },
    );
  }
}

export function registerSnAuthValidateCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthValidateServiceApi = new SnAuthService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.AUTH_VALIDATE,
    task: () => runSnAuthValidateCommand(context, authService),
    message: "sn-sync: validating auth...",
  });
}
