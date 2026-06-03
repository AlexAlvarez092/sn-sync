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
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  showPrefixedCommandError,
  withNotificationProgress,
} from "@shared/services/snCommandRuntime.js";
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
  withProgress: withNotificationProgress,
};

export async function runSnPushModifiedCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi,
  indexService: SnSyncIndexServiceApi,
  runtime: SnPushModifiedRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
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

    const candidatesByRecord = new Map<
      string,
      {
        table: string;
        sysId: string;
        candidates: SnSyncIndexCandidate[];
      }
    >();

    for (const candidate of candidates) {
      const key = `${candidate.entry.table}::${candidate.entry.sysId}`;
      const existing = candidatesByRecord.get(key);

      if (existing) {
        existing.candidates.push(candidate);
        continue;
      }

      candidatesByRecord.set(key, {
        table: candidate.entry.table,
        sysId: candidate.entry.sysId,
        candidates: [candidate],
      });
    }

    const recordGroups = [...candidatesByRecord.values()];
    const storedContentsByLocalPath = new Map<string, string>();

    await runtime.withProgress(
      SN_SYNC_MESSAGES.PUSH_PROGRESS_TITLE,
      async (progress) => {
        let processedGroups = 0;

        for (const group of recordGroups) {
          const fieldMap: Record<string, string> = {};

          for (const candidate of group.candidates) {
            fieldMap[candidate.entry.fieldName] = candidate.localContent;
          }

          if (pushService.pushRecordFields) {
            const storedFieldMap = await pushService.pushRecordFields(
              context,
              workspaceFolderUri,
              group.table,
              group.sysId,
              fieldMap,
            );

            for (const candidate of group.candidates) {
              storedContentsByLocalPath.set(
                candidate.entry.localPath,
                storedFieldMap[candidate.entry.fieldName] ?? "",
              );
            }
          } else {
            for (const candidate of group.candidates) {
              const storedContent = await pushService.pushFieldContent(
                context,
                workspaceFolderUri,
                candidate.entry,
                candidate.localContent,
              );

              storedContentsByLocalPath.set(
                candidate.entry.localPath,
                storedContent,
              );
            }
          }

          processedGroups += 1;
          progress.report({
            increment: 100 / recordGroups.length,
            message: `Uploading record ${processedGroups}/${recordGroups.length}: ${group.table}/${group.sysId} (${group.candidates.length} files)`,
          });
        }

        return undefined;
      },
    );

    await indexService.updateBaseHashes(
      workspaceFolderUri,
      candidates.map((candidate, index) => ({
        localPath: candidate.entry.localPath,
        table: candidate.entry.table,
        sysId: candidate.entry.sysId,
        fieldName: candidate.entry.fieldName,
        baseHash: hashText(
          storedContentsByLocalPath.get(candidate.entry.localPath) ?? "",
        ),
      })),
    );

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} ${candidates.length} files uploaded.`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PUSH_MODIFIED_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PUSH_MODIFIED_FAILED,
        command: SN_SYNC_COMMANDS.PUSH_MODIFIED,
      },
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
