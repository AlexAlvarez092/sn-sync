import * as vscode from "vscode";
import {
  SnLoginValidationService,
  type SnLoginValidationServiceApi,
} from "@services/snLoginValidationService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnValidateAuthRuntime extends SnBaseCommandRuntime {}

const defaultRuntime: SnValidateAuthRuntime = defaultBaseRuntime;

export async function runSnValidateAuthCommand(
  context: vscode.ExtensionContext,
  validationService: SnLoginValidationServiceApi,
  runtime: SnValidateAuthRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    await validationService.validateLogin(context, workspaceFolderUri);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS);
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnValidateAuthCommand(
  context: vscode.ExtensionContext,
  validationService: SnLoginValidationServiceApi = new SnLoginValidationService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.AUTH_VALIDATE,
    () => runSnValidateAuthCommand(context, validationService),
  );

  context.subscriptions.push(disposable);
}
