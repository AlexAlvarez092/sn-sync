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
  runWithCommandStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

export interface SnResetAuthServiceApi {
  resetAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void>;
}

export interface SnResetAuthRuntime extends SnBaseCommandRuntime {
  askConfirmation(message: string, actionLabel: string): Thenable<boolean>;
}

const defaultRuntime: SnResetAuthRuntime = {
  ...defaultBaseRuntime,
  askConfirmation: async (message: string, actionLabel: string) => {
    const selected = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      actionLabel,
    );

    return selected === actionLabel;
  },
};

export async function runSnResetAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnResetAuthServiceApi,
  runtime: SnResetAuthRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const shouldProceed = await runtime.askConfirmation(
    SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_PROMPT,
    SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_ACTION,
  );
  if (!shouldProceed) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_AUTH_CANCELLED);
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
    () =>
      runWithCommandStatus(() => runSnResetAuthCommand(context, authService), {
        message: "sn-sync: resetting auth...",
      }),
  );

  context.subscriptions.push(disposable);
}
