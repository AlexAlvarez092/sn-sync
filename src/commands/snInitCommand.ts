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

export interface SnSyncInitializer {
  initialize(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export interface SnInitCommandRuntime extends SnBaseCommandRuntime {}

const defaultRuntime: SnInitCommandRuntime = defaultBaseRuntime;

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
