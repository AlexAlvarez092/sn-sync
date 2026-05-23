import * as vscode from "vscode";
import {
  SnPullService,
  type SnPullServiceApi,
} from "@services/snPullService.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnPullRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showWarningMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
  readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
  delete(
    uri: vscode.Uri,
    options: { recursive: boolean; useTrash: boolean },
  ): Thenable<void>;
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPullRuntime = {
  getWorkspaceFolderUri: () => vscode.workspace.workspaceFolders?.[0]?.uri,
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
  showWarningMessage: (message: string, ...items: string[]) =>
    vscode.window.showWarningMessage(message, ...items),
  readDirectory: (uri: vscode.Uri) => vscode.workspace.fs.readDirectory(uri),
  delete: (uri: vscode.Uri, options) => vscode.workspace.fs.delete(uri, options),
  withProgress: (title, task) =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      task,
    ),
};

export async function runSnPullCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    const settings = await configService.getSyncSettings(workspaceFolderUri);

    if (settings.length === 0) {
      void runtime.showInformationMessage(SN_SYNC_MESSAGES.PULL_NO_SETTINGS);
      return;
    }

    const clearSrcChoice = await runtime.showWarningMessage(
      SN_SYNC_MESSAGES.PULL_CLEAR_SRC_PROMPT,
      SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
      SN_SYNC_MESSAGES.PULL_CLEAR_SRC_SKIP_ACTION,
    );

    if (clearSrcChoice === SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION) {
      await clearSrcFolder(runtime, workspaceFolderUri);
    }

    const summary = await runtime.withProgress(
      "Pulling scripts from ServiceNow...",
      async (progress) => {
        let totalRecords = 0;
        let totalFiles = 0;
        let visibleFilesWritten = 0;

        for (const setting of settings) {
          const settingSummary = await pullService.pullConfiguredScripts(
            context,
            workspaceFolderUri,
            [setting],
            {
              onFileWritten: ({ settingFolder, fileName }) => {
                visibleFilesWritten += 1;
                progress.report({
                  message: `Writing ${visibleFilesWritten} files... (${settingFolder}/${fileName})`,
                });
              },
            },
          );

          totalRecords += settingSummary.records;
          totalFiles += settingSummary.files;

          progress.report({
            increment: 100 / settings.length,
            message: `${setting.folder} complete (${settingSummary.files} files)`,
          });
        }

        return {
          settings: settings.length,
          records: totalRecords,
          files: totalFiles,
        };
      },
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${summary.settings} settings).`,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.PULL_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

async function clearSrcFolder(
  runtime: SnPullRuntime,
  workspaceFolderUri: vscode.Uri,
): Promise<void> {
  const srcFolderUri = vscode.Uri.joinPath(workspaceFolderUri, "src");

  let entries: [string, vscode.FileType][];
  try {
    entries = await runtime.readDirectory(srcFolderUri);
  } catch (error) {
    if (getErrorMessage(error).includes("FileNotFound")) {
      return;
    }

    throw error;
  }

  for (const [entryName] of entries) {
    await runtime.delete(vscode.Uri.joinPath(srcFolderUri, entryName), {
      recursive: true,
      useTrash: false,
    });
  }
}

export function registerSnPullCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL,
    () => runSnPullCommand(context, configService, pullService),
  );

  context.subscriptions.push(disposable);
}
