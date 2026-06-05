import * as vscode from "vscode";
import type { SnCommandErrorContext } from "@shared/models/error.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  buildCommandErrorMessage,
  logCommandErrorDiagnostic,
  normalizeCommandError,
} from "@shared/services/snErrorService.js";

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

const DEFAULT_COMMAND_STATUS_MESSAGE = "sn-sync: running command...";
const DEFAULT_COMMAND_STATUS_DEBOUNCE_MS = 150;

export interface RunWithCommandStatusOptions {
  message?: string;
  debounceMs?: number;
}

export function runWithCommandStatus<T>(
  task: () => Thenable<T>,
  options: RunWithCommandStatusOptions = {},
): Promise<T> {
  const statusMessage = options.message ?? DEFAULT_COMMAND_STATUS_MESSAGE;
  const debounceMs = Math.max(
    0,
    options.debounceMs ?? DEFAULT_COMMAND_STATUS_DEBOUNCE_MS,
  );

  let status: vscode.Disposable | undefined;
  const timer = setTimeout(() => {
    status = vscode.window.setStatusBarMessage(`$(sync~spin) ${statusMessage}`);
  }, debounceMs);

  return Promise.resolve()
    .then(task)
    .finally(() => {
      clearTimeout(timer);
      status?.dispose();
    });
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
  context?: SnCommandErrorContext,
): void {
  if (!context) {
    const fallbackMessage =
      error instanceof Error ? error.message : "Unknown error";
    void runtime.showErrorMessage(`${prefix} ${fallbackMessage}`);
    return;
  }

  const diagnostic = normalizeCommandError(error, context);
  logCommandErrorDiagnostic(diagnostic);
  void runtime.showErrorMessage(buildCommandErrorMessage(prefix, diagnostic));
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
