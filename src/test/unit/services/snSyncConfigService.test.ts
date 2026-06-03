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
    folder: "client_scripts",
    table: "sys_script_client",
    query: "active=true",
    key: "name",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "ui_actions",
    table: "sys_ui_action",
    query: "active=true",
    key: "action_name",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "acl_scripts",
    table: "sys_security_acl",
    query: "active=true^operation!=read",
    key: "name",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "scheduled_jobs",
    table: "sysauto_script",
    query: "active=true",
    key: "name",
    fields: [{ extension: "js", field_name: "script" }],
  },
  {
    folder: "script_actions",
    table: "sysevent_script_action",
    query: "active=true",
    key: "name",
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

  test("initialize strips legacy auth fields from rc config", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "dev",
        instanceUrl: "https://dev1.service-now.com",
        auth: {
          bearer: "token123",
          userToken: "token-user",
          cookie: "JSESSIONID=abc",
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
        instance: "dev",
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

  test("getSyncSettings parses normalized settings array", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const rcConfigPath = getRcConfigPath(tempDir);

      await writeJsonFile(rcConfigPath, {
        instance: "",
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
          auth: {
            allowCustomHosts: false,
            customHosts: [],
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
          auth: {
            allowCustomHosts: false,
            customHosts: [],
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
          auth: {
            allowCustomHosts: false,
            customHosts: [],
          },
        });
      } finally {
        (vscode.workspace
          .getConfiguration as unknown as typeof vscode.workspace.getConfiguration) =
          originalGetConfiguration;
      }
    });
  });

  test("getPreferences resolves auth host policy from vscode settings", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const workspaceFolderUri = vscode.Uri.file(tempDir);
      const service = new SnSyncConfigService();
      const originalGetConfiguration = vscode.workspace.getConfiguration;

      (vscode.workspace.getConfiguration as unknown as (
        section?: string,
        scope?: vscode.ConfigurationScope | null,
      ) => vscode.WorkspaceConfiguration) = () =>
        ({
          get: <T>(key: string) => {
            if (key === "auth.allowCustomHosts") {
              return true as T;
            }

            if (key === "auth.customHosts") {
              return [" SN.EXAMPLE.NET ", "", "internal.example"] as T;
            }

            return undefined as T;
          },
        }) as unknown as vscode.WorkspaceConfiguration;

      try {
        const preferences = await service.getPreferences(workspaceFolderUri);

        assert.deepStrictEqual(preferences.auth, {
          allowCustomHosts: true,
          customHosts: ["sn.example.net", "internal.example"],
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
