import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnResetSelectionsConfigService {
  clearActivationSelections(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export interface SnResetSelectionsRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
}

const defaultRuntime: SnResetSelectionsRuntime = {
  getWorkspaceFolderUri: () => vscode.workspace.workspaceFolders?.[0]?.uri,
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
};

export async function runSnResetSelectionsCommand(
  configService: SnResetSelectionsConfigService,
  runtime: SnResetSelectionsRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    await configService.clearActivationSelections(workspaceFolderUri);
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.RESET_SELECTIONS_SUCCESS,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.RESET_SELECTIONS_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnResetSelectionsCommand(
  context: vscode.ExtensionContext,
  configService: SnResetSelectionsConfigService = new SnSyncConfigService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RESET_SELECTIONS,
    () => runSnResetSelectionsCommand(configService),
  );

  context.subscriptions.push(disposable);
}
