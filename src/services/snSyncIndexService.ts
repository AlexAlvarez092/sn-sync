import * as path from "node:path";
import * as vscode from "vscode";
import { SN_SYNC_STORAGE_KEYS } from "@shared/constants/snSyncConstants.js";
import {
  type SnPullIndexUpdate,
  type SnSyncIndexEntry,
  type SnSyncIndexState,
} from "@shared/models/syncIndex.js";
import { hashText } from "@shared/services/hashService.js";

export interface SnSyncIndexCandidate {
  entry: SnSyncIndexEntry;
  localContent: string;
  localHash: string;
}

export interface SnSyncIndexServiceApi {
  recordPullFiles(
    workspaceFolderUri: vscode.Uri,
    updates: SnPullIndexUpdate[],
  ): Promise<void>;
  findEntryByLocalPath(
    workspaceFolderUri: vscode.Uri,
    localPath: string,
  ): Promise<SnSyncIndexEntry | undefined>;
  toWorkspaceRelativePath(
    workspaceFolderUri: vscode.Uri,
    fileUri: vscode.Uri,
  ): string;
  getModifiedCandidates(
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnSyncIndexCandidate[]>;
  updateBaseHashes(
    workspaceFolderUri: vscode.Uri,
    updates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }>,
  ): Promise<void>;
}

export class SnSyncIndexService implements SnSyncIndexServiceApi {
  public constructor(
    private readonly state: vscode.Memento,
    private readonly fsApi: typeof vscode.workspace.fs = vscode.workspace.fs,
  ) {}

  public async recordPullFiles(
    workspaceFolderUri: vscode.Uri,
    updates: SnPullIndexUpdate[],
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const state = this.getState(workspaceFolderUri);
    const now = new Date().toISOString();

    for (const update of updates) {
      const key = this.buildEntryKey(update);
      state.entries[key] = {
        localPath: update.localPath,
        table: update.table,
        sysId: update.sysId,
        fieldName: update.fieldName,
        baseHash: update.baseHash,
        updatedAt: now,
      };
    }

    await this.saveState(workspaceFolderUri, state);
  }

  public async findEntryByLocalPath(
    workspaceFolderUri: vscode.Uri,
    localPath: string,
  ): Promise<SnSyncIndexEntry | undefined> {
    const normalizedPath = this.normalizeLocalPath(localPath);
    const state = this.getState(workspaceFolderUri);

    return Object.values(state.entries).find(
      (entry) => entry.localPath === normalizedPath,
    );
  }

  public async getModifiedCandidates(
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnSyncIndexCandidate[]> {
    const state = this.getState(workspaceFolderUri);
    const candidates: SnSyncIndexCandidate[] = [];

    for (const entry of Object.values(state.entries)) {
      const localUri = vscode.Uri.joinPath(workspaceFolderUri, entry.localPath);

      let fileContent: Uint8Array;
      try {
        fileContent = await this.fsApi.readFile(localUri);
      } catch {
        continue;
      }

      const localContent = new TextDecoder().decode(fileContent);
      const localHash = hashText(localContent);

      if (localHash === entry.baseHash) {
        continue;
      }

      candidates.push({
        entry,
        localContent,
        localHash,
      });
    }

    return candidates;
  }

  public async updateBaseHashes(
    workspaceFolderUri: vscode.Uri,
    updates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }>,
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const state = this.getState(workspaceFolderUri);
    const now = new Date().toISOString();

    for (const update of updates) {
      const key = this.buildEntryKey(update);
      const existing = state.entries[key];
      if (!existing) {
        continue;
      }

      state.entries[key] = {
        ...existing,
        baseHash: update.baseHash,
        updatedAt: now,
      };
    }

    await this.saveState(workspaceFolderUri, state);
  }

  public toWorkspaceRelativePath(
    workspaceFolderUri: vscode.Uri,
    fileUri: vscode.Uri,
  ): string {
    return this.normalizeLocalPath(
      path.relative(workspaceFolderUri.fsPath, fileUri.fsPath),
    );
  }

  private getStorageKey(workspaceFolderUri: vscode.Uri): string {
    return `${SN_SYNC_STORAGE_KEYS.SYNC_INDEX_PREFIX}:${workspaceFolderUri.toString()}`;
  }

  private getState(workspaceFolderUri: vscode.Uri): SnSyncIndexState {
    const raw = this.state.get<SnSyncIndexState>(
      this.getStorageKey(workspaceFolderUri),
    );

    if (!raw || raw.version !== 1 || typeof raw.entries !== "object") {
      return {
        version: 1,
        entries: {},
      };
    }

    return raw;
  }

  private async saveState(
    workspaceFolderUri: vscode.Uri,
    state: SnSyncIndexState,
  ): Promise<void> {
    await this.state.update(this.getStorageKey(workspaceFolderUri), state);
  }

  private buildEntryKey(update: {
    localPath: string;
    table: string;
    sysId: string;
    fieldName: string;
  }): string {
    return [
      this.normalizeLocalPath(update.localPath),
      update.table,
      update.sysId,
      update.fieldName,
    ].join("::");
  }

  private normalizeLocalPath(localPath: string): string {
    return localPath.replace(/\\/g, "/").trim();
  }
}
