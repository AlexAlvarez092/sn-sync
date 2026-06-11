import * as vscode from "vscode";
import {
  type SnBaseCommandRuntime,
  getWorkspaceFolderOrShowError,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

export interface SnScopeDispatchItem extends vscode.QuickPickItem {
  command: string;
}

export interface SnScopeDispatcherRuntime extends SnBaseCommandRuntime {
  showQuickPick(
    items: readonly SnScopeDispatchItem[],
    options: vscode.QuickPickOptions,
  ): Thenable<SnScopeDispatchItem | undefined>;
  executeCommand(command: string): Thenable<unknown>;
}

export interface SnScopeDispatcherOptions {
  items: readonly SnScopeDispatchItem[];
  quickPickOptions: vscode.QuickPickOptions;
  cancelledMessage: string;
  errorPrefix: string;
  errorCode: string;
  commandId: string;
}

export async function runScopeDispatcherCommand(
  runtime: SnScopeDispatcherRuntime,
  options: SnScopeDispatcherOptions,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    const selection = await runtime.showQuickPick(
      options.items,
      options.quickPickOptions,
    );

    if (!selection) {
      void runtime.showInformationMessage(options.cancelledMessage);
      return;
    }

    await runtime.executeCommand(selection.command);
  } catch (error) {
    showPrefixedCommandError(runtime, options.errorPrefix, error, {
      code: options.errorCode,
      command: options.commandId,
    });
  }
}
