export type SnPullClearBeforePull = "ask" | "delete" | "keep";

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
}

export interface ExtensionConfig {
  settings?: ExtensionConfigSetting[];
}
