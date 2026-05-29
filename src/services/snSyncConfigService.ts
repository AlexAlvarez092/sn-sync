import * as vscode from "vscode";
import {
  type ExtensionConfigField,
  type ExtensionConfigSetting,
  type InstanceConfig,
  type SnPullClearBeforePull,
  type SnSyncResolvedPreferences,
} from "@shared/models/config.js";
import { SN_SYNC_DEFAULTS } from "@shared/constants/snSyncConstants.js";
import { ensureJsonFile } from "@shared/services/jsonFileService.js";
import { getSnSyncPaths } from "@shared/services/snSyncPathService.js";
import { normalizeOptionalString } from "@shared/services/snStringService.js";

interface SnSyncRcConfig extends InstanceConfig {
  settings: ExtensionConfigSetting[];
}

export class SnSyncConfigService {
  public async initialize(workspaceFolderUri: vscode.Uri): Promise<void> {
    const { rcConfigUri } = getSnSyncPaths(workspaceFolderUri);

    await ensureJsonFile(rcConfigUri, {
      instance: "",
      settings: SN_SYNC_DEFAULTS.SETTINGS,
    } satisfies SnSyncRcConfig);

    // Enforce security policy by stripping legacy auth fields from rc files.
    const sanitizedConfig = await this.readConfig(rcConfigUri);
    await this.writeConfig(rcConfigUri, sanitizedConfig);
  }

  public async getPreferences(
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnSyncResolvedPreferences> {
    await this.initialize(workspaceFolderUri);

    const vscodeConfig = vscode.workspace.getConfiguration(
      "sn-sync",
      workspaceFolderUri,
    );

    return {
      rootDir:
        this.normalizeString(vscodeConfig.get<string>("rootDir")) ??
        SN_SYNC_DEFAULTS.ROOT_DIR,
      pull: {
        clearBeforePull:
          this.normalizePullClearBeforePull(
            vscodeConfig.get<string>("pull.clearBeforePull"),
          ) ?? SN_SYNC_DEFAULTS.CLEAR_BEFORE_PULL,
      },
      auth: {
        allowCustomHosts:
          vscodeConfig.get<boolean>("auth.allowCustomHosts") ??
          SN_SYNC_DEFAULTS.AUTH_ALLOW_CUSTOM_HOSTS,
        customHosts:
          this.normalizeCustomHosts(
            vscodeConfig.get<string[]>("auth.customHosts"),
          ) ?? SN_SYNC_DEFAULTS.AUTH_CUSTOM_HOSTS,
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
    return normalizeOptionalString(value, allowEmpty);
  }

  private normalizeCustomHosts(
    value: string[] | undefined,
  ): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((host) => this.normalizeString(host))
      .filter((host): host is string => Boolean(host))
      .map((host) => host.toLowerCase());
  }
}
