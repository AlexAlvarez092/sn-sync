import * as assert from "assert";
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

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
      });
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

      await writeJsonFile(instanceConfigPath, {
        instance: "prod",
        application: "app-1",
        update_set: "us-1",
        scope_update_sets: {
          x_company_app: {
            application: "app-1",
            update_set: "us-1",
          },
        },
      });
      await writeJsonFile(extensionConfigPath, {
        setting: [{ enabled: true }],
      });

      await service.initialize(workspaceFolderUri);

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "prod",
        application: "app-1",
        update_set: "us-1",
        scope_update_sets: {
          x_company_app: {
            application: "app-1",
            update_set: "us-1",
          },
        },
      });
      await assertJsonFileEquals(extensionConfigPath, {
        setting: [{ enabled: true }],
      });
    });
  });

  test("setInstanceName updates existing instance value", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.initialize(workspaceFolderUri);
      await service.setInstanceName(workspaceFolderUri, "dev-instance");

      const instanceConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "dev-instance",
        application: "",
        update_set: "",
        scope_update_sets: {},
      });
    });
  });

  test("setInstanceName recovers when instance config json is invalid", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const configDir = path.join(tempDir, SN_SYNC_PATHS.ROOT_FOLDER);

      await fs.mkdir(configDir, { recursive: true });

      const instanceConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await fs.writeFile(instanceConfigPath, "not-json", "utf-8");
      await service.setInstanceName(workspaceFolderUri, "recovered-instance");

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "recovered-instance",
        application: "",
        update_set: "",
        scope_update_sets: {},
      });
    });
  });

  test("setActivationSelection stores application and update_set sys_ids", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setInstanceName(workspaceFolderUri, "dev-instance");
      await service.setActivationSelection(
        workspaceFolderUri,
        "app-sys-id",
        "update-set-sys-id",
      );

      const instanceConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "dev-instance",
        application: "app-sys-id",
        update_set: "update-set-sys-id",
        scope_update_sets: {},
      });
    });
  });

  test("setActivationSelection stores and reuses human-readable names", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setActivationSelection(
        workspaceFolderUri,
        "app-sys-id",
        "update-set-sys-id",
        "My App",
        "My Update Set",
      );

      await service.setActivationSelection(
        workspaceFolderUri,
        "app-sys-id",
        "update-set-sys-id-2",
      );

      const instanceConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "",
        application: "app-sys-id",
        application_name: "My App",
        update_set: "update-set-sys-id-2",
        update_set_name: "My Update Set",
        scope_update_sets: {},
      });
    });
  });

  test("setScopeUpdateSetSelection stores selection under scope key", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setInstanceName(workspaceFolderUri, "dev-instance");
      await service.setScopeUpdateSetSelection(
        workspaceFolderUri,
        "x_company_app",
        {
          application: "app-sys-id",
          application_name: "My App",
          update_set: "update-set-sys-id",
          update_set_name: "My Update Set",
        },
      );

      const instanceConfigPath = path.join(
        tempDir,
        SN_SYNC_PATHS.ROOT_FOLDER,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "dev-instance",
        application: "app-sys-id",
        application_name: "My App",
        update_set: "update-set-sys-id",
        update_set_name: "My Update Set",
        scope_update_sets: {
          x_company_app: {
            application: "app-sys-id",
            application_name: "My App",
            update_set: "update-set-sys-id",
            update_set_name: "My Update Set",
          },
        },
      });
    });
  });

  test("setScopeUpdateSetSelection ignores blank scope", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setInstanceName(workspaceFolderUri, "dev-instance");
      await service.setScopeUpdateSetSelection(workspaceFolderUri, "   ", {
        application: "app-sys-id",
        update_set: "update-set-sys-id",
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {});
    });
  });

  test("getScopeUpdateSetSelections returns stored scope mappings", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setScopeUpdateSetSelection(workspaceFolderUri, "global", {
        application: "global",
        update_set: "global-us",
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        global: {
          application: "global",
          update_set: "global-us",
        },
      });
    });
  });

  test("replaceScopeUpdateSetSelections keeps only provided scope mappings", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setScopeUpdateSetSelection(workspaceFolderUri, "global", {
        application: "global",
        update_set: "old-us",
      });

      await service.replaceScopeUpdateSetSelections(workspaceFolderUri, {
        x_company_app: {
          application: "app-1",
          update_set: "new-us",
        },
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        x_company_app: {
          application: "app-1",
          update_set: "new-us",
        },
      });
    });
  });

  test("replaceScopeUpdateSetSelections normalizes scope keys and values", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.replaceScopeUpdateSetSelections(workspaceFolderUri, {
        "  x_company_app  ": {
          application: "  app-1  ",
          update_set: "  us-1  ",
        },
        "   ": {
          application: "ignored",
          update_set: "ignored",
        },
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        x_company_app: {
          application: "app-1",
          update_set: "us-1",
        },
      });
    });
  });

  test("replaceScopeUpdateSetSelections persists optional names when provided", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.replaceScopeUpdateSetSelections(workspaceFolderUri, {
        x_company_app: {
          application: "app-1",
          application_name: "App One",
          update_set: "us-1",
          update_set_name: "Update Set One",
        },
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        x_company_app: {
          application: "app-1",
          application_name: "App One",
          update_set: "us-1",
          update_set_name: "Update Set One",
        },
      });
    });
  });

  test("getScopeUpdateSetSelections falls back to empty object when config field is invalid", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const configDir = path.join(tempDir, SN_SYNC_PATHS.ROOT_FOLDER);

      await fs.mkdir(configDir, { recursive: true });

      const instanceConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await writeJsonFile(instanceConfigPath, {
        instance: "dev",
        application: "app",
        update_set: "us",
        scope_update_sets: "invalid",
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {});
    });
  });

  test("normalizes missing scalar fields when reading instance config", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const configDir = path.join(tempDir, SN_SYNC_PATHS.ROOT_FOLDER);

      await fs.mkdir(configDir, { recursive: true });

      const instanceConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await writeJsonFile(instanceConfigPath, {
        scope_update_sets: {
          global: {
            application: "global",
            update_set: "us-global",
          },
        },
      });

      const instanceName = await service.getInstanceName(workspaceFolderUri);
      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.strictEqual(instanceName, undefined);
      assert.deepStrictEqual(selections, {
        global: {
          application: "global",
          update_set: "us-global",
        },
      });

      await service.setActivationSelection(
        workspaceFolderUri,
        "app-selected",
        "us-selected",
      );

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "",
        application: "app-selected",
        update_set: "us-selected",
        scope_update_sets: {
          global: {
            application: "global",
            update_set: "us-global",
          },
        },
      });
    });
  });

  test("normalizes mixed legacy scope entries and top-level names", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const configDir = path.join(tempDir, SN_SYNC_PATHS.ROOT_FOLDER);

      await fs.mkdir(configDir, { recursive: true });

      const instanceConfigPath = path.join(
        configDir,
        SN_SYNC_PATHS.INSTANCE_CONFIG_FILE,
      );

      await writeJsonFile(instanceConfigPath, {
        instance: "dev",
        application: "app-1",
        application_name: "App One",
        update_set: "us-1",
        update_set_name: "Update Set One",
        scope_update_sets: {
          x_full: {
            application: "app-1",
            application_name: "App One",
            update_set: "us-1",
            update_set_name: "Update Set One",
          },
          x_missing: {},
        },
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        x_full: {
          application: "app-1",
          application_name: "App One",
          update_set: "us-1",
          update_set_name: "Update Set One",
        },
        x_missing: {
          application: "",
          update_set: "",
        },
      });

      await service.setActivationSelection(workspaceFolderUri, "app-2", "us-2");

      await assertJsonFileEquals(instanceConfigPath, {
        instance: "dev",
        application: "app-2",
        application_name: "App One",
        update_set: "us-2",
        update_set_name: "Update Set One",
        scope_update_sets: {
          x_full: {
            application: "app-1",
            application_name: "App One",
            update_set: "us-1",
            update_set_name: "Update Set One",
          },
          x_missing: {
            application: "",
            update_set: "",
          },
        },
      });
    });
  });

  test("getInstanceName returns undefined when instance is empty", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.initialize(workspaceFolderUri);

      const instanceName = await service.getInstanceName(workspaceFolderUri);
      assert.strictEqual(instanceName, undefined);
    });
  });

  test("getInstanceName returns trimmed instance value", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setInstanceName(workspaceFolderUri, "  dev-instance  ");

      const instanceName = await service.getInstanceName(workspaceFolderUri);
      assert.strictEqual(instanceName, "dev-instance");
    });
  });
});
