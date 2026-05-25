import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";

const defaultRuntime: SnBaseCommandRuntime = defaultBaseRuntime;

export async function runSnResetIndexCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi,
  runtime: SnBaseCommandRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    if (!indexService.clearIndex) {
      throw new Error("Index service does not support clearIndex");
    }

    await indexService.clearIndex(workspaceFolderUri);

    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX,
      error,
    );
  }
}

export function registerSnResetIndexCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RESET_INDEX,
    () => runSnResetIndexCommand(context, indexService),
  );

  context.subscriptions.push(disposable);
}
