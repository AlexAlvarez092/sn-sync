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
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

interface TableQuickPickItem extends vscode.QuickPickItem {
  setting: ExtensionConfigSetting;
}

export interface SnPullTableRuntime {
  getWorkspaceFolderUri(): vscode.Uri | undefined;
  showErrorMessage(message: string): Thenable<string | undefined>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showQuickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;
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

export const defaultRuntime: SnPullTableRuntime = {
  getWorkspaceFolderUri: () => vscode.workspace.workspaceFolders?.[0]?.uri,
  showErrorMessage: (message: string) =>
    vscode.window.showErrorMessage(message),
  showInformationMessage: (message: string) =>
    vscode.window.showInformationMessage(message),
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  showWarningMessage: (message: string, ...items: string[]) =>
    vscode.window.showWarningMessage(message, ...items),
  readDirectory: (uri: vscode.Uri) => vscode.workspace.fs.readDirectory(uri),
  delete: (uri: vscode.Uri, options) =>
    vscode.workspace.fs.delete(uri, options),
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

export async function runSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullTableRuntime = defaultRuntime,
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

    const items: TableQuickPickItem[] = settings.map((setting) => ({
      label: setting.folder,
      description: setting.table,
      setting,
    }));

    const selected = await runtime.showQuickPick(items, {
      placeHolder: SN_SYNC_MESSAGES.PULL_TABLE_PROMPT,
      ignoreFocusOut: true,
    });

    if (!selected) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PULL_TABLE_CANCELLED,
      );
      return;
    }

    const { setting } = selected;

    const clearChoice = await runtime.showWarningMessage(
      SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_PROMPT,
      SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
      SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_SKIP_ACTION,
    );

    if (
      clearChoice === SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION
    ) {
      await clearTableFolder(runtime, workspaceFolderUri, setting.folder);
    }

    const summary = await runtime.withProgress(
      "Pulling scripts from ServiceNow...",
      async (progress) => {
        let visibleFilesWritten = 0;

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

        progress.report({ increment: 100 });

        return settingSummary;
      },
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${setting.folder}).`,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.PULL_TABLE_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

async function clearTableFolder(
  runtime: SnPullTableRuntime,
  workspaceFolderUri: vscode.Uri,
  folder: string,
): Promise<void> {
  const tableFolderUri = vscode.Uri.joinPath(workspaceFolderUri, "src", folder);

  let entries: [string, vscode.FileType][];
  try {
    entries = await runtime.readDirectory(tableFolderUri);
  } catch (error) {
    if (getErrorMessage(error).includes("FileNotFound")) {
      return;
    }

    throw error;
  }

  for (const [entryName] of entries) {
    await runtime.delete(vscode.Uri.joinPath(tableFolderUri, entryName), {
      recursive: true,
      useTrash: false,
    });
  }
}

export function registerSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL_TABLE,
    () => runSnPullTableCommand(context, configService, pullService),
  );

  context.subscriptions.push(disposable);
}
