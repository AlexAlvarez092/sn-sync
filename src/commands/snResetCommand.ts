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
  type SnScopeDispatchItem,
  type SnScopeDispatcherRuntime,
  runScopeDispatcherCommand,
} from "@shared/services/snScopeDispatcherService.js";

export interface SnResetRuntime extends SnScopeDispatcherRuntime {}

const defaultRuntime: SnResetRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: (
    items: readonly SnScopeDispatchItem[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnResetCommand(
  runtime: SnResetRuntime = defaultRuntime,
): Promise<void> {
  await runScopeDispatcherCommand(runtime, {
    items: [
      {
        label: SN_SYNC_MESSAGES.RESET_SCOPE_AUTH_LABEL,
        command: SN_SYNC_COMMANDS.RESET_AUTH,
      },
      {
        label: SN_SYNC_MESSAGES.RESET_SCOPE_INDEX_LABEL,
        command: SN_SYNC_COMMANDS.RESET_INDEX,
      },
    ],
    quickPickOptions: {
      title: SN_SYNC_MESSAGES.RESET_SCOPE_PROMPT,
      placeHolder: SN_SYNC_MESSAGES.RESET_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
    cancelledMessage: SN_SYNC_MESSAGES.RESET_CANCELLED,
    errorPrefix: SN_SYNC_MESSAGES.RESET_FAILED_PREFIX,
    errorCode: SN_SYNC_ERROR_CODES.RESET_FAILED,
    commandId: SN_SYNC_COMMANDS.RESET,
  });
}

export function registerSnResetCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RESET,
    () =>
      runWithCommandStatus(() => runSnResetCommand(), {
        message: "sn-sync: selecting reset command...",
      }),
  );

  context.subscriptions.push(disposable);
}
