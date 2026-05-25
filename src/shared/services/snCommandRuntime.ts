import * as vscode from "vscode";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnBaseCommandRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
}

export function withNotificationProgress<T>(
  title: string,
  task: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ) => Thenable<T>,
): Thenable<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: false,
    },
    task,
  );
}

export function getWorkspaceFolderOrShowError(
  runtime: SnBaseCommandRuntime,
): vscode.Uri | undefined {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();
  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return undefined;
  }

  return workspaceFolderUri;
}

export function showPrefixedCommandError(
  runtime: SnBaseCommandRuntime,
  prefix: string,
  error: unknown,
): void {
  void runtime.showErrorMessage(`${prefix} ${getErrorMessage(error)}`);
}

export const defaultBaseRuntime: SnBaseCommandRuntime = {
  getWorkspaceFolderUri: () => {
    const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
    if (activeEditorUri) {
      return vscode.workspace.getWorkspaceFolder(activeEditorUri)?.uri;
    }

    return vscode.workspace.workspaceFolders?.[0]?.uri;
  },
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
};
