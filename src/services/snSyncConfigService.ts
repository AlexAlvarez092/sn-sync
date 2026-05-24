import * as vscode from "vscode";
import {
  type ExtensionConfigField,
  type ExtensionConfigSetting,
  type InstanceConfig,
  type SnPullClearBeforePull,
  type SnSyncPreferences,
  type SnSyncResolvedPreferences,
  type ScopeUpdateSetSelection,
} from "@shared/models/config.js";
import { ensureJsonFile } from "@shared/services/jsonFileService.js";
import { getSnSyncPaths } from "@shared/services/snSyncPathService.js";

interface SnSyncRcConfig extends InstanceConfig {
  preferences?: SnSyncPreferences;
  settings: ExtensionConfigSetting[];
}

const DEFAULT_ROOT_DIR = "src";
const DEFAULT_CLEAR_BEFORE_PULL: SnPullClearBeforePull = "ask";

export class SnSyncConfigService {
  public async initialize(workspaceFolderUri: vscode.Uri): Promise<void> {
    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);

    await ensureJsonFile(rcConfigUri, {
      instance: "",
      application: "",
      update_set: "",
      scope_update_sets: {},
      preferences: {},
      settings: [],
    } satisfies SnSyncRcConfig);
  }

  public async getPreferences(
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnSyncResolvedPreferences> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const vscodeConfig = vscode.workspace.getConfiguration(
      "sn-sync",
      workspaceFolderUri,
    );

    return {
      rootDir:
        this.normalizeString(config.preferences?.rootDir) ??
        this.normalizeString(vscodeConfig.get<string>("rootDir")) ??
        DEFAULT_ROOT_DIR,
      pull: {
        clearBeforePull:
          this.normalizePullClearBeforePull(
            config.preferences?.pull?.clearBeforePull,
          ) ??
          this.normalizePullClearBeforePull(
            vscodeConfig.get<string>("pull.clearBeforePull"),
          ) ??
          DEFAULT_CLEAR_BEFORE_PULL,
      },
    };
  }

  public async setInstanceName(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const updatedConfig: SnSyncRcConfig = {
      ...config,
      instance: instanceName,
    };

    await this.writeConfig(rcConfigUri, updatedConfig);
  }

  public async setActivationSelection(
    workspaceFolderUri: vscode.Uri,
    applicationSysId: string,
    updateSetSysId: string,
    applicationName?: string,
    updateSetName?: string,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const updatedConfig: SnSyncRcConfig = {
      ...config,
      application: applicationSysId.trim(),
      update_set: updateSetSysId.trim(),
      ...(applicationName?.trim()
        ? { application_name: applicationName.trim() }
        : config.application_name
          ? { application_name: config.application_name }
          : {}),
      ...(updateSetName?.trim()
        ? { update_set_name: updateSetName.trim() }
        : updateSetSysId.trim() && config.update_set_name
          ? { update_set_name: config.update_set_name }
          : {}),
    };

    await this.writeConfig(rcConfigUri, updatedConfig);
  }

  public async setScopeUpdateSetSelection(
    workspaceFolderUri: vscode.Uri,
    scope: string,
    selection: ScopeUpdateSetSelection,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const normalizedScope = scope.trim();
    if (!normalizedScope) {
      return;
    }

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const updatedConfig: SnSyncRcConfig = {
      ...config,
      application: selection.application.trim(),
      update_set: selection.update_set.trim(),
      ...(selection.application_name?.trim()
        ? { application_name: selection.application_name.trim() }
        : {}),
      ...(selection.update_set_name?.trim()
        ? { update_set_name: selection.update_set_name.trim() }
        : {}),
      scope_update_sets: {
        ...config.scope_update_sets,
        [normalizedScope]: {
          application: selection.application.trim(),
          update_set: selection.update_set.trim(),
          ...(selection.application_name?.trim()
            ? { application_name: selection.application_name.trim() }
            : {}),
          ...(selection.update_set_name?.trim()
            ? { update_set_name: selection.update_set_name.trim() }
            : {}),
        },
      },
    };

    await this.writeConfig(rcConfigUri, updatedConfig);
  }

  public async getScopeUpdateSetSelections(
    workspaceFolderUri: vscode.Uri,
  ): Promise<Record<string, ScopeUpdateSetSelection>> {
    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    return config.scope_update_sets;
  }

  public async replaceScopeUpdateSetSelections(
    workspaceFolderUri: vscode.Uri,
    selections: Record<string, ScopeUpdateSetSelection>,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const normalized: Record<string, ScopeUpdateSetSelection> = {};

    for (const [scope, selection] of Object.entries(selections)) {
      const normalizedScope = scope.trim();
      if (!normalizedScope) {
        continue;
      }

      normalized[normalizedScope] = {
        application: selection.application.trim(),
        update_set: selection.update_set.trim(),
        ...(selection.application_name?.trim()
          ? { application_name: selection.application_name.trim() }
          : {}),
        ...(selection.update_set_name?.trim()
          ? { update_set_name: selection.update_set_name.trim() }
          : {}),
      };
    }

    const updatedConfig: SnSyncRcConfig = {
      ...config,
      scope_update_sets: normalized,
    };

    await this.writeConfig(rcConfigUri, updatedConfig);
  }

  public async clearActivationSelections(
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const updatedConfig: SnSyncRcConfig = {
      instance: config.instance,
      application: "",
      update_set: "",
      scope_update_sets: {},
      preferences: config.preferences,
      settings: config.settings,
    };

    await this.writeConfig(rcConfigUri, updatedConfig);
  }

  public async getInstanceName(
    workspaceFolderUri: vscode.Uri,
  ): Promise<string | undefined> {
    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);
    const instanceName = config.instance.trim();

    if (!instanceName) {
      return undefined;
    }

    return instanceName;
  }

  public async getSyncSettings(
    workspaceFolderUri: vscode.Uri,
  ): Promise<ExtensionConfigSetting[]> {
    await this.initialize(workspaceFolderUri);

    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readConfig(rcConfigUri);

    return config.settings
      .map((setting) => this.normalizeSyncSetting(setting))
      .filter((setting): setting is ExtensionConfigSetting => Boolean(setting));
  }

  private async readConfig(rcConfigUri: vscode.Uri): Promise<SnSyncRcConfig> {
    try {
      const fileContent = await vscode.workspace.fs.readFile(rcConfigUri);
      const parsed = JSON.parse(
        new TextDecoder().decode(fileContent),
      ) as Partial<SnSyncRcConfig>;

      return {
        instance: parsed.instance ?? "",
        application: parsed.application ?? "",
        update_set: parsed.update_set ?? "",
        ...(parsed.application_name
          ? { application_name: parsed.application_name }
          : {}),
        ...(parsed.update_set_name
          ? { update_set_name: parsed.update_set_name }
          : {}),
        scope_update_sets:
          typeof parsed.scope_update_sets === "object" &&
          parsed.scope_update_sets !== null
            ? Object.fromEntries(
                Object.entries(parsed.scope_update_sets).map(
                  ([scope, selection]) => {
                    const typedSelection =
                      selection as Partial<ScopeUpdateSetSelection>;

                    return [
                      scope,
                      {
                        application: typedSelection.application ?? "",
                        update_set: typedSelection.update_set ?? "",
                        ...(typedSelection.application_name
                          ? {
                              application_name: typedSelection.application_name,
                            }
                          : {}),
                        ...(typedSelection.update_set_name
                          ? { update_set_name: typedSelection.update_set_name }
                          : {}),
                      } satisfies ScopeUpdateSetSelection,
                    ] as const;
                  },
                ),
              )
            : {},
        preferences: this.normalizePreferences(parsed.preferences),
        settings: Array.isArray(parsed.settings)
          ? parsed.settings
              .map((setting) =>
                this.normalizeSyncSetting(setting as ExtensionConfigSetting),
              )
              .filter((setting): setting is ExtensionConfigSetting =>
                Boolean(setting),
              )
          : [],
      };
    } catch {
      return {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        preferences: {},
        settings: [],
      };
    }
  }

  private async writeConfig(
    rcConfigUri: vscode.Uri,
    config: SnSyncRcConfig,
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(
      rcConfigUri,
      new TextEncoder().encode(JSON.stringify(config, null, 2)),
    );
  }

  private normalizeSyncSetting(
    setting: ExtensionConfigSetting,
  ): ExtensionConfigSetting | undefined {
    const folder = this.normalizeString(setting.folder);
    const table = this.normalizeString(setting.table);
    const query = this.normalizeString(setting.query, true);
    const key = this.normalizeString(setting.key);
    const fields = this.normalizeSyncFields(setting.fields);
    const subDirPattern = this.normalizeString(setting.subDirPattern, true);

    if (!folder || !table || key === undefined || fields.length === 0) {
      return undefined;
    }

    return {
      folder,
      table,
      query: query ?? "",
      key,
      fields,
      ...(subDirPattern ? { subDirPattern } : {}),
    };
  }

  private normalizeSyncFields(
    fields: ExtensionConfigField[],
  ): ExtensionConfigField[] {
    if (!Array.isArray(fields)) {
      return [];
    }

    return fields
      .map((field) => {
        const extension = this.normalizeString(field.extension);
        const fieldName = this.normalizeString(field.field_name);

        if (!extension || !fieldName) {
          return undefined;
        }

        return {
          extension,
          field_name: fieldName,
        } satisfies ExtensionConfigField;
      })
      .filter((field): field is ExtensionConfigField => Boolean(field));
  }

  private normalizePreferences(
    preferences: SnSyncPreferences | undefined,
  ): SnSyncPreferences {
    if (!preferences || typeof preferences !== "object") {
      return {};
    }

    const rootDir = this.normalizeString(preferences.rootDir);
    const clearBeforePull = this.normalizePullClearBeforePull(
      preferences.pull?.clearBeforePull,
    );

    return {
      ...(rootDir ? { rootDir } : {}),
      ...(clearBeforePull ? { pull: { clearBeforePull } } : {}),
    };
  }

  private normalizePullClearBeforePull(
    value: string | undefined,
  ): SnPullClearBeforePull | undefined {
    if (value === "ask" || value === "delete" || value === "keep") {
      return value;
    }

    return undefined;
  }

  private normalizeString(
    value: string | undefined,
    allowEmpty = false,
  ): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.trim();
    if (!allowEmpty && !normalized) {
      return undefined;
    }

    return normalized;
  }
}
