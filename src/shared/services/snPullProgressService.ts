import * as vscode from "vscode";
import type { SnBaseSnapshotStoreApi } from "@services/snBaseSnapshotStore.js";

export interface SnPullIndexUpdateItem {
  localPath: string;
  table: string;
  sysId: string;
  fieldName: string;
  baseHash: string;
}

export interface SnPullFileWrittenEvent {
  settingFolder: string;
  fileName: string;
  localPath?: string;
  table?: string;
  sysId?: string;
  fieldName?: string;
  baseHash?: string;
  content?: string;
}

export function createPullFileWrittenHandler(
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  indexUpdates: SnPullIndexUpdateItem[],
  snapshotStore?: {
    store: SnBaseSnapshotStoreApi;
    workspaceFolderUri: vscode.Uri;
  },
): (event: SnPullFileWrittenEvent) => Promise<void> {
  let visibleFilesWritten = 0;

  return async ({
    settingFolder,
    fileName,
    localPath,
    table,
    sysId,
    fieldName,
    baseHash,
    content,
  }: SnPullFileWrittenEvent) => {
    visibleFilesWritten += 1;
    progress.report({
      message: `Writing ${visibleFilesWritten} files... (${settingFolder}/${fileName})`,
    });

    if (!sysId || !localPath || !table || !fieldName || !baseHash) {
      return;
    }

    indexUpdates.push({
      localPath,
      table,
      sysId,
      fieldName,
      baseHash,
    });

    if (snapshotStore && content !== undefined) {
      await snapshotStore.store.writeSnapshot(
        snapshotStore.workspaceFolderUri,
        baseHash,
        content,
      );
    }
  };
}
