import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { SnPullService } from "@services/snPullService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import { withTempDir } from "@test/helpers/testRuntime.js";

suite("snPullService", () => {
  test("always requests sys_id and emits it for index metadata", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const requestedUrls: string[] = [];
      const writtenEvents: Array<{ sysId?: string; localPath?: string }> = [];

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (url: string | URL | Request): Promise<Response> => {
          requestedUrls.push(url.toString());

          return {
            ok: true,
            json: async () => ({
              result: [
                {
                  sys_id: "abc123",
                  name: "Can Read",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        {
          onFileWritten: (event) => {
            writtenEvents.push({
              sysId: event.sysId,
              localPath: event.localPath,
            });
          },
        },
      );

      assert.strictEqual(requestedUrls.length, 1);
      assert.ok(
        requestedUrls[0].includes("sysparm_fields=name%2Cscript%2Csys_id") ||
          requestedUrls[0].includes("sysparm_fields=name%2Csys_id%2Cscript") ||
          requestedUrls[0].includes("sysparm_fields=script%2Cname%2Csys_id") ||
          requestedUrls[0].includes("sysparm_fields=script%2Csys_id%2Cname") ||
          requestedUrls[0].includes("sysparm_fields=sys_id%2Cname%2Cscript") ||
          requestedUrls[0].includes("sysparm_fields=sys_id%2Cscript%2Cname"),
      );
      assert.deepStrictEqual(writtenEvents, [
        {
          sysId: "abc123",
          localPath: "src/security_rules/Can Read.js",
        },
      ]);
    });
  });

  test("pulls files using subdir, multi-field, and single-field patterns", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const writtenFiles: Array<{ settingFolder: string; fileName: string }> =
        [];

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (url: string | URL | Request): Promise<Response> => {
          const urlText = url.toString();

          if (urlText.includes("/api/now/table/sys_script?")) {
            return {
              ok: true,
              json: async () => ({
                result: [
                  {
                    name: "Create User",
                    collection: "incident",
                    when: "before",
                    script: "gs.info('br');",
                  },
                ],
              }),
            } as Response;
          }

          if (urlText.includes("/api/now/table/sp_widget?")) {
            return {
              ok: true,
              json: async () => ({
                result: [
                  {
                    id: "my_widget",
                    client_script: "function client() {}",
                    script: "(function(){})();",
                    template: "<div></div>",
                    css: ".x{}",
                  },
                ],
              }),
            } as Response;
          }

          return {
            ok: true,
            json: async () => ({
              result: [
                {
                  name: "Can Read",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
        2,
      );

      const settings: ExtensionConfigSetting[] = [
        {
          folder: "business_rules",
          table: "sys_script",
          query: "active=true",
          key: "name",
          subDirPattern: "<collection>/before",
          fields: [{ extension: "js", field_name: "script" }],
        },
        {
          folder: "sp_widgets",
          table: "sp_widget",
          query: "active=true",
          key: "id",
          fields: [
            { extension: "client.js", field_name: "client_script" },
            { extension: "server.js", field_name: "script" },
            { extension: "html", field_name: "template" },
            { extension: "scss", field_name: "css" },
          ],
        },
        {
          folder: "security_rules",
          table: "sys_security_acl",
          query: "active=true",
          key: "name",
          fields: [{ extension: "js", field_name: "script" }],
        },
      ];

      const summary = await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        settings,
        {
          onFileWritten: (event) => {
            writtenFiles.push(event);
          },
        },
      );

      assert.deepStrictEqual(summary, {
        settings: 3,
        records: 3,
        files: 6,
      });

      assert.deepStrictEqual(
        writtenFiles.map((entry) => entry.settingFolder),
        [
          "business_rules",
          "sp_widgets",
          "sp_widgets",
          "sp_widgets",
          "sp_widgets",
          "security_rules",
        ],
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(
            tempDir,
            "src",
            "business_rules",
            "incident",
            "before",
            "Create User.js",
          ),
          "utf-8",
        ),
        "gs.info('br');",
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(
            tempDir,
            "src",
            "sp_widgets",
            "my_widget",
            "my_widget.server.js",
          ),
          "utf-8",
        ),
        "(function(){})();",
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "security_rules", "Can Read.js"),
          "utf-8",
        ),
        "answer=true;",
      );
    });
  });

  test("skips records without key and writes empty content when field is null", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (): Promise<Response> => {
          return {
            ok: true,
            json: async () => ({
              result: [
                { script: "missing-key" },
                { name: "invalid/name", script: null },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      const summary = await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      );

      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 1,
        files: 1,
      });

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "security_rules", "invalid_name.js"),
          "utf-8",
        ),
        "",
      );
    });
  });

  test("throws when auth is missing", async () => {
    const service = new SnPullService(
      {
        getSavedAuth: async () => undefined,
      } as unknown as never,
      (async () => {
        throw new Error("must-not-be-called");
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.pullConfiguredScripts(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [
            {
              folder: "security_rules",
              table: "sys_security_acl",
              query: "active=true",
              key: "name",
              fields: [{ extension: "js", field_name: "script" }],
            },
          ],
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
        );
        return true;
      },
    );
  });

  test("throws invalid credential error on 401", async () => {
    const service = new SnPullService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (): Promise<Response> => {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        } as Response;
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.pullConfiguredScripts(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [
            {
              folder: "security_rules",
              table: "sys_security_acl",
              query: "active=true",
              key: "name",
              fields: [{ extension: "js", field_name: "script" }],
            },
          ],
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS,
        );
        return true;
      },
    );
  });

  test("throws status message for non-auth HTTP errors", async () => {
    const service = new SnPullService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (): Promise<Response> => {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response;
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.pullConfiguredScripts(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [
            {
              folder: "security_rules",
              table: "sys_security_acl",
              query: "active=true",
              key: "name",
              fields: [{ extension: "js", field_name: "script" }],
            },
          ],
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX} 500 Internal Server Error`,
        );
        return true;
      },
    );
  });

  test("supports pagination when results reach request limit", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      let callCount = 0;

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (): Promise<Response> => {
          callCount += 1;

          if (callCount === 1) {
            return {
              ok: true,
              json: async () => ({
                result: Array.from({ length: 2 }).map((_, index) => ({
                  name: `rule-${index}`,
                  script: `script-${index}`,
                })),
              }),
            } as Response;
          }

          return {
            ok: true,
            json: async () => ({
              result: [{ name: "rule-final", script: "script-final" }],
            }),
          } as Response;
        }) as typeof fetch,
        2,
      );

      const summary = await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      );

      assert.strictEqual(callCount, 2);
      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 3,
        files: 3,
      });
    });
  });

  test("handles malformed payload result as empty", async () => {
    const service = new SnPullService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (): Promise<Response> => {
        return {
          ok: true,
          json: async () => ({ result: null }),
        } as Response;
      }) as typeof fetch,
    );

    const summary = await service.pullConfiguredScripts(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [
        {
          folder: "security_rules",
          table: "sys_security_acl",
          query: "active=true",
          key: "name",
          fields: [{ extension: "js", field_name: "script" }],
        },
      ],
    );

    assert.deepStrictEqual(summary, {
      settings: 1,
      records: 0,
      files: 0,
    });
  });

  test("handles static subdir pattern and missing token values with safe fallbacks", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (): Promise<Response> => {
          return {
            ok: true,
            json: async () => ({
              result: [
                {
                  name: "   ",
                  script: "ignored",
                },
                {
                  name: "Rule One",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      const summary = await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            subDirPattern: "///",
            fields: [{ extension: "js", field_name: "script" }],
          },
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            subDirPattern: "fixed/<missing_token>",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      );

      assert.deepStrictEqual(summary, {
        settings: 2,
        records: 2,
        files: 2,
      });

      assert.strictEqual(
        await fs.readFile(
          path.join(
            tempDir,
            "src",
            "security_rules",
            "unnamed",
            "unnamed",
            "unnamed",
            "unnamed",
            "Rule One.js",
          ),
          "utf-8",
        ),
        "answer=true;",
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(
            tempDir,
            "src",
            "business_rules",
            "fixed",
            "unknown",
            "Rule One.js",
          ),
          "utf-8",
        ),
        "answer=true;",
      );
    });
  });

  test("writes files under a custom rootDir when provided", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          getSavedAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (): Promise<Response> => {
          return {
            ok: true,
            json: async () => ({
              result: [
                {
                  name: "Rule One",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        {
          rootDir: "app",
        },
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "app", "security_rules", "Rule One.js"),
          "utf-8",
        ),
        "answer=true;",
      );
    });
  });
});
