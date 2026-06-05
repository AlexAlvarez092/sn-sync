import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SN_SYNC_PUSH_CONFLICT_UI } from "@shared/constants/snSyncConstants.js";

const DEFAULT_TEMP_MERGE_CLEANUP_DELAY_MS = 5 * 60 * 1000;

export interface SnPushConflictCandidate {
  localPath: string;
  localContent: string;
}

export interface SnPushConflictResolverInput {
  workspaceFolderUri: vscode.Uri;
  candidate: SnPushConflictCandidate;
  remoteContent: string;
}

export type SnPushConflictDecision =
  | {
      kind: "overwriteRemote";
    }
  | {
      kind: "merge";
      mergedContent: string;
    }
  | {
      kind: "discardLocal";
    }
  | {
      kind: "skip";
    };

export interface SnPushConflictStats {
  conflicts: number;
  overwrite: number;
  merged: number;
  discarded: number;
  skipped: number;
}

export async function resolvePushConflictInteractive({
  workspaceFolderUri,
  candidate,
  remoteContent,
}: SnPushConflictResolverInput): Promise<SnPushConflictDecision> {
  const localUri = vscode.Uri.joinPath(workspaceFolderUri, candidate.localPath);
  const remoteTempUri = await writeTempMergeInput("remote", remoteContent);

  await openRemoteVsLocalDiff(localUri, candidate.localPath, remoteTempUri);

  const action = await vscode.window.showQuickPick(
    [
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.OVERWRITE_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.OVERWRITE_DESCRIPTION,
        value: "overwriteRemote",
      },
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.MERGE_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.MERGE_DESCRIPTION,
        value: "merge",
      },
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.DISCARD_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.DISCARD_DESCRIPTION,
        value: "discardLocal",
      },
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.SKIP_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.SKIP_DESCRIPTION,
        value: "skip",
      },
    ],
    {
      title: `${SN_SYNC_PUSH_CONFLICT_UI.PICK_TITLE_PREFIX} ${candidate.localPath}`,
      placeHolder: SN_SYNC_PUSH_CONFLICT_UI.PICK_PLACEHOLDER,
      ignoreFocusOut: true,
    },
  );

  if (!action || action.value === "skip") {
    scheduleTempUriCleanup(remoteTempUri);
    return { kind: "skip" };
  }

  if (action.value === "overwriteRemote") {
    scheduleTempUriCleanup(remoteTempUri);
    return { kind: "overwriteRemote" };
  }

  if (action.value === "discardLocal") {
    const confirm = await vscode.window.showWarningMessage(
      `${SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_PREFIX} ${candidate.localPath}?`,
      {
        modal: true,
      },
      SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_ACTION,
    );

    scheduleTempUriCleanup(remoteTempUri);
    return confirm === SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_ACTION
      ? { kind: "discardLocal" }
      : { kind: "skip" };
  }

  const openedMergeEditor = await openMergeEditor(localUri, {
    remoteUri: remoteTempUri,
  });

  if (!openedMergeEditor) {
    const mergedContent = buildMergeWithConflictMarkers(
      candidate.localContent,
      remoteContent,
    );

    await vscode.workspace.fs.writeFile(
      localUri,
      new TextEncoder().encode(mergedContent),
    );

    const mergeDocument = await vscode.workspace.openTextDocument(localUri);
    await vscode.window.showTextDocument(mergeDocument, {
      preview: false,
      preserveFocus: false,
    });

    scheduleTempUriCleanup(remoteTempUri);
  } else {
    scheduleTempUriCleanup(remoteTempUri);
  }

  const mergeAction = await vscode.window.showInformationMessage(
    `${SN_SYNC_PUSH_CONFLICT_UI.MERGE_PROMPT_PREFIX} ${candidate.localPath}, ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_PROMPT_SUFFIX}`,
    SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_PUSH,
    SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_SKIP,
  );

  if (mergeAction !== SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_PUSH) {
    return { kind: "skip" };
  }

  const mergeDocument = await vscode.workspace.openTextDocument(localUri);
  if (mergeDocument.isDirty) {
    await mergeDocument.save();
  }

  const mergedBytes = await vscode.workspace.fs.readFile(localUri);
  return {
    kind: "merge",
    mergedContent: new TextDecoder().decode(mergedBytes),
  };
}

export function formatConflictList(localPaths: string[]): string {
  const listed = localPaths.slice(0, 5).join(", ");
  const suffix = localPaths.length > 5 ? ` (+${localPaths.length - 5} more)` : "";
  return `${listed}${suffix}`;
}

export function formatConflictSummary(stats: SnPushConflictStats): string {
  if (stats.conflicts === 0) {
    return "";
  }

  return ` Conflicts: ${stats.conflicts}. Overwrite: ${stats.overwrite}. Merged: ${stats.merged}. Discarded: ${stats.discarded}. Skipped: ${stats.skipped}.`;
}

export function formatUploadedFilesCount(uploadedCount: number): string {
  const suffix = uploadedCount === 1 ? "file" : "files";
  return `${uploadedCount} ${suffix} uploaded.`;
}

async function openRemoteVsLocalDiff(
  localUri: vscode.Uri,
  localPath: string,
  remoteUri: vscode.Uri,
): Promise<void> {
  await vscode.commands.executeCommand(
    "vscode.diff",
    remoteUri,
    localUri,
    `${SN_SYNC_PUSH_CONFLICT_UI.DIFF_TITLE_PREFIX} ${localPath}`,
  );
}

function buildMergeWithConflictMarkers(local: string, remote: string): string {
  if (local === remote) {
    return local;
  }

  return [
    "<<<<<<< LOCAL",
    local,
    "=======",
    remote,
    ">>>>>>> REMOTE",
    "",
  ].join("\n");
}

async function openMergeEditor(
  outputUri: vscode.Uri,
  inputs: {
    remoteUri: vscode.Uri;
  },
): Promise<boolean> {
  try {
    await vscode.commands.executeCommand("_open.mergeEditor", {
      base: inputs.remoteUri,
      input1: {
        uri: outputUri,
        title: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_LOCAL_TITLE,
        description: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_LOCAL_DESCRIPTION,
        detail: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_LOCAL_DETAIL,
      },
      input2: {
        uri: inputs.remoteUri,
        title: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_REMOTE_TITLE,
        description: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_REMOTE_DESCRIPTION,
        detail: SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_REMOTE_DETAIL,
      },
      output: outputUri,
    });

    return true;
  } catch {
    return false;
  }
}

function scheduleTempUriCleanup(tempUri: vscode.Uri): void {
  setTimeout(() => {
    void vscode.workspace.fs.delete(tempUri).then(undefined, () => undefined);
  }, getTempMergeCleanupDelayMs());
}

function getTempMergeCleanupDelayMs(): number {
  const configuredDelay = Number(process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS);

  if (Number.isFinite(configuredDelay) && configuredDelay >= 0) {
    return configuredDelay;
  }

  return DEFAULT_TEMP_MERGE_CLEANUP_DELAY_MS;
}

async function writeTempMergeInput(
  label: string,
  content: string,
): Promise<vscode.Uri> {
  const fileUri = vscode.Uri.file(
    path.join(os.tmpdir(), `sn-sync-merge-${label}-${randomUUID()}.txt`),
  );

  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
  return fileUri;
}
