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

interface SnAuthScopeChoice extends vscode.QuickPickItem {
  command: string;
}

export interface SnAuthRuntime extends SnBaseCommandRuntime {
  showQuickPick(
    items: readonly SnAuthScopeChoice[],
    options: vscode.QuickPickOptions,
  ): Thenable<SnAuthScopeChoice | undefined>;
  executeCommand(command: string): Thenable<unknown>;
}

const defaultRuntime: SnAuthRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: (
    items: readonly SnAuthScopeChoice[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  executeCommand: (command: string) => vscode.commands.executeCommand(command),
};

export async function runSnAuthCommand(
  runtime: SnAuthRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const selection = await runtime.showQuickPick(
    [
      {
        label: SN_SYNC_MESSAGES.AUTH_SCOPE_CONFIG_LABEL,
        command: SN_SYNC_COMMANDS.AUTH_CONFIG,
      },
      {
        label: SN_SYNC_MESSAGES.AUTH_SCOPE_VALIDATE_LABEL,
        command: SN_SYNC_COMMANDS.AUTH_VALIDATE,
      },
    ],
    {
      title: SN_SYNC_MESSAGES.AUTH_SCOPE_PROMPT,
      placeHolder: SN_SYNC_MESSAGES.AUTH_SCOPE_PROMPT,
      ignoreFocusOut: true,
    },
  );

  if (!selection) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_CANCELLED);
    return;
  }

  try {
    await runtime.executeCommand(selection.command);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.AUTH_FAILED,
        command: SN_SYNC_COMMANDS.AUTH,
      },
    );
  }
}

export function registerSnAuthCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.AUTH,
    () =>
      runWithCommandStatus(() => runSnAuthCommand(), {
        message: "sn-sync: selecting auth command...",
      }),
  );

  context.subscriptions.push(disposable);
}
