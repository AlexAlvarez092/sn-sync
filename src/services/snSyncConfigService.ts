import * as vscode from "vscode";
import {
  type ExtensionConfig,
  type ExtensionConfigField,
  type ExtensionConfigSetting,
  type InstanceConfig,
  type ScopeUpdateSetSelection,
} from "@shared/models/config.js";
import { ensureJsonFile } from "@shared/services/jsonFileService.js";
import { getSnSyncPaths } from "@shared/services/snSyncPathService.js";

export class SnSyncConfigService {
  public async initialize(workspaceFolderUri: vscode.Uri): Promise<void> {
    const { snSyncFolderUri, instanceConfigUri, extensionConfigUri } =
      getSnSyncPaths(workspaceFolderUri);

    await vscode.workspace.fs.createDirectory(snSyncFolderUri);
    await Promise.all([
      ensureJsonFile(instanceConfigUri, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
      } satisfies InstanceConfig),
      ensureJsonFile(extensionConfigUri, {
        settings: [],
      } satisfies ExtensionConfig),
    ]);
  }

  public async setInstanceName(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
    const updatedConfig: InstanceConfig = {
      ...config,
      instance: instanceName,
    };

    await vscode.workspace.fs.writeFile(
      instanceConfigUri,
      new TextEncoder().encode(JSON.stringify(updatedConfig, null, 2)),
    );
  }

  public async setActivationSelection(
    workspaceFolderUri: vscode.Uri,
    applicationSysId: string,
    updateSetSysId: string,
    applicationName?: string,
    updateSetName?: string,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
    const updatedConfig: InstanceConfig = {
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

    await vscode.workspace.fs.writeFile(
      instanceConfigUri,
      new TextEncoder().encode(JSON.stringify(updatedConfig, null, 2)),
    );
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

    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
    const updatedConfig: InstanceConfig = {
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

    await vscode.workspace.fs.writeFile(
      instanceConfigUri,
      new TextEncoder().encode(JSON.stringify(updatedConfig, null, 2)),
    );
  }

  public async getScopeUpdateSetSelections(
    workspaceFolderUri: vscode.Uri,
  ): Promise<Record<string, ScopeUpdateSetSelection>> {
    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
    return config.scope_update_sets;
  }

  public async replaceScopeUpdateSetSelections(
    workspaceFolderUri: vscode.Uri,
    selections: Record<string, ScopeUpdateSetSelection>,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
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

    const updatedConfig: InstanceConfig = {
      ...config,
      scope_update_sets: normalized,
    };

    await vscode.workspace.fs.writeFile(
      instanceConfigUri,
      new TextEncoder().encode(JSON.stringify(updatedConfig, null, 2)),
    );
  }

  public async clearActivationSelections(
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    await this.initialize(workspaceFolderUri);

    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
    const updatedConfig: InstanceConfig = {
      instance: config.instance,
      application: "",
      update_set: "",
      scope_update_sets: {},
    };

    await vscode.workspace.fs.writeFile(
      instanceConfigUri,
      new TextEncoder().encode(JSON.stringify(updatedConfig, null, 2)),
    );
  }

  public async getInstanceName(
    workspaceFolderUri: vscode.Uri,
  ): Promise<string | undefined> {
    const { instanceConfigUri } = getSnSyncPaths(workspaceFolderUri);
    const config = await this.readInstanceConfig(instanceConfigUri);
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

    const { extensionConfigUri } = getSnSyncPaths(workspaceFolderUri);

    try {
      const fileContent =
        await vscode.workspace.fs.readFile(extensionConfigUri);
      const parsed = JSON.parse(
        new TextDecoder().decode(fileContent),
      ) as ExtensionConfig;

      const rawSettings = Array.isArray(parsed.settings) ? parsed.settings : [];

      return rawSettings
        .map((setting) => this.normalizeSyncSetting(setting))
        .filter((setting): setting is ExtensionConfigSetting =>
          Boolean(setting),
        );
    } catch {
      return [];
    }
  }

  private async readInstanceConfig(
    instanceConfigUri: vscode.Uri,
  ): Promise<InstanceConfig> {
    try {
      const fileContent = await vscode.workspace.fs.readFile(instanceConfigUri);
      const parsed = JSON.parse(
        new TextDecoder().decode(fileContent),
      ) as InstanceConfig;

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
      };
    } catch {
      return {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
      };
    }
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
