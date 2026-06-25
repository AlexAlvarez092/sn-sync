import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { diffComm, diff3Merge } from "@shared/utils/diff3.cjs";
import { SN_SYNC_PUSH_CONFLICT_UI } from "@shared/constants/snSyncConstants.js";

const DEFAULT_TEMP_MERGE_CLEANUP_DELAY_MS = 5 * 60 * 1000;
const MAX_TEMP_MERGE_CLEANUP_DELAY_MS = 60 * 60 * 1000;
const pendingTempUriKeys = new Set<string>();
const scheduledCleanupTimeouts = new Set<ReturnType<typeof setTimeout>>();

export interface SnPushConflictCandidate {
  localPath: string;
  localContent: string;
}

export interface SnPushConflictResolverInput {
  workspaceFolderUri: vscode.Uri;
  candidate: SnPushConflictCandidate;
  remoteContent: string;
  baseContent?: string;
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
  baseContent,
}: SnPushConflictResolverInput): Promise<SnPushConflictDecision> {
  const localUri = vscode.Uri.joinPath(workspaceFolderUri, candidate.localPath);
  const remoteTempUri = await writeTempRemoteSnapshot(remoteContent);

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

  // merge path
  const mergedContent = buildConflictMarkersFromDiff3(
    candidate.localContent,
    remoteContent,
    baseContent,
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

  const mergeAction = await vscode.window.showInformationMessage(
    `${SN_SYNC_PUSH_CONFLICT_UI.MERGE_PROMPT_PREFIX} ${candidate.localPath}, ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_PROMPT_SUFFIX}`,
    SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_PUSH,
    SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_SKIP,
  );

  if (mergeAction !== SN_SYNC_PUSH_CONFLICT_UI.MERGE_ACTION_PUSH) {
    await vscode.workspace.fs.writeFile(
      localUri,
      new TextEncoder().encode(candidate.localContent),
    );
    return { kind: "skip" };
  }

  const resultDocument = await vscode.workspace.openTextDocument(localUri);
  if (resultDocument.isDirty) {
    await resultDocument.save();
  }

  const mergedBytes = await vscode.workspace.fs.readFile(localUri);
  return {
    kind: "merge",
    mergedContent: new TextDecoder().decode(mergedBytes),
  };
}

export function formatConflictList(localPaths: string[]): string {
  const listed = localPaths.slice(0, 5).join(", ");
  const suffix =
    localPaths.length > 5 ? ` (+${localPaths.length - 5} more)` : "";
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

export function buildConflictMarkersFromDiff3(
  local: string,
  remote: string,
  base?: string,
): string {
  if (local === remote) {
    return local;
  }

  const localLines = local.split("\n");
  const remoteLines = remote.split("\n");

  if (base !== undefined) {
    const baseLines = base.split("\n");
    const regions = diff3Merge(localLines, baseLines, remoteLines);
    const result: string[] = [];

    for (const region of regions) {
      if ("ok" in region) {
        result.push(...region.ok);
      } else {
        result.push(
          `<<<<<<< ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_LOCAL_TITLE}`,
          ...region.conflict.a,
          "=======",
          ...region.conflict.b,
          `>>>>>>> ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_REMOTE_TITLE}`,
        );
      }
    }

    return result.join("\n");
  }

  const regions = diffComm(localLines, remoteLines);
  const result: string[] = [];

  for (const region of regions) {
    if ("common" in region) {
      result.push(...region.common);
    } else {
      result.push(
        `<<<<<<< ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_LOCAL_TITLE}`,
        ...region.buffer1,
        "=======",
        ...region.buffer2,
        `>>>>>>> ${SN_SYNC_PUSH_CONFLICT_UI.MERGE_INPUT_REMOTE_TITLE}`,
      );
    }
  }

  return result.join("\n");
}

function scheduleTempUriCleanup(tempUri: vscode.Uri): void {
  const tempUriKey = getTempUriKey(tempUri);
  pendingTempUriKeys.add(tempUriKey);

  const timeoutHandle = setTimeout(() => {
    scheduledCleanupTimeouts.delete(timeoutHandle);
    void cleanupTempUriByKey(tempUriKey);
  }, getTempMergeCleanupDelayMs());

  scheduledCleanupTimeouts.add(timeoutHandle);
}

function getTempUriKey(tempUri: vscode.Uri): string {
  return tempUri.toString();
}

async function cleanupTempUriByKey(tempUriKey: string): Promise<void> {
  try {
    await vscode.workspace.fs.delete(vscode.Uri.parse(tempUriKey));
  } catch (error) {
    const errorMessage = String(error);
    console.warn(
      `sn-sync: failed to cleanup temp merge file ${tempUriKey}: ${errorMessage}`,
    );
  } finally {
    pendingTempUriKeys.delete(tempUriKey);
  }
}

export async function flushScheduledTempMergeCleanup(): Promise<void> {
  for (const timeoutHandle of scheduledCleanupTimeouts) {
    clearTimeout(timeoutHandle);
  }
  scheduledCleanupTimeouts.clear();

  await Promise.all(
    [...pendingTempUriKeys].map((tempUriKey) =>
      cleanupTempUriByKey(tempUriKey),
    ),
  );
}

function getTempMergeCleanupDelayMs(): number {
  const configuredDelay = Number(process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS);

  if (!Number.isFinite(configuredDelay)) {
    return DEFAULT_TEMP_MERGE_CLEANUP_DELAY_MS;
  }

  return Math.min(
    Math.max(configuredDelay, 0),
    MAX_TEMP_MERGE_CLEANUP_DELAY_MS,
  );
}

async function writeTempRemoteSnapshot(content: string): Promise<vscode.Uri> {
  const fileUri = vscode.Uri.file(
    path.join(os.tmpdir(), `sn-sync-merge-remote-${randomUUID()}.txt`),
  );

  await vscode.workspace.fs.writeFile(
    fileUri,
    new TextEncoder().encode(content),
  );
  return fileUri;
}

