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
  SN_SYNC_DEFAULTS,
  SN_SYNC_INPUTS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import {
  type FolderClearRuntime,
  ensureDirectoryExists,
} from "@shared/services/snFolderService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

interface TableQuickPickItem extends vscode.QuickPickItem {
  setting: ExtensionConfigSetting;
}

export interface SnPullBySysIdRuntime
  extends SnBaseCommandRuntime, Pick<FolderClearRuntime, "createDirectory"> {
  showQuickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;
  showInputBox(options: vscode.InputBoxOptions): Thenable<string | undefined>;
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPullBySysIdRuntime = {
  ...defaultBaseRuntime,
  createDirectory: (uri: vscode.Uri) =>
    vscode.workspace.fs.createDirectory(uri),
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  showInputBox: (options: vscode.InputBoxOptions) =>
    vscode.window.showInputBox(options),
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

export async function runSnPullBySysIdCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullBySysIdRuntime = defaultRuntime,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
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
      detail: setting.query,
      setting,
    }));

    const selected = await runtime.showQuickPick(items, {
      placeHolder: SN_SYNC_MESSAGES.PULL_BY_SYS_ID_TABLE_PROMPT,
      ignoreFocusOut: true,
    });

    if (!selected) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PULL_BY_SYS_ID_CANCELLED,
      );
      return;
    }

    const rawSysId = await runtime.showInputBox({
      prompt: SN_SYNC_INPUTS.PULL_BY_SYS_ID_PROMPT,
      placeHolder: SN_SYNC_INPUTS.PULL_BY_SYS_ID_PLACEHOLDER,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim()
          ? undefined
          : SN_SYNC_MESSAGES.PULL_BY_SYS_ID_INVALID_SYS_ID,
    });

    if (rawSysId === undefined) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PULL_BY_SYS_ID_CANCELLED,
      );
      return;
    }

    const sysId = rawSysId.trim();
    if (!sysId) {
      void runtime.showErrorMessage(
        SN_SYNC_MESSAGES.PULL_BY_SYS_ID_INVALID_SYS_ID,
      );
      return;
    }

    const preferences = await resolvePreferences(
      configService,
      workspaceFolderUri,
    );

    await ensureDirectoryExists(
      runtime,
      vscode.Uri.joinPath(workspaceFolderUri, preferences.rootDir),
    );

    const filteredSetting: ExtensionConfigSetting = {
      ...selected.setting,
      query: `sys_id=${sysId}`,
    };

    const summary = await runtime.withProgress(
      SN_SYNC_MESSAGES.PULL_PROGRESS_TITLE,
      async (progress) => {
        let visibleFilesWritten = 0;
        const indexUpdates: Array<{
          localPath: string;
          table: string;
          sysId: string;
          fieldName: string;
          baseHash: string;
        }> = [];

        const settingSummary = await pullService.pullConfiguredScripts(
          context,
          workspaceFolderUri,
          [filteredSetting],
          {
            rootDir: preferences.rootDir,
            onFileWritten: ({
              settingFolder,
              fileName,
              localPath,
              table,
              sysId,
              fieldName,
              baseHash,
            }) => {
              visibleFilesWritten += 1;
              progress.report({
                message: `Writing ${visibleFilesWritten} files... (${settingFolder}/${fileName})`,
              });

              if (!sysId || !localPath || !table || !fieldName || !baseHash) {
                return;
              }

              indexUpdates.push({
                localPath,
                table,
                sysId,
                fieldName,
                baseHash,
              });
            },
          },
        );

        await indexService.recordPullFiles(workspaceFolderUri, indexUpdates);

        progress.report({ increment: 100 });

        return settingSummary;
      },
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${selected.setting.folder}).`,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnPullBySysIdCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
    () =>
      runSnPullBySysIdCommand(
        context,
        configService,
        pullService,
        defaultRuntime,
        new SnSyncIndexService(context.workspaceState),
      ),
  );

  context.subscriptions.push(disposable);
}

async function resolvePreferences(
  configService: SnSyncConfigService,
  workspaceFolderUri: vscode.Uri,
): Promise<{
  rootDir: string;
  pull: { clearBeforePull: "ask" | "delete" | "keep" };
}> {
  if (typeof configService.getPreferences === "function") {
    return configService.getPreferences(workspaceFolderUri);
  }

  return {
    rootDir: SN_SYNC_DEFAULTS.ROOT_DIR,
    pull: {
      clearBeforePull: SN_SYNC_DEFAULTS.CLEAR_BEFORE_PULL,
    },
  };
}
