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
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import {
  type FolderClearRuntime,
  clearDirectory,
} from "@shared/services/snFolderService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnPullRuntime
  extends SnBaseCommandRuntime, FolderClearRuntime {
  showWarningMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPullRuntime = {
  ...defaultBaseRuntime,
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

    const preferences = await resolvePreferences(
      configService,
      workspaceFolderUri,
    );

    const shouldDeleteBeforePull = await shouldDeleteBeforePullCommand(
      runtime,
      preferences.pull.clearBeforePull,
      preferences.rootDir,
    );

    if (shouldDeleteBeforePull) {
      await clearDirectory(
        runtime,
        vscode.Uri.joinPath(workspaceFolderUri, preferences.rootDir),
      );
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
              rootDir: preferences.rootDir,
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

async function shouldDeleteBeforePullCommand(
  runtime: Pick<SnPullRuntime, "showWarningMessage">,
  clearBeforePull: "ask" | "delete" | "keep",
  rootDir: string,
): Promise<boolean> {
  if (clearBeforePull === "delete") {
    return true;
  }

  if (clearBeforePull === "keep") {
    return false;
  }

  const clearSrcChoice = await runtime.showWarningMessage(
    `Clear ${rootDir} before pull to avoid stale local files?`,
    SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
    SN_SYNC_MESSAGES.PULL_CLEAR_SRC_SKIP_ACTION,
  );

  return clearSrcChoice === SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION;
}

async function resolvePreferences(
  configService: SnSyncConfigService,
  workspaceFolderUri: vscode.Uri,
): Promise<{ rootDir: string; pull: { clearBeforePull: "ask" | "delete" | "keep" } }> {
  if (typeof configService.getPreferences === "function") {
    return configService.getPreferences(workspaceFolderUri);
  }

  return {
    rootDir: "src",
    pull: {
      clearBeforePull: "ask",
    },
  };
}
