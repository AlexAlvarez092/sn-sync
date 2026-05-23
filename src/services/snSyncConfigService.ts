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
}
