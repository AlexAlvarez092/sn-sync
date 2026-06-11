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
  runWithCommandStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

interface SnResetScopeChoice extends vscode.QuickPickItem {
  command: string;
}

export interface SnResetRuntime extends SnBaseCommandRuntime {
  showQuickPick(
    items: readonly SnResetScopeChoice[],
    options: vscode.QuickPickOptions,
  ): Thenable<SnResetScopeChoice | undefined>;
  executeCommand(command: string): Thenable<unknown>;
}

const defaultRuntime: SnResetRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: (
    items: readonly SnResetScopeChoice[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnResetCommand(
  runtime: SnResetRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const selection = await runtime.showQuickPick(
    [
      {
        label: SN_SYNC_MESSAGES.RESET_SCOPE_AUTH_LABEL,
        command: SN_SYNC_COMMANDS.RESET_AUTH,
      },
      {
        label: SN_SYNC_MESSAGES.RESET_SCOPE_INDEX_LABEL,
        command: SN_SYNC_COMMANDS.RESET_INDEX,
      },
    ],
    {
      title: SN_SYNC_MESSAGES.RESET_SCOPE_PROMPT,
      placeHolder: SN_SYNC_MESSAGES.RESET_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
  );

  if (!selection) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.RESET_CANCELLED);
    return;
  }

  try {
    await runtime.executeCommand(selection.command);
  } catch (error) {
    showPrefixedCommandError(runtime, SN_SYNC_MESSAGES.RESET_FAILED_PREFIX, error, {
      code: SN_SYNC_ERROR_CODES.RESET_FAILED,
      command: SN_SYNC_COMMANDS.RESET,
    });
  }
}

export function registerSnResetCommand(
  context: vscode.ExtensionContext,
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RESET,
    () =>
      runWithCommandStatus(() => runSnResetCommand(), {
        message: "sn-sync: selecting reset command...",
      }),
  );

  context.subscriptions.push(disposable);
}
