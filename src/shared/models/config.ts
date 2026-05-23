export interface ScopeUpdateSetSelection {
  application: string;
  application_name?: string;
  update_set: string;
  update_set_name?: string;
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
  setting: object[];
}
