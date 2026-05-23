import * as vscode from "vscode";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface FolderClearRuntime {
  readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
  delete(
    uri: vscode.Uri,
    options: { recursive: boolean; useTrash: boolean },
  ): Thenable<void>;
}

export async function clearDirectory(
  runtime: FolderClearRuntime,
  directoryUri: vscode.Uri,
): Promise<void> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await runtime.readDirectory(directoryUri);
  } catch (error) {
    if (getErrorMessage(error).includes("FileNotFound")) {
      return;
    }

    throw error;
  }

  for (const [entryName] of entries) {
    await runtime.delete(vscode.Uri.joinPath(directoryUri, entryName), {
      recursive: true,
      useTrash: false,
    });
  }
}
