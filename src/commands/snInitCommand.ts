import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnSyncInitializer {
  initialize(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export interface SnInitCommandRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
}

const defaultRuntime: SnInitCommandRuntime = {
  getWorkspaceFolderUri: () => vscode.workspace.workspaceFolders?.[0]?.uri,
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
};

export async function runSnInitCommand(
  configService: SnSyncInitializer,
  runtime: SnInitCommandRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    await configService.initialize(workspaceFolderUri);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.INIT_SUCCESS);
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.INIT_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnInitCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncInitializer = new SnSyncConfigService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.INIT,
    () => runSnInitCommand(configService),
  );

  context.subscriptions.push(disposable);
}
