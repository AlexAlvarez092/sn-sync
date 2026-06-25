import * as vscode from "vscode";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";

export interface SnBaseSnapshotStoreApi {
  writeSnapshot(
    workspaceFolderUri: vscode.Uri,
    hash: string,
    content: string,
  ): Promise<void>;
  readSnapshot(
    workspaceFolderUri: vscode.Uri,
    hash: string,
  ): Promise<string | null>;
  clearAll(workspaceFolderUri: vscode.Uri): Promise<void>;
}

export class SnBaseSnapshotStore implements SnBaseSnapshotStoreApi {
  public constructor(
    private readonly fsApi: typeof vscode.workspace.fs = vscode.workspace.fs,
  ) {}

  public async writeSnapshot(
    workspaceFolderUri: vscode.Uri,
    hash: string,
    content: string,
  ): Promise<void> {
    const fileUri = this.resolveSnapshotUri(workspaceFolderUri, hash);
    try {
      await this.fsApi.stat(fileUri);
      // File already exists — same hash means same content, no write needed.
    } catch (err) {
      if (
        !(err instanceof vscode.FileSystemError) ||
        err.code !== "FileNotFound"
      ) {
        throw err;
      }
      await this.fsApi.writeFile(
        fileUri,
        new TextEncoder().encode(content),
      );
    }
  }

  public async readSnapshot(
    workspaceFolderUri: vscode.Uri,
    hash: string,
  ): Promise<string | null> {
    const fileUri = this.resolveSnapshotUri(workspaceFolderUri, hash);
    try {
      const bytes = await this.fsApi.readFile(fileUri);
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  }

  public async clearAll(workspaceFolderUri: vscode.Uri): Promise<void> {
    const dirUri = this.resolveStoreDir(workspaceFolderUri);
    try {
      await this.fsApi.delete(dirUri, { recursive: true });
    } catch {
      // Directory does not exist — nothing to clear.
    }
  }

  private resolveStoreDir(workspaceFolderUri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(
      workspaceFolderUri,
      SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
    );
  }

  private resolveSnapshotUri(
    workspaceFolderUri: vscode.Uri,
    hash: string,
  ): vscode.Uri {
    // Strip the "sha256:" prefix so the filename is valid on Windows (where ":"
    // is the Alternate Data Stream separator and cannot appear in a filename).
    const safeHash = hash.replace(/^[^:]+:/, "");
    return vscode.Uri.joinPath(
      workspaceFolderUri,
      SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
      safeHash,
    );
  }
}
