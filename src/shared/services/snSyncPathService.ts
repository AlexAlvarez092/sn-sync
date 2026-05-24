import * as vscode from "vscode";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";

export interface SnSyncPaths {
  rcConfigUri: vscode.Uri;
}

export function getSnSyncPaths(workspaceFolderUri: vscode.Uri): SnSyncPaths {
  return {
    rcConfigUri: vscode.Uri.joinPath(workspaceFolderUri, SN_SYNC_PATHS.RC_FILE),
  };
}
