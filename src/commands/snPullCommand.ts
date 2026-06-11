import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  defaultBaseRuntime,
  runWithCommandStatus,
} from "@shared/services/snCommandRuntime.js";
import {
  type SnScopeDispatcherRuntime,
  runScopeDispatcherCommand,
} from "@shared/services/snScopeDispatcherService.js";

export interface SnPullRuntime extends SnScopeDispatcherRuntime {}

const defaultRuntime: SnPullRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnPullCommand(
  runtime: SnPullRuntime = defaultRuntime,
): Promise<void> {
  await runScopeDispatcherCommand(runtime, {
    items: [
      {
        label: SN_SYNC_MESSAGES.PULL_SCOPE_ALL_FILES_LABEL,
        description: "Pull all configured files",
        command: SN_SYNC_COMMANDS.PULL_ALL_FILES,
      },
      {
        label: SN_SYNC_MESSAGES.PULL_SCOPE_CURRENT_FILE_LABEL,
        description: "Pull current file record",
        command: SN_SYNC_COMMANDS.PULL_CURRENT,
      },
      {
        label: SN_SYNC_MESSAGES.PULL_SCOPE_TABLE_LABEL,
        description: "Pull one configured table",
        command: SN_SYNC_COMMANDS.PULL_TABLE,
      },
      {
        label: SN_SYNC_MESSAGES.PULL_SCOPE_BY_SYS_ID_LABEL,
        description: "Pull record by sys_id",
        command: SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
      },
    ],
    quickPickOptions: {
      placeHolder: SN_SYNC_MESSAGES.PULL_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
    cancelledMessage: SN_SYNC_MESSAGES.PULL_CANCELLED,
    errorPrefix: SN_SYNC_MESSAGES.PULL_FAILED_PREFIX,
    errorCode: SN_SYNC_ERROR_CODES.PULL_FAILED,
    commandId: SN_SYNC_COMMANDS.PULL,
  });
}

export function registerSnPullCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL,
    () =>
      runWithCommandStatus(() => runSnPullCommand(defaultRuntime), {
        message: "sn-sync: selecting pull scope...",
      }),
  );

  context.subscriptions.push(disposable);
}
