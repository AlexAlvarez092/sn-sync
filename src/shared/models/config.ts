export interface ScopeUpdateSetSelection {
  application: string;
  application_name?: string;
  update_set: string;
  update_set_name?: string;
}

export type SnPullClearBeforePull = "ask" | "delete" | "keep";

export interface SnSyncPullPreferences {
  clearBeforePull?: SnPullClearBeforePull;
}

export interface SnSyncPreferences {
  rootDir?: string;
  pull?: SnSyncPullPreferences;
}

export interface SnSyncResolvedPreferences {
  rootDir: string;
  pull: {
    clearBeforePull: SnPullClearBeforePull;
  };
}

export interface ExtensionConfigField {
  extension: string;
  field_name: string;
}

export interface ExtensionConfigSetting {
  folder: string;
  table: string;
  query: string;
  key: string;
  fields: ExtensionConfigField[];
  subDirPattern?: string;
}

export interface InstanceConfig {
  instance: string;
  application: string;
  application_name?: string;
  update_set: string;
  update_set_name?: string;
  scope_update_sets: Record<string, ScopeUpdateSetSelection>;
}

export interface ExtensionConfig {
  settings?: ExtensionConfigSetting[];
}
