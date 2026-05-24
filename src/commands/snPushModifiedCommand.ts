import * as vscode from "vscode";
import {
  SnPushService,
  type SnPushServiceApi,
} from "@services/snPushService.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";
import type { SnSyncIndexCandidate } from "@services/snSyncIndexService.js";
import { hashText } from "@shared/services/hashService.js";

export interface SnPushModifiedRuntime extends SnBaseCommandRuntime {
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
}

const defaultRuntime: SnPushModifiedRuntime = {
  ...defaultBaseRuntime,
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

export async function runSnPushModifiedCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi,
  indexService: SnSyncIndexServiceApi,
  runtime: SnPushModifiedRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    const candidates =
      await indexService.getModifiedCandidates(workspaceFolderUri);

    if (candidates.length === 0) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PUSH_MODIFIED_NO_LOCAL_CHANGES,
      );
      return;
    }

    const conflicts: SnSyncIndexCandidate[] = [];

    for (const candidate of candidates) {
      const remoteContent = await pushService.getRemoteFieldContent(
        context,
        workspaceFolderUri,
        candidate.entry,
      );
      const remoteHash = hashText(remoteContent);

      if (remoteHash !== candidate.entry.baseHash) {
        conflicts.push(candidate);
      }
    }

    if (conflicts.length > 0) {
      const conflictList = conflicts
        .slice(0, 5)
        .map((conflict) => conflict.entry.localPath)
        .join(", ");
      const suffix =
        conflicts.length > 5 ? ` (+${conflicts.length - 5} more)` : "";

      void runtime.showErrorMessage(
        `${SN_SYNC_MESSAGES.PUSH_MODIFIED_CONFLICTS_PREFIX} ${conflictList}${suffix}`,
      );
      return;
    }

    await runtime.withProgress(
      SN_SYNC_MESSAGES.PUSH_PROGRESS_TITLE,
      async (progress) => {
        let processed = 0;

        for (const candidate of candidates) {
          await pushService.pushFieldContent(
            context,
            workspaceFolderUri,
            candidate.entry,
            candidate.localContent,
          );

          processed += 1;
          progress.report({
            increment: 100 / candidates.length,
            message: `Uploading ${processed}/${candidates.length}: ${candidate.entry.localPath}`,
          });
        }

        return undefined;
      },
    );

    await indexService.updateBaseHashes(
      workspaceFolderUri,
      candidates.map((candidate) => ({
        localPath: candidate.entry.localPath,
        table: candidate.entry.table,
        sysId: candidate.entry.sysId,
        fieldName: candidate.entry.fieldName,
        baseHash: candidate.localHash,
      })),
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} ${candidates.length} files uploaded.`,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnPushModifiedCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi = new SnPushService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PUSH_MODIFIED,
    () =>
      runSnPushModifiedCommand(
        context,
        pushService,
        new SnSyncIndexService(context.workspaceState),
      ),
  );

  context.subscriptions.push(disposable);
}
