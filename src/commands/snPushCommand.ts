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

export interface SnPushRuntime extends SnScopeDispatcherRuntime {}

const defaultRuntime: SnPushRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnPushCommand(
  runtime: SnPushRuntime = defaultRuntime,
): Promise<void> {
  await runScopeDispatcherCommand(runtime, {
    items: [
      {
        label: SN_SYNC_MESSAGES.PUSH_SCOPE_ALL_FILES_LABEL,
        description: "Push modified local files",
        command: SN_SYNC_COMMANDS.PUSH_MODIFIED,
      },
      {
        label: SN_SYNC_MESSAGES.PUSH_SCOPE_CURRENT_FILE_LABEL,
        description: "Push current file",
        command: SN_SYNC_COMMANDS.PUSH_CURRENT,
      },
      {
        label: SN_SYNC_MESSAGES.PUSH_SCOPE_REPORT_LABEL,
        description: "Generate push report",
        command: SN_SYNC_COMMANDS.PUSH_REPORT,
      },
    ],
    quickPickOptions: {
      placeHolder: SN_SYNC_MESSAGES.PUSH_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
    cancelledMessage: SN_SYNC_MESSAGES.PUSH_CANCELLED,
    errorPrefix: SN_SYNC_MESSAGES.PUSH_FAILED_PREFIX,
    errorCode: SN_SYNC_ERROR_CODES.PUSH_FAILED,
    commandId: SN_SYNC_COMMANDS.PUSH,
  });
}

export function registerSnPushCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PUSH,
    () =>
      runWithCommandStatus(() => runSnPushCommand(defaultRuntime), {
        message: "sn-sync: selecting push scope...",
      }),
  );

  context.subscriptions.push(disposable);
}
