import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";
import {
  assertJsonFileEquals,
  withTempDir,
  writeJsonFile,
} from "@test/helpers/testRuntime.js";

suite("snSyncConfigService", () => {
  test("creates the sn-sync config files with defaults", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.initialize(workspaceFolderUri);

      const instanceConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );
      const extensionConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.EXTENSION_CONFIG_FILE,
      );

      await assertJsonFileEquals(instanceConfigPath, { instance: "" });
      await assertJsonFileEquals(extensionConfigPath, { setting: [] });
    });
  });

  test("does not overwrite existing config values", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const configDir = path.join(tempDir, SN_SYNC_PATHS.ROOT_FOLDER);

      await fs.mkdir(configDir, { recursive: true });

      const instanceConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );
      const extensionConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.EXTENSION_CONFIG_FILE,
      );

      await writeJsonFile(instanceConfigPath, { instance: "prod" });
      await writeJsonFile(extensionConfigPath, {
        setting: [{ enabled: true }],
      });

      await service.initialize(workspaceFolderUri);

      await assertJsonFileEquals(instanceConfigPath, { instance: "prod" });
      await assertJsonFileEquals(extensionConfigPath, {
        setting: [{ enabled: true }],
      });
    });
  });
});
