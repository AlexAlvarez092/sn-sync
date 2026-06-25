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
  SN_SYNC_INPUTS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { type FolderClearRuntime } from "@shared/services/snFolderService.js";
import {
  defaultScopedPullWithProgress,
  runScopedPullWithIndex,
} from "@shared/services/snScopedPullCommandService.js";

interface TableQuickPickItem extends vscode.QuickPickItem {
  setting: ExtensionConfigSetting;
}

const SYS_ID_PATTERN = /^[0-9a-f]{32}$/i;

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
  withProgress: defaultScopedPullWithProgress,
};

export async function runSnPullBySysIdCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullBySysIdRuntime = defaultRuntime,
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
      validateInput: (value) => {
        const normalizedValue = value.trim();
        return SYS_ID_PATTERN.test(normalizedValue)
          ? undefined
          : SN_SYNC_MESSAGES.PULL_BY_SYS_ID_INVALID_SYS_ID;
      },
    });

    if (rawSysId === undefined) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PULL_BY_SYS_ID_CANCELLED,
      );
      return;
    }

    const sysId = rawSysId.trim();
    if (!SYS_ID_PATTERN.test(sysId)) {
      void runtime.showErrorMessage(
        SN_SYNC_MESSAGES.PULL_BY_SYS_ID_INVALID_SYS_ID,
      );
      return;
    }

    const summary = await runScopedPullWithIndex({
      context,
      workspaceFolderUri,
      runtime,
      configService,
      indexService,
      snapshotStore,
      runPull: async ({ settings, rootDir, onFileWritten }) =>
        pullService.pullRecordBySysId
          ? pullService.pullRecordBySysId(
              context,
              workspaceFolderUri,
              settings,
              selected.setting.table,
              sysId,
              {
                rootDir,
                onFileWritten,
              },
            )
          : pullService.pullConfiguredScripts(
              context,
              workspaceFolderUri,
              [
                {
                  ...selected.setting,
                  query: `sys_id=${sysId}`,
                } as ExtensionConfigSetting,
              ],
              {
                rootDir,
                onFileWritten,
              },
            ),
    });

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_SUCCESS_PREFIX} ${summary!.files} files from ${summary!.records} records (${selected.setting.folder}).`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PULL_BY_SYS_ID_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PULL_BY_SYS_ID_FAILED,
        command: SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
      },
    );
  }
}

export function registerSnPullBySysIdCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
    task: () =>
      runSnPullBySysIdCommand(
        context,
        configService,
        pullService,
        defaultRuntime,
        new SnSyncIndexService(context.workspaceState),
        new SnBaseSnapshotStore(),
      ),
    message: "sn-sync: pulling record by sys_id...",
  });
}
