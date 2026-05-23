import * as vscode from "vscode";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";

export interface SnSyncPaths {
  snSyncFolderUri: vscode.Uri;
  instanceConfigUri: vscode.Uri;
  extensionConfigUri: vscode.Uri;
}

export function getSnSyncPaths(workspaceFolderUri: vscode.Uri): SnSyncPaths {
  const snSyncFolderUri = vscode.Uri.joinPath(
    workspaceFolderUri,
    SN_SYNC_PATHS.ROOT_FOLDER,
  );

  return {
    snSyncFolderUri,
    instanceConfigUri: vscode.Uri.joinPath(
      snSyncFolderUri,
      SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
    ),
    extensionConfigUri: vscode.Uri.joinPath(
      snSyncFolderUri,
      SN_SYNC_PATHS.EXTENSION_CONFIG_FILE,
    ),
  };
}
