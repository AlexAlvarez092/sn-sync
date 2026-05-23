import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnUpdateSetResetConfigService {
  clearActivationSelections(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export interface SnUpdateSetResetRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
}

const defaultRuntime: SnUpdateSetResetRuntime = {
  getWorkspaceFolderUri: () => vscode.workspace.workspaceFolders?.[0]?.uri,
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
};

export async function runSnUpdateSetResetCommand(
  configService: SnUpdateSetResetConfigService,
  runtime: SnUpdateSetResetRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    await configService.clearActivationSelections(workspaceFolderUri);
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.UPDATE_SET_RESET_SUCCESS,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.UPDATE_SET_RESET_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnUpdateSetResetCommand(
  context: vscode.ExtensionContext,
  configService: SnUpdateSetResetConfigService = new SnSyncConfigService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.UPDATE_SET_RESET,
    () => runSnUpdateSetResetCommand(configService),
  );

  context.subscriptions.push(disposable);
}
