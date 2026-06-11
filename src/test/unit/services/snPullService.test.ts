import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import * as vscode from "vscode";
import { SnPullService } from "@services/snPullService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_VALUES,
} from "@shared/constants/snSyncConstants.js";
import type { ExtensionConfigSetting } from "@shared/models/config.js";
import { hashText } from "@shared/services/hashService.js";
import { withTempDir } from "@test/helpers/testRuntime.js";

suite("snPullService", () => {
  test("uses got transport by default and pulls from local server", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      let firstPageServed = false;

      const server = http.createServer((request, response) => {
        if (!request.url?.startsWith("/api/now/table/sys_security_acl?")) {
          response.writeHead(404, { "Content-Type": "application/json" });
          response.end(JSON.stringify({}));
          return;
        }

        if (!firstPageServed) {
          firstPageServed = true;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              result: [
                {
                  name: "Rule From Got",
                  script: "answer=true;",
                  sys_id: "abc123",
                },
              ],
            }),
          );
          return;
        }

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ result: [] }));
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();
      assert.ok(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const service = new SnPullService({
          resolveConnectionAuth: async () => ({
            instanceName: "dev",
            instanceUrl: baseUrl,
            username: "admin",
            password: "secret",
          }),
        } as unknown as never);

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
            path.join(tempDir, "src", "security_rules", "Rule From Got.js"),
            "utf-8",
          ),
          "answer=true;",
        );
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    });
  });

  test("always requests sys_id and emits it for index metadata", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const requestedUrls: string[] = [];
      const writtenEvents: Array<{ sysId?: string; localPath?: string }> = [];

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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

      assert.strictEqual(requestedUrls.length, 2);
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
          resolveConnectionAuth: async () => ({
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
          resolveConnectionAuth: async () => ({
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

  test("preserves exact remote field content and baseHash when whitespace is present", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const remoteScript = "  first line\nsecond line\n  ";
      const writtenEvents: Array<{ baseHash?: string }> = [];

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  name: "Whitespace Rule",
                  script: remoteScript,
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
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        {
          onFileWritten: (event) => {
            writtenEvents.push({ baseHash: event.baseHash });
          },
        },
      );

      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 1,
        files: 1,
      });

      const localContent = await fs.readFile(
        path.join(tempDir, "src", "security_rules", "Whitespace Rule.js"),
        "utf-8",
      );

      assert.strictEqual(localContent, remoteScript);
      assert.strictEqual(writtenEvents[0].baseHash, hashText(remoteScript));
    });
  });

  test("throws when auth is missing", async () => {
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => undefined,
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

  test("uses resolved authorization headers when available", async () => {
    const calls: RequestInit[] = [];
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          headers: {
            Authorization: "Basic YWRtaW46c2VjcmV0",
          },
        }),
      } as unknown as never,
      (async (_input: unknown, init?: RequestInit) => {
        calls.push(init ?? {});
        return new Response(JSON.stringify({ result: [] }), { status: 200 });
      }) as typeof fetch,
    );

    await service.pullConfiguredScripts(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [
        {
          folder: "src",
          table: "sys_script",
          query: "active=true",
          key: "name",
          fields: [{ field_name: "script", extension: "js" }],
        },
      ],
    );

    const headers = (calls[0].headers as Record<string, string>) ?? {};
    assert.strictEqual(headers.Authorization, "Basic YWRtaW46c2VjcmV0");
  });

  test("throws when connection has no headers and no credentials", async () => {
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
        }),
      } as unknown as never,
      (async () =>
        new Response(JSON.stringify({ result: [] }), {
          status: 200,
        })) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.pullConfiguredScripts(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [
            {
              folder: "src",
              table: "sys_script",
              query: "active=true",
              key: "name",
              fields: [{ field_name: "script", extension: "js" }],
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
        resolveConnectionAuth: async () => ({
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
        resolveConnectionAuth: async () => ({
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

  test("rejects invalid table path segments before network calls", async () => {
    let fetchCalls = 0;

    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (): Promise<Response> => {
        fetchCalls += 1;
        return new Response("{}", { status: 200 });
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
              table: "../sys_security_acl",
              query: "active=true",
              key: "name",
              fields: [{ extension: "js", field_name: "script" }],
            },
          ],
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.SN_REQUEST_INVALID_PATH_SEGMENT_PREFIX} table name.`,
        );
        return true;
      },
    );

    assert.strictEqual(fetchCalls, 0);
  });

  test("rejects invalid rootDir before writing files", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  name: "Can Read",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
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
              rootDir: "../outside",
            },
          ),
        (error: unknown) => {
          assert.strictEqual(
            (error as Error).message,
            `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} rootDir.`,
          );
          return true;
        },
      );
    });
  });

  test("rejects invalid folder path fragments before writing files", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  name: "Can Read",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
            {} as vscode.ExtensionContext,
            workspaceUri,
            [
              {
                folder: "../security_rules",
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
            `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} folder.`,
          );
          return true;
        },
      );
    });
  });

  test("rejects invalid subDirPattern literals and file extensions before writing files", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  name: "Can Read",
                  collection: "incident",
                  script: "answer=true;",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
            {} as vscode.ExtensionContext,
            workspaceUri,
            [
              {
                folder: "security_rules",
                table: "sys_security_acl",
                query: "active=true",
                key: "name",
                subDirPattern: "../unsafe/<collection>",
                fields: [{ extension: "js", field_name: "script" }],
              },
            ],
          ),
        (error: unknown) => {
          assert.strictEqual(
            (error as Error).message,
            `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} subDirPattern literal.`,
          );
          return true;
        },
      );

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
            {} as vscode.ExtensionContext,
            workspaceUri,
            [
              {
                folder: "security_rules",
                table: "sys_security_acl",
                query: "active=true",
                key: "name",
                fields: [{ extension: "../js", field_name: "script" }],
              },
            ],
          ),
        (error: unknown) => {
          assert.strictEqual(
            (error as Error).message,
            `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} file extension.`,
          );
          return true;
        },
      );

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
            {} as vscode.ExtensionContext,
            workspaceUri,
            [
              {
                folder: "security_rules",
                table: "sys_security_acl",
                query: "active=true",
                key: "name",
                fields: [
                  { extension: "js", field_name: "script" },
                  { extension: "JS", field_name: "condition" },
                ],
              },
            ],
          ),
        (error: unknown) => {
          assert.strictEqual(
            (error as Error).message,
            `${SN_SYNC_MESSAGES.PULL_DUPLICATE_OUTPUT_FILE_PREFIX} security_rules/Can Read.JS`,
          );
          return true;
        },
      );
    });
  });

  test("supports pagination when results reach request limit", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      let callCount = 0;

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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

          if (callCount === 2) {
            return {
              ok: true,
              json: async () => ({
                result: [{ name: "rule-final", script: "script-final" }],
              }),
            } as Response;
          }

          return {
            ok: true,
            json: async () => ({
              result: [],
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

      assert.strictEqual(callCount, 3);
      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 3,
        files: 3,
      });
    });
  });

  test("continues pagination when a non-empty page has fewer rows than limit", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      let callCount = 0;

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                result: [{ name: "rule-1", script: "script-1" }],
              }),
            } as Response;
          }

          if (callCount === 2) {
            return {
              ok: true,
              json: async () => ({
                result: [{ name: "rule-2", script: "script-2" }],
              }),
            } as Response;
          }

          return {
            ok: true,
            json: async () => ({ result: [] }),
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

      assert.strictEqual(callCount, 3);
      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 2,
        files: 2,
      });
    });
  });

  test("stops pagination when API repeats the same page", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      let callCount = 0;

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
            instanceName: "dev",
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
            password: "secret",
          }),
        } as unknown as never,
        (async (): Promise<Response> => {
          callCount += 1;

          return {
            ok: true,
            json: async () => ({
              result: [{ name: "rule-1", script: "script-1" }],
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
        records: 1,
        files: 1,
      });
    });
  });

  test("handles malformed payload result as empty", async () => {
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
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

  test("rejects malformed static subdir pattern literals", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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

      await assert.rejects(
        () =>
          service.pullConfiguredScripts(
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
            ],
          ),
        (error: unknown) => {
          assert.strictEqual(
            (error as Error).message,
            `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} subDirPattern literal.`,
          );
          return true;
        },
      );
    });
  });

  test("handles missing subdir token values with safe fallback", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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

      const summary = await service.pullConfiguredScripts(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
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
        settings: 1,
        records: 1,
        files: 1,
      });

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

  test("sanitizes dot segments and uses safe file names", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  name: ".",
                  script: "first",
                },
                {
                  name: "<>",
                  script: "second",
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
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      );

      assert.deepStrictEqual(summary, {
        settings: 1,
        records: 2,
        files: 2,
      });

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "security_rules", "unnamed.js"),
          "utf-8",
        ),
        "first",
      );

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "security_rules", "__.js"),
          "utf-8",
        ),
        "second",
      );

      const sanitizePathSegment = (
        service as unknown as { sanitizePathSegment: (value: string) => string }
      ).sanitizePathSegment;
      assert.strictEqual(
        sanitizePathSegment("."),
        SN_SYNC_VALUES.UNNAMED_PATH_SEGMENT,
      );
      assert.strictEqual(
        sanitizePathSegment(""),
        SN_SYNC_VALUES.UNNAMED_PATH_SEGMENT,
      );
    });
  });

  test("writes files under a custom rootDir when provided", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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

  test("pullRecordBySysId returns empty summary when no settings match table", async () => {
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async () => {
        throw new Error("must-not-be-called");
      }) as typeof fetch,
    );

    const summary = await service.pullRecordBySysId!(
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
      "sp_widget",
      "0123456789abcdef0123456789abcdef",
    );

    assert.deepStrictEqual(summary, {
      settings: 0,
      records: 0,
      files: 0,
    });
  });

  test("pullRecordBySysId batches fields from matching settings in a single API call", async () => {
    await withTempDir("sn-sync-pull-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const requestedUrls: string[] = [];

      const service = new SnPullService(
        {
          resolveConnectionAuth: async () => ({
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
                  sys_id: "0123456789abcdef0123456789abcdef",
                  id: "my_widget",
                  template: "<div></div>",
                  css: ".x{}",
                },
              ],
            }),
          } as Response;
        }) as typeof fetch,
      );

      const summary = await service.pullRecordBySysId!(
        {} as vscode.ExtensionContext,
        workspaceUri,
        [
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "html", field_name: "template" }],
          },
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "css", field_name: "css" }],
          },
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        "sp_widget",
        "0123456789abcdef0123456789abcdef",
      );

      assert.strictEqual(requestedUrls.length, 2);
      assert.ok(
        requestedUrls[0].includes(
          "sysparm_query=sys_id%3D0123456789abcdef0123456789abcdef",
        ),
      );
      assert.deepStrictEqual(summary, {
        settings: 2,
        records: 1,
        files: 2,
      });

      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "widgets", "my_widget.html"),
          "utf-8",
        ),
        "<div></div>",
      );
      assert.strictEqual(
        await fs.readFile(
          path.join(tempDir, "src", "widgets", "my_widget.css"),
          "utf-8",
        ),
        ".x{}",
      );
    });
  });

  test("pullRecordBySysId skips records that miss key value for matched settings", async () => {
    const service = new SnPullService(
      {
        resolveConnectionAuth: async () => ({
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
                sys_id: "0123456789abcdef0123456789abcdef",
                template: "<div></div>",
              },
            ],
          }),
        } as Response;
      }) as typeof fetch,
    );

    const summary = await service.pullRecordBySysId!(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [
        {
          folder: "widgets",
          table: "sp_widget",
          query: "active=true",
          key: "id",
          fields: [{ extension: "html", field_name: "template" }],
        },
      ],
      "sp_widget",
      "0123456789abcdef0123456789abcdef",
    );

    assert.deepStrictEqual(summary, {
      settings: 1,
      records: 0,
      files: 0,
    });
  });
});
