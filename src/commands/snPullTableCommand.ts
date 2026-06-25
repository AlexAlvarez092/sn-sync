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
  SnBaseSnapshotStore,
  type SnBaseSnapshotStoreApi,
} from "@services/snBaseSnapshotStore.js";
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
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import {
  type FolderClearRuntime,
  clearDirectory,
  ensureDirectoryExists,
} from "@shared/services/snFolderService.js";
import { resolvePreferences } from "@shared/services/snPreferencesService.js";
import { createPullFileWrittenHandler } from "@shared/services/snPullProgressService.js";
import { resolveWorkspaceChildUri } from "@shared/services/snWorkspacePathService.js";
import { defaultScopedPullWithProgress } from "@shared/services/snScopedPullCommandService.js";

interface TableQuickPickItem extends vscode.QuickPickItem {
  table: string;
}

export interface SnPullTableRuntime
  extends SnBaseCommandRuntime, FolderClearRuntime {
  showQuickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;
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

const defaultRuntime: SnPullTableRuntime = {
  ...defaultBaseRuntime,
  showWarningMessage: (message: string, ...items: string[]) =>
    vscode.window.showWarningMessage(message, ...items),
  readDirectory: (uri: vscode.Uri) => vscode.workspace.fs.readDirectory(uri),
  delete: (uri: vscode.Uri, options) =>
    vscode.workspace.fs.delete(uri, options),
  createDirectory: (uri: vscode.Uri) =>
    vscode.workspace.fs.createDirectory(uri),
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  withProgress: defaultScopedPullWithProgress,
};

export async function runSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullTableRuntime = defaultRuntime,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
  snapshotStore: SnBaseSnapshotStoreApi = new SnBaseSnapshotStore(),
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

    const uniqueTables = [...new Set(settings.map((setting) => setting.table))];
    const items: TableQuickPickItem[] = uniqueTables.map((table) => {
      const settingCount = settings.filter(
        (setting) => setting.table === table,
      ).length;
      return {
        label: table,
        description: `${settingCount} setting${settingCount === 1 ? "" : "s"}`,
        table,
      };
    });

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

    const shouldDeleteBeforePull = await shouldDeleteBeforePullTableCommand(
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
          { store: snapshotStore, workspaceFolderUri },
        );

        const settingsForTable = settings.filter(
          (setting) => setting.table === selected.table,
        );

        const result = pullService.pullTable
          ? await pullService.pullTable(
              context,
              workspaceFolderUri,
              settings,
              selected.table,
              {
                rootDir: preferences.rootDir,
                onFileWritten,
              },
            )
          : await pullService.pullConfiguredScripts(
              context,
              workspaceFolderUri,
              settingsForTable,
              {
                rootDir: preferences.rootDir,
                onFileWritten,
              },
            );

        if (!indexService.replacePullSnapshot) {
          throw new Error("Index service does not support replacePullSnapshot");
        }

        await indexService.replacePullSnapshot(
          workspaceFolderUri,
          indexUpdates,
        );

        progress.report({ increment: 100 });

        return result;
      },
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${selected.table}).`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PULL_TABLE_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PULL_TABLE_FAILED,
        command: SN_SYNC_COMMANDS.PULL_TABLE,
      },
    );
  }
}

async function shouldDeleteBeforePullTableCommand(
  runtime: Pick<SnPullTableRuntime, "showWarningMessage">,
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

export function registerSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.PULL_TABLE,
    task: () =>
      runSnPullTableCommand(
        context,
        configService,
        pullService,
        defaultRuntime,
        new SnSyncIndexService(context.workspaceState),
        new SnBaseSnapshotStore(),
      ),
    message: "sn-sync: pulling table...",
  });
}
