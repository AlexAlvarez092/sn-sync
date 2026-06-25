import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SnBaseSnapshotStore,
  type SnBaseSnapshotStoreApi,
} from "@services/snBaseSnapshotStore.js";

export interface SnResetIndexRuntime extends SnBaseCommandRuntime {
  askConfirmation(message: string, actionLabel: string): Thenable<boolean>;
}

const defaultRuntime: SnResetIndexRuntime = {
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

export async function runSnResetIndexCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi,
  snapshotStore: SnBaseSnapshotStoreApi,
  runtime: SnResetIndexRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const shouldProceed = await runtime.askConfirmation(
    SN_SYNC_MESSAGES.RESET_INDEX_CONFIRM_PROMPT,
    SN_SYNC_MESSAGES.RESET_INDEX_CONFIRM_ACTION,
  );
  if (!shouldProceed) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_INDEX_CANCELLED);
    return;
  }

  try {
    if (!indexService.clearIndex) {
      throw new Error("Index service does not support clearIndex");
    }

    await indexService.clearIndex(workspaceFolderUri);
    await snapshotStore.clearAll(workspaceFolderUri);

    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.RESET_INDEX_FAILED,
        command: SN_SYNC_COMMANDS.RESET_INDEX,
      },
    );
  }
}

export function registerSnResetIndexCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
  snapshotStore: SnBaseSnapshotStoreApi = new SnBaseSnapshotStore(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.RESET_INDEX,
    task: () => runSnResetIndexCommand(context, indexService, snapshotStore),
    message: "sn-sync: resetting index...",
  });
}
