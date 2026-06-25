import * as vscode from "vscode";
import { SN_SYNC_PUSH_CONFLICT_UI } from "@shared/constants/snSyncConstants.js";

export interface SnPushConflictCandidate {
  localPath: string;
  localContent: string;
}

export interface SnPushConflictResolverInput {
  candidate: SnPushConflictCandidate;
}

export type SnPushConflictDecision =
  | {
      kind: "overwriteRemote";
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
  discarded: number;
  skipped: number;
}

export async function resolvePushConflictInteractive({
  candidate,
}: SnPushConflictResolverInput): Promise<SnPushConflictDecision> {
  const action = await vscode.window.showQuickPick(
    [
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.OVERWRITE_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.OVERWRITE_DESCRIPTION,
        value: "overwriteRemote" as const,
      },
      {
        label: SN_SYNC_PUSH_CONFLICT_UI.DISCARD_LABEL,
        description: SN_SYNC_PUSH_CONFLICT_UI.DISCARD_DESCRIPTION,
        value: "discardLocal" as const,
      },
    ],
    {
      title: `${SN_SYNC_PUSH_CONFLICT_UI.PICK_TITLE_PREFIX} ${candidate.localPath}`,
      placeHolder: SN_SYNC_PUSH_CONFLICT_UI.PICK_PLACEHOLDER,
      ignoreFocusOut: true,
    },
  );

  if (!action) {
    return { kind: "skip" };
  }

  if (action.value === "overwriteRemote") {
    return { kind: "overwriteRemote" };
  }

  const confirm = await vscode.window.showWarningMessage(
    `${SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_PREFIX} ${candidate.localPath}?`,
    { modal: true },
    SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_ACTION,
  );
  return confirm === SN_SYNC_PUSH_CONFLICT_UI.DISCARD_CONFIRM_ACTION
    ? { kind: "discardLocal" }
    : { kind: "skip" };
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

  return ` Conflicts: ${stats.conflicts}. Overwrite: ${stats.overwrite}. Discarded: ${stats.discarded}. Skipped: ${stats.skipped}.`;
}

export function formatUploadedFilesCount(uploadedCount: number): string {
  const suffix = uploadedCount === 1 ? "file" : "files";
  return `${uploadedCount} ${suffix} uploaded.`;
}

