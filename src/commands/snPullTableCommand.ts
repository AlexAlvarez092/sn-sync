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
  ensureDirectoryExists,
} from "@shared/services/snFolderService.js";
import { resolvePreferences } from "@shared/services/snPreferencesService.js";
import { createPullFileWrittenHandler } from "@shared/services/snPullProgressService.js";
import { resolveWorkspaceChildUri } from "@shared/services/snWorkspacePathService.js";

interface TableQuickPickItem extends vscode.QuickPickItem {
  table: string;
}

export interface SnPullTableRuntime
  extends SnBaseCommandRuntime, Pick<FolderClearRuntime, "createDirectory"> {
  showQuickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPullTableRuntime = {
  ...defaultBaseRuntime,
  createDirectory: (uri: vscode.Uri) =>
    vscode.workspace.fs.createDirectory(uri),
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  withProgress: withNotificationProgress,
};

export async function runSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullTableRuntime = defaultRuntime,
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
        );

        const settingSummary = pullService.pullTable
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
              settings.filter((setting) => setting.table === selected.table),
              {
                rootDir: preferences.rootDir,
                onFileWritten,
              },
            );

        await indexService.recordPullFiles(workspaceFolderUri, indexUpdates);
        progress.report({ increment: 100 });

        return settingSummary;
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

export function registerSnPullTableCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL_TABLE,
    () =>
      runWithCommandStatus(
        () =>
          runSnPullTableCommand(
            context,
            configService,
            pullService,
            defaultRuntime,
            new SnSyncIndexService(context.workspaceState),
          ),
        {
          message: "sn-sync: pulling table...",
        },
      ),
  );

  context.subscriptions.push(disposable);
}
