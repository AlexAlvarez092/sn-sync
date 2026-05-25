import * as vscode from "vscode";

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
}

export function createPullFileWrittenHandler(
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  indexUpdates: SnPullIndexUpdateItem[],
): (event: SnPullFileWrittenEvent) => void {
  let visibleFilesWritten = 0;

  return ({
    settingFolder,
    fileName,
    localPath,
    table,
    sysId,
    fieldName,
    baseHash,
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
  };
}
