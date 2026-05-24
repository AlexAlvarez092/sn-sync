import * as vscode from "vscode";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface FolderClearRuntime {
  readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
  delete(
    uri: vscode.Uri,
    options: { recursive: boolean; useTrash: boolean },
  ): Thenable<void>;
  createDirectory?(uri: vscode.Uri): Thenable<void>;
}

export async function ensureDirectoryExists(
  runtime: Pick<FolderClearRuntime, "createDirectory">,
  directoryUri: vscode.Uri,
): Promise<void> {
  if (runtime.createDirectory) {
    await runtime.createDirectory(directoryUri);
    return;
  }

  await vscode.workspace.fs.createDirectory(directoryUri);
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
