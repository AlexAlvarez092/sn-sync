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
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

export interface SnResetAuthServiceApi {
  resetAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void>;
}

const defaultRuntime: SnBaseCommandRuntime = defaultBaseRuntime;

export async function runSnResetAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnResetAuthServiceApi,
  runtime: SnBaseCommandRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    await authService.resetAuth(context, workspaceFolderUri);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_AUTH_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.RESET_AUTH_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.RESET_AUTH_FAILED,
        command: SN_SYNC_COMMANDS.RESET_AUTH,
      },
    );
  }
}

export function registerSnResetAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnResetAuthServiceApi = new SnAuthService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RESET_AUTH,
    () => runSnResetAuthCommand(context, authService),
  );

  context.subscriptions.push(disposable);
}
