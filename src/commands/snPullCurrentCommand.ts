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
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { type FolderClearRuntime } from "@shared/services/snFolderService.js";
import {
  defaultScopedPullWithProgress,
  runScopedPullWithIndex,
} from "@shared/services/snScopedPullCommandService.js";

export interface SnPullCurrentRuntime
  extends SnBaseCommandRuntime, Pick<FolderClearRuntime, "createDirectory"> {
  getCurrentTextEditor(): vscode.TextEditor | undefined;
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPullCurrentRuntime = {
  ...defaultBaseRuntime,
  getCurrentTextEditor: () => vscode.window.activeTextEditor,
  createDirectory: (uri: vscode.Uri) =>
    vscode.workspace.fs.createDirectory(uri),
  withProgress: defaultScopedPullWithProgress,
};

export async function runSnPullCurrentCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService,
  pullService: SnPullServiceApi,
  runtime: SnPullCurrentRuntime = defaultRuntime,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const currentEditor = runtime.getCurrentTextEditor();
  if (!currentEditor) {
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.PULL_CURRENT_NO_EDITOR,
    );
    return;
  }

  const localPath = indexService.toWorkspaceRelativePath(
    workspaceFolderUri,
    currentEditor.document.uri,
  );
  const entry = await indexService.findEntryByLocalPath(
    workspaceFolderUri,
    localPath,
  );

  if (!entry) {
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.PULL_CURRENT_NOT_INDEXED,
    );
    return;
  }

  try {
    const summary = await runScopedPullWithIndex({
      context,
      workspaceFolderUri,
      runtime,
      configService,
      indexService,
      runPull: async ({ settings, rootDir, onFileWritten }) =>
        pullService.pullRecordBySysId
          ? pullService.pullRecordBySysId(
              context,
              workspaceFolderUri,
              settings,
              entry.table,
              entry.sysId,
              {
                rootDir,
                onFileWritten,
              },
            )
          : pullService.pullConfiguredScripts(
              context,
              workspaceFolderUri,
              settings
                .filter((setting) => setting.table === entry.table)
                .map((setting) => ({
                  ...setting,
                  query: `sys_id=${entry.sysId}`,
                })),
              {
                rootDir,
                onFileWritten,
              },
            ),
    });

    if (!summary) {
      return;
    }

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PULL_CURRENT_SUCCESS_PREFIX} ${summary.files} files from ${summary.records} records (${entry.table}/${entry.sysId}).`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PULL_CURRENT_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PULL_CURRENT_FAILED,
        command: SN_SYNC_COMMANDS.PULL_CURRENT,
      },
    );
  }
}

export function registerSnPullCurrentCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncConfigService = new SnSyncConfigService(),
  pullService: SnPullServiceApi = new SnPullService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.PULL_CURRENT,
    task: () =>
      runSnPullCurrentCommand(
        context,
        configService,
        pullService,
        defaultRuntime,
        new SnSyncIndexService(context.workspaceState),
      ),
    message: "sn-sync: pulling current file...",
  });
}
