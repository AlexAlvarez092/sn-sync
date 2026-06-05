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
  runWithCommandStatus,
  showPrefixedCommandError,
  withNotificationProgress,
} from "@shared/services/snCommandRuntime.js";
import type { SnSyncIndexCandidate } from "@services/snSyncIndexService.js";
import { hashText } from "@shared/services/hashService.js";
import {
  formatConflictList,
  formatConflictSummary,
  formatUploadedFilesCount,
  resolvePushConflictInteractive,
  type SnPushConflictDecision,
  type SnPushConflictResolverInput,
} from "@shared/services/snPushConflictResolutionService.js";
import { resolveWorkspaceChildUri } from "@shared/services/snWorkspacePathService.js";

export interface SnPushModifiedRuntime extends SnBaseCommandRuntime {
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
  resolveConflict?(args: {
    workspaceFolderUri: vscode.Uri;
    candidate: {
      localPath: string;
      localContent: string;
    };
    remoteContent: string;
  }): Thenable<SnPushConflictDecision>;
}

const defaultRuntime: SnPushModifiedRuntime = {
  ...defaultBaseRuntime,
  withProgress: withNotificationProgress,
  resolveConflict: resolvePushConflictInteractive,
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

    const conflictCandidates: Array<{
      candidate: SnSyncIndexCandidate;
      remoteContent: string;
    }> = [];
    const candidatesToPush: SnSyncIndexCandidate[] = [];
    let discardedCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;
    let overwriteCount = 0;

    for (const candidate of candidates) {
      const remoteContent = await pushService.getRemoteFieldContent(
        context,
        workspaceFolderUri,
        candidate.entry,
      );
      const remoteHash = hashText(remoteContent);

      if (remoteHash !== candidate.entry.baseHash) {
        conflictCandidates.push({
          candidate,
          remoteContent,
        });
        continue;
      }

      candidatesToPush.push(candidate);
    }

    if (conflictCandidates.length > 0 && !runtime.resolveConflict) {
      const conflictList = conflictCandidates.map(
        (conflict) => conflict.candidate.entry.localPath,
      );

      void runtime.showErrorMessage(
        `${SN_SYNC_MESSAGES.PUSH_MODIFIED_CONFLICTS_PREFIX} ${formatConflictList(conflictList)}`,
      );
      return;
    }

    if (runtime.resolveConflict) {
      for (const { candidate, remoteContent } of conflictCandidates) {
        const decisionInput: SnPushConflictResolverInput = {
          workspaceFolderUri,
          candidate: {
            localPath: candidate.entry.localPath,
            localContent: candidate.localContent,
          },
          remoteContent,
        };

        const decision = await runtime.resolveConflict(decisionInput);

        if (decision.kind === "overwriteRemote") {
          overwriteCount += 1;
          candidatesToPush.push(candidate);
          continue;
        }

        if (decision.kind === "merge") {
          mergedCount += 1;
          candidatesToPush.push({
            ...candidate,
            localContent: decision.mergedContent,
            localHash: hashText(decision.mergedContent),
          });
          continue;
        }

        if (decision.kind === "discardLocal") {
          const localUri = resolveWorkspaceChildUri(workspaceFolderUri, [
            {
              value: candidate.entry.localPath,
              label: "local path",
              allowHierarchy: true,
            },
          ]);

          await vscode.workspace.fs.writeFile(
            localUri,
            new TextEncoder().encode(remoteContent),
          );

          await indexService.updateBaseHashes(workspaceFolderUri, [
            {
              localPath: candidate.entry.localPath,
              table: candidate.entry.table,
              sysId: candidate.entry.sysId,
              fieldName: candidate.entry.fieldName,
              baseHash: hashText(remoteContent),
            },
          ]);

          discardedCount += 1;
          continue;
        }

        skippedCount += 1;
      }
    }

    if (candidatesToPush.length === 0) {
      void runtime.showInformationMessage(
        `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} ${formatUploadedFilesCount(0)}${formatConflictSummary(
          {
            conflicts: conflictCandidates.length,
            overwrite: overwriteCount,
            merged: mergedCount,
            discarded: discardedCount,
            skipped: skippedCount,
          },
        )}`,
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

    for (const candidate of candidatesToPush) {
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
      candidatesToPush.map((candidate) => ({
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
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} ${formatUploadedFilesCount(candidatesToPush.length)}${formatConflictSummary(
        {
          conflicts: conflictCandidates.length,
          overwrite: overwriteCount,
          merged: mergedCount,
          discarded: discardedCount,
          skipped: skippedCount,
        },
      )}`,
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
      runWithCommandStatus(
        () =>
          runSnPushModifiedCommand(
            context,
            pushService,
            new SnSyncIndexService(context.workspaceState),
          ),
        {
          message: "sn-sync: pushing modified files...",
        },
      ),
  );

  context.subscriptions.push(disposable);
}
