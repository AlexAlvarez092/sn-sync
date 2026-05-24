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

const DEFAULT_SETTINGS = [
  {
    folder: "business_rules",
    table: "sys_script",
    query: "active=true",
    key: "name",
    subDirPattern: "<collection>/<when>",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "script_includes",
    table: "sys_script_include",
    query: "active=true",
    key: "api_name",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "widgets",
    table: "sp_widget",
    query: "active=true",
    key: "id",
    fields: [
      { extension: "server.js", field_name: "script" },
      { extension: "client.js", field_name: "client_script" },
      { extension: "html", field_name: "template" },
      { extension: "scss", field_name: "css" },
    ],
  },
];

suite("snSyncConfigService", () => {
  test("creates .snsyncrc with defaults", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.initialize(workspaceFolderUri);

      const rcConfigPath = getRcConfigPath(tempDir);
      await assertJsonFileEquals(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: DEFAULT_SETTINGS,
      });
    });
  });

  test("does not overwrite existing rc values", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "prod",
        application: "app-1",
        application_name: "App One",
        update_set: "us-1",
        update_set_name: "Update Set One",
        scope_update_sets: {
          x_company_app: {
            application: "app-1",
            update_set: "us-1",
          },
        },
        settings: [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      });

      await service.initialize(workspaceFolderUri);

      await assertJsonFileEquals(rcConfigPath, {
        instance: "prod",
        application: "app-1",
        application_name: "App One",
        update_set: "us-1",
        update_set_name: "Update Set One",
        scope_update_sets: {
          x_company_app: {
            application: "app-1",
            update_set: "us-1",
          },
        },
        settings: [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      });
    });
  });

  test("setInstanceName recovers from malformed rc json", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await fs.writeFile(rcConfigPath, "not-json", "utf-8");
      await service.setInstanceName(workspaceFolderUri, "recovered-instance");

      await assertJsonFileEquals(rcConfigPath, {
        instance: "recovered-instance",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: [],
      });
    });
  });

  test("setActivationSelection stores ids and keeps previous readable names when not provided", async () => {
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

      const rcConfigPath = getRcConfigPath(tempDir);
      await assertJsonFileEquals(rcConfigPath, {
        instance: "",
        application: "app-sys-id",
        application_name: "My App",
        update_set: "update-set-sys-id-2",
        update_set_name: "My Update Set",
        scope_update_sets: {},
        settings: DEFAULT_SETTINGS,
      });
    });
  });

  test("setScopeUpdateSetSelection ignores blank scope", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setScopeUpdateSetSelection(workspaceFolderUri, "   ", {
        application: "app-sys-id",
        update_set: "update-set-sys-id",
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {});
    });
  });

  test("setScopeUpdateSetSelection stores normalized values by scope", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setScopeUpdateSetSelection(
        workspaceFolderUri,
        "x_company_app",
        {
          application: " app-sys-id ",
          application_name: " My App ",
          update_set: " update-set-sys-id ",
          update_set_name: " My Update Set ",
        },
      );

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {
        x_company_app: {
          application: "app-sys-id",
          application_name: "My App",
          update_set: "update-set-sys-id",
          update_set_name: "My Update Set",
        },
      });
    });
  });

  test("setScopeUpdateSetSelection omits optional names when they are empty", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();

      await service.setScopeUpdateSetSelection(
        workspaceFolderUri,
        "x_company_app",
        {
          application: "app-sys-id",
          application_name: "   ",
          update_set: "update-set-sys-id",
          update_set_name: "   ",
        },
      );

      const rcConfigPath = getRcConfigPath(tempDir);
      await assertJsonFileEquals(rcConfigPath, {
        instance: "",
        application: "app-sys-id",
        update_set: "update-set-sys-id",
        scope_update_sets: {
          x_company_app: {
            application: "app-sys-id",
            update_set: "update-set-sys-id",
          },
        },
        settings: DEFAULT_SETTINGS,
      });
    });
  });

  test("replaceScopeUpdateSetSelections trims scope keys and values", async () => {
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

  test("replaceScopeUpdateSetSelections preserves optional names", async () => {
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

  test("getScopeUpdateSetSelections falls back to empty object when field is invalid", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "dev",
        application: "app",
        update_set: "us",
        scope_update_sets: "invalid",
        settings: [],
      });

      const selections =
        await service.getScopeUpdateSetSelections(workspaceFolderUri);

      assert.deepStrictEqual(selections, {});
    });
  });

  test("normalizes missing scalar fields when reading rc config", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
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

      await assertJsonFileEquals(rcConfigPath, {
        instance: "",
        application: "app-selected",
        update_set: "us-selected",
        scope_update_sets: {
          global: {
            application: "global",
            update_set: "us-global",
          },
        },
        settings: [],
      });
    });
  });

  test("normalizes mixed scope entries and top-level names", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
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
        settings: [],
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

      await assertJsonFileEquals(rcConfigPath, {
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
        settings: [],
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

  test("clearActivationSelections preserves instance and settings", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "dev-instance",
        application: "app-1",
        application_name: "App One",
        update_set: "us-1",
        update_set_name: "Update Set One",
        scope_update_sets: {
          x_app: {
            application: "app-1",
            update_set: "us-1",
          },
        },
        settings: [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      });

      await service.clearActivationSelections(workspaceFolderUri);

      await assertJsonFileEquals(rcConfigPath, {
        instance: "dev-instance",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      });
    });
  });

  test("getSyncSettings parses normalized settings array", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: [
          {
            folder: " business_rules ",
            table: " sys_script ",
            query: " active=true ",
            key: " name ",
            subDirPattern: " <collection>/<when> ",
            fields: [
              {
                extension: " js ",
                field_name: " script ",
              },
            ],
          },
        ],
      });

      const settings = await service.getSyncSettings(workspaceFolderUri);

      assert.deepStrictEqual(settings, [
        {
          folder: "business_rules",
          table: "sys_script",
          query: "active=true",
          key: "name",
          subDirPattern: "<collection>/<when>",
          fields: [
            {
              extension: "js",
              field_name: "script",
            },
          ],
        },
      ]);
    });
  });

  test("getSyncSettings ignores invalid settings and malformed json", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        settings: [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: "not-array",
          },
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: 123,
            key: "name",
            fields: [
              {
                extension: "",
                field_name: "script",
              },
              {
                extension: "js",
                field_name: "script",
              },
            ],
          },
          {
            folder: "",
            table: "sys_script",
            query: "",
            key: "name",
            fields: [],
          },
        ],
      });

      const settings = await service.getSyncSettings(workspaceFolderUri);

      assert.deepStrictEqual(settings, [
        {
          folder: "security_rules",
          table: "sys_security_acl",
          query: "",
          key: "name",
          fields: [
            {
              extension: "js",
              field_name: "script",
            },
          ],
        },
      ]);

      await fs.writeFile(rcConfigPath, "not-json", "utf-8");
      const malformedSettings =
        await service.getSyncSettings(workspaceFolderUri);
      assert.deepStrictEqual(malformedSettings, []);
    });
  });

  test("getSyncSettings returns empty when settings is not an array", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: {},
      });

      const settings = await service.getSyncSettings(workspaceFolderUri);
      assert.deepStrictEqual(settings, []);
    });
  });

  test("getPreferences uses vscode settings defaults when rc does not override them", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);
      const originalGetConfiguration = vscode.workspace.getConfiguration;

      await writeJsonFile(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: [],
      });

      (vscode.workspace.getConfiguration as unknown as (
        section?: string,
        scope?: vscode.ConfigurationScope | null,
      ) => vscode.WorkspaceConfiguration) = () =>
        ({
          get: <T>(key: string) => {
            if (key === "rootDir") {
              return "app" as T;
            }

            if (key === "pull.clearBeforePull") {
              return "delete" as T;
            }

            return undefined as T;
          },
        }) as unknown as vscode.WorkspaceConfiguration;

      try {
        const preferences = await service.getPreferences(workspaceFolderUri);

        assert.deepStrictEqual(preferences, {
          rootDir: "app",
          pull: {
            clearBeforePull: "delete",
          },
        });
      } finally {
        (vscode.workspace
          .getConfiguration as unknown as typeof vscode.workspace.getConfiguration) =
          originalGetConfiguration;
      }
    });
  });

  test("getPreferences ignores rc preferences and uses vscode settings", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);
      const originalGetConfiguration = vscode.workspace.getConfiguration;

      await writeJsonFile(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        preferences: {
          rootDir: " packages ",
          pull: {
            clearBeforePull: "keep",
          },
        },
        settings: [],
      });

      (vscode.workspace.getConfiguration as unknown as (
        section?: string,
        scope?: vscode.ConfigurationScope | null,
      ) => vscode.WorkspaceConfiguration) = () =>
        ({
          get: <T>(key: string) => {
            if (key === "rootDir") {
              return "src-global" as T;
            }

            if (key === "pull.clearBeforePull") {
              return "invalid" as T;
            }

            return undefined as T;
          },
        }) as unknown as vscode.WorkspaceConfiguration;

      try {
        const preferences = await service.getPreferences(workspaceFolderUri);

        assert.deepStrictEqual(preferences, {
          rootDir: "src-global",
          pull: {
            clearBeforePull: "ask",
          },
        });
      } finally {
        (vscode.workspace
          .getConfiguration as unknown as typeof vscode.workspace.getConfiguration) =
          originalGetConfiguration;
      }
    });
  });

  test("getPreferences falls back to built-in defaults when rc and vscode settings are missing", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);
      const originalGetConfiguration = vscode.workspace.getConfiguration;

      await writeJsonFile(rcConfigPath, {
        instance: "",
        application: "",
        update_set: "",
        scope_update_sets: {},
        settings: [],
      });

      (vscode.workspace.getConfiguration as unknown as (
        section?: string,
        scope?: vscode.ConfigurationScope | null,
      ) => vscode.WorkspaceConfiguration) = () =>
        ({
          get: <T>() => undefined as T,
        }) as unknown as vscode.WorkspaceConfiguration;

      try {
        const preferences = await service.getPreferences(workspaceFolderUri);

        assert.deepStrictEqual(preferences, {
          rootDir: "src",
          pull: {
            clearBeforePull: "ask",
          },
        });
      } finally {
        (vscode.workspace
          .getConfiguration as unknown as typeof vscode.workspace.getConfiguration) =
          originalGetConfiguration;
      }
    });
  });
});

function getRcConfigPath(tempDir: string): string {
  return path.join(tempDir, SN_SYNC_PATHS.RC_FILE);
}
