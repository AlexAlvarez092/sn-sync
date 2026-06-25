import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import type { SnSyncIndexServiceApi } from "@services/snSyncIndexService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  withNotificationProgress,
} from "@shared/services/snCommandRuntime.js";
import {
  type FolderClearRuntime,
  ensureDirectoryExists,
} from "@shared/services/snFolderService.js";
import { resolvePreferences } from "@shared/services/snPreferencesService.js";
import { createPullFileWrittenHandler } from "@shared/services/snPullProgressService.js";
import { resolveWorkspaceChildUri } from "@shared/services/snWorkspacePathService.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import type {
  SnPullProgressEvent,
  SnPullSummary,
} from "@services/snPullService.js";

export interface SnScopedPullRuntime
  extends SnBaseCommandRuntime, Pick<FolderClearRuntime, "createDirectory"> {
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

export const defaultScopedPullWithProgress = withNotificationProgress;

export async function runScopedPullWithIndex(args: {
  context: vscode.ExtensionContext;
  workspaceFolderUri: vscode.Uri;
  runtime: SnScopedPullRuntime;
  configService: SnSyncConfigService;
  indexService: SnSyncIndexServiceApi;
  runPull: (params: {
    settings: ExtensionConfigSetting[];
    rootDir: string;
    onFileWritten: (event: SnPullProgressEvent) => void | Promise<void>;
  }) => Promise<SnPullSummary>;
}): Promise<SnPullSummary | undefined> {
  const settings = await args.configService.getSyncSettings(
    args.workspaceFolderUri,
  );

  if (settings.length === 0) {
    void args.runtime.showInformationMessage(SN_SYNC_MESSAGES.PULL_NO_SETTINGS);
    return undefined;
  }

  const preferences = await resolvePreferences(
    args.configService,
    args.workspaceFolderUri,
  );

  const rootDirUri = resolveWorkspaceChildUri(args.workspaceFolderUri, [
    {
      value: preferences.rootDir,
      label: "rootDir",
      allowHierarchy: true,
    },
  ]);

  await ensureDirectoryExists(args.runtime, rootDirUri);

  return args.runtime.withProgress(
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

      const summary = await args.runPull({
        settings,
        rootDir: preferences.rootDir,
        onFileWritten,
      });

      await args.indexService.recordPullFiles(
        args.workspaceFolderUri,
        indexUpdates,
      );
      progress.report({ increment: 100 });

      return summary;
    },
  );
}
