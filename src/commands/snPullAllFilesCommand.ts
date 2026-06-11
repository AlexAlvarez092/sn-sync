import * as vscode from "vscode";
import {
  SnPullService,
  type SnPullServiceApi,
} from "@services/snPullService.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import type { SnPullClearBeforePull } from "@shared/models/config.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  runWithCommandStatus,
  showPrefixedCommandError,
  withNotificationProgress,
} from "@shared/services/snCommandRuntime.js";
import {
  type FolderClearRuntime,
  clearDirectory,
  ensureDirectoryExists,
} from "@shared/services/snFolderService.js";
import { resolvePreferences } from "@shared/services/snPreferencesService.js";
import { createPullFileWrittenHandler } from "@shared/services/snPullProgressService.js";
import { resolveWorkspaceChildUri } from "@shared/services/snWorkspacePathService.js";

export interface SnPullAllFilesRuntime
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

const defaultRuntime: SnPullAllFilesRuntime = {
  ...defaultBaseRuntime,
  showWarningMessage: (message: string, ...items: string[]) =>
    vscode.window.showWarningMessage(message, ...items),
  readDirectory: (uri: vscode.Uri) => vscode.workspace.fs.readDirectory(uri),
  delete: (uri: vscode.Uri, options) =>
    vscode.workspace.fs.delete(uri, options),
  createDirectory: (uri: vscode.Uri) =>
    vscode.workspace.fs.createDirectory(uri),
  withProgress: withNotificationProgress,
};

export async function runSnPullAllFilesCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullAllFilesRuntime = defaultRuntime,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
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
    const rootDirUri = resolveWorkspaceChildUri(workspaceFolderUri, [
      {
        value: preferences.rootDir,
        label: "rootDir",
        allowHierarchy: true,
      },
    ]);

    await ensureDirectoryExists(runtime, rootDirUri);

    const shouldDeleteBeforePull = await shouldDeleteBeforePullAllFilesCommand(
      runtime,
      preferences.pull.clearBeforePull,
      preferences.rootDir,
    );

    if (shouldDeleteBeforePull) {
      await clearDirectory(runtime, rootDirUri);
    }

    const summary = await runtime.withProgress(
      SN_SYNC_MESSAGES.PULL_PROGRESS_TITLE,
      async (progress) => {
        let totalRecords = 0;
        let totalFiles = 0;
        const indexUpdates: Array<{
          localPath: string;
          table: string;
          sysId: string;
          fieldName: string;
          baseHash: string;
        }> = [];
        const onFileWritten = createPullFileWrittenHandler(
          progress,
          indexUpdates,
        );

        for (const setting of settings) {
          const settingSummary = await pullService.pullConfiguredScripts(
            context,
            workspaceFolderUri,
            [setting],
            {
              rootDir: preferences.rootDir,
              onFileWritten,
            },
          );

          totalRecords += settingSummary.records;
          totalFiles += settingSummary.files;

          progress.report({
            increment: 100 / settings.length,
            message: `${setting.folder} complete (${settingSummary.files} files)`,
          });
        }

        if (!indexService.replacePullSnapshot) {
          throw new Error("Index service does not support replacePullSnapshot");
        }

        await indexService.replacePullSnapshot(
          workspaceFolderUri,
          indexUpdates,
        );

        return {
          settings: settings.length,
          records: totalRecords,
          files: totalFiles,
        };
      },
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${summary.settings} settings).`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PULL_ALL_FILES_FAILED,
        command: SN_SYNC_COMMANDS.PULL_ALL_FILES,
      },
    );
  }
}

export function registerSnPullAllFilesCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL_ALL_FILES,
    () =>
      runWithCommandStatus(
        () =>
          runSnPullAllFilesCommand(
            context,
            configService,
            pullService,
            defaultRuntime,
            new SnSyncIndexService(context.workspaceState),
          ),
        {
          message: "sn-sync: pulling all files...",
        },
      ),
  );

  context.subscriptions.push(disposable);
}

async function shouldDeleteBeforePullAllFilesCommand(
  runtime: Pick<SnPullAllFilesRuntime, "showWarningMessage">,
  clearBeforePull: SnPullClearBeforePull,
  rootDir: string,
): Promise<boolean> {
  if (clearBeforePull === "delete") {
    return true;
  }

  if (clearBeforePull === "keep") {
    return false;
  }

  const clearSrcChoice = await runtime.showWarningMessage(
    SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_PROMPT.replace("src", rootDir),
    SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
    SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
  );

  return clearSrcChoice === SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION;
}
