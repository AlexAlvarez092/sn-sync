import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";

export interface SnUpdateSetResetConfigService {
  clearActivationSelections(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export interface SnUpdateSetResetRuntime extends SnBaseCommandRuntime {}

const defaultRuntime: SnUpdateSetResetRuntime = defaultBaseRuntime;

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
