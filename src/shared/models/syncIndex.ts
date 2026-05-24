export interface SnSyncIndexEntry {
  localPath: string;
  table: string;
  sysId: string;
  fieldName: string;
  baseHash: string;
  updatedAt: string;
}

export interface SnSyncIndexState {
  version: 1;
  entries: Record<string, SnSyncIndexEntry>;
}

export interface SnPullIndexUpdate {
  localPath: string;
  table: string;
  sysId: string;
  fieldName: string;
  baseHash: string;
}
