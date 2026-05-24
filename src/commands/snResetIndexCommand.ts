import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnResetIndexRuntime extends SnBaseCommandRuntime {}

const defaultRuntime: SnResetIndexRuntime = defaultBaseRuntime;

export async function runSnResetIndexCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi,
  runtime: SnResetIndexRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    if (typeof indexService.clearIndex === "function") {
      await indexService.clearIndex(workspaceFolderUri);
    } else if (typeof indexService.replacePullSnapshot === "function") {
      await indexService.replacePullSnapshot(workspaceFolderUri, []);
    } else {
      throw new Error("Index service does not support reset operations.");
    }

    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS);
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX} ${getErrorMessage(error)}`,
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
