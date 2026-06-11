import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  defaultBaseRuntime,
  registerCommandWithStatus,
} from "@shared/services/snCommandRuntime.js";
import {
  type SnScopeDispatchItem,
  type SnScopeDispatcherRuntime,
  runScopeDispatcherCommand,
} from "@shared/services/snScopeDispatcherService.js";

export interface SnAuthRuntime extends SnScopeDispatcherRuntime {}

const defaultRuntime: SnAuthRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: (
    items: readonly SnScopeDispatchItem[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnAuthCommand(
  runtime: SnAuthRuntime = defaultRuntime,
): Promise<void> {
  await runScopeDispatcherCommand(runtime, {
    items: [
      {
        label: SN_SYNC_MESSAGES.AUTH_SCOPE_CONFIG_LABEL,
        command: SN_SYNC_COMMANDS.AUTH_CONFIG,
      },
      {
        label: SN_SYNC_MESSAGES.AUTH_SCOPE_VALIDATE_LABEL,
        command: SN_SYNC_COMMANDS.AUTH_VALIDATE,
      },
    ],
    quickPickOptions: {
      title: SN_SYNC_MESSAGES.AUTH_SCOPE_PROMPT,
      placeHolder: SN_SYNC_MESSAGES.AUTH_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
    cancelledMessage: SN_SYNC_MESSAGES.AUTH_CANCELLED,
    errorPrefix: SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX,
    errorCode: SN_SYNC_ERROR_CODES.AUTH_FAILED,
    commandId: SN_SYNC_COMMANDS.AUTH,
  });
}

export function registerSnAuthCommand(context: vscode.ExtensionContext): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.AUTH,
    task: () => runSnAuthCommand(),
    message: "sn-sync: selecting auth command...",
  });
}
