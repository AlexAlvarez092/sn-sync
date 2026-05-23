import * as vscode from "vscode";
import {
  type ExtensionConfig,
  type InstanceConfig,
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
      } satisfies InstanceConfig),
      ensureJsonFile(extensionConfigUri, {
        setting: [],
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

  private async readInstanceConfig(
    instanceConfigUri: vscode.Uri,
  ): Promise<InstanceConfig> {
    try {
      const fileContent = await vscode.workspace.fs.readFile(instanceConfigUri);
      return JSON.parse(
        new TextDecoder().decode(fileContent),
      ) as InstanceConfig;
    } catch {
      return { instance: "" };
    }
  }
}
