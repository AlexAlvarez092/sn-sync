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
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { hashText } from "@shared/services/hashService.js";
import {
  formatConflictSummary,
  formatUploadedFilesCount,
  resolvePushConflictInteractive,
  type SnPushConflictDecision,
  type SnPushConflictResolverInput,
} from "@shared/services/snPushConflictResolutionService.js";

export interface SnPushCurrentRuntime extends SnBaseCommandRuntime {
  getCurrentTextEditor(): vscode.TextEditor | undefined;
  resolveConflict?(args: {
    candidate: {
      localPath: string;
      localContent: string;
    };
  }): Thenable<SnPushConflictDecision>;
}

const defaultRuntime: SnPushCurrentRuntime = {
  ...defaultBaseRuntime,
  getCurrentTextEditor: () => vscode.window.activeTextEditor,
  resolveConflict: resolvePushConflictInteractive,
};

function formatPushCurrentEntryContext(entry: {
  localPath: string;
  table: string;
  sysId: string;
  fieldName: string;
}): string {
  return `localPath=${entry.localPath}, table=${entry.table}, sys_id=${entry.sysId}, field=${entry.fieldName}`;
}

export async function runSnPushCurrentCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi,
  indexService: SnSyncIndexServiceApi,
  runtime: SnPushCurrentRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const currentEditor = runtime.getCurrentTextEditor();
  if (!currentEditor) {
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.PUSH_CURRENT_NO_EDITOR,
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
      SN_SYNC_MESSAGES.PUSH_CURRENT_NOT_INDEXED,
    );
    return;
  }

  try {
    const localContent = currentEditor.document.getText();
    const localHash = hashText(localContent);

    if (localHash === entry.baseHash) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PUSH_CURRENT_NO_LOCAL_CHANGES,
      );
      return;
    }

    const remoteContent = await pushService
      .getRemoteFieldContent(context, workspaceFolderUri, entry)
      .catch((error) => {
        throw new Error(
          `Failed to fetch remote content (${formatPushCurrentEntryContext(entry)}): ${String(error)}`,
        );
      });
    const remoteHash = hashText(remoteContent);

    let contentToPush = localContent;
    let conflictCount = 0;
    let overwriteCount = 0;
    let discardedCount = 0;
    let skippedCount = 0;

    if (remoteHash !== entry.baseHash && !runtime.resolveConflict) {
      void runtime.showErrorMessage(
        `${SN_SYNC_MESSAGES.PUSH_CURRENT_CONFLICT_PREFIX} ${entry.localPath}`,
      );
      return;
    }

    if (remoteHash !== entry.baseHash && runtime.resolveConflict) {
      conflictCount = 1;
      const decisionInput: SnPushConflictResolverInput = {
        candidate: {
          localPath: entry.localPath,
          localContent,
        },
      };
      const decision = await runtime.resolveConflict(decisionInput);

      if (decision.kind === "skip") {
        skippedCount = 1;
        void runtime.showInformationMessage(
          `${SN_SYNC_MESSAGES.PUSH_CURRENT_SUCCESS} ${formatUploadedFilesCount(0)}${formatConflictSummary(
            {
              conflicts: conflictCount,
              overwrite: overwriteCount,
              discarded: discardedCount,
              skipped: skippedCount,
            },
          )}`,
        );
        return;
      }

      if (decision.kind === "discardLocal") {
        discardedCount = 1;
        await vscode.workspace.fs.writeFile(
          currentEditor.document.uri,
          new TextEncoder().encode(remoteContent),
        );

        await indexService.updateBaseHashes(workspaceFolderUri, [
          {
            localPath: entry.localPath,
            table: entry.table,
            sysId: entry.sysId,
            fieldName: entry.fieldName,
            baseHash: hashText(remoteContent),
          },
        ]);

        void runtime.showInformationMessage(
          `${SN_SYNC_MESSAGES.PUSH_CURRENT_SUCCESS} ${formatUploadedFilesCount(0)}${formatConflictSummary(
            {
              conflicts: conflictCount,
              overwrite: overwriteCount,
              discarded: discardedCount,
              skipped: skippedCount,
            },
          )}`,
        );
        return;
      }

      // overwriteRemote
      overwriteCount = 1;
    }

    const storedContent = await pushService
      .pushFieldContent(context, workspaceFolderUri, entry, contentToPush)
      .catch((error) => {
        throw new Error(
          `Failed to push current content (${formatPushCurrentEntryContext(entry)}): ${String(error)}`,
        );
      });

    await indexService.updateBaseHashes(workspaceFolderUri, [
      {
        localPath: entry.localPath,
        table: entry.table,
        sysId: entry.sysId,
        fieldName: entry.fieldName,
        baseHash: hashText(storedContent),
      },
    ]);

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.PUSH_CURRENT_SUCCESS} ${formatUploadedFilesCount(1)}${formatConflictSummary(
        {
          conflicts: conflictCount,
          overwrite: overwriteCount,
          discarded: discardedCount,
          skipped: skippedCount,
        },
      )}`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PUSH_CURRENT_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.PUSH_CURRENT_FAILED,
        command: SN_SYNC_COMMANDS.PUSH_CURRENT,
        context: {
          localPath: entry.localPath,
          table: entry.table,
          sysId: entry.sysId,
          fieldName: entry.fieldName,
        },
      },
    );
  }
}

export function registerSnPushCurrentCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi = new SnPushService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.PUSH_CURRENT,
    task: () =>
      runSnPushCurrentCommand(
        context,
        pushService,
        new SnSyncIndexService(context.workspaceState),
      ),
    message: "sn-sync: pushing current file...",
  });
}
