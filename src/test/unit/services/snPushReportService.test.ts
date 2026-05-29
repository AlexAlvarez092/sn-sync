import * as assert from "assert";
import * as http from "node:http";
import * as vscode from "vscode";
import { SnPushReportService } from "@services/snPushReportService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import type { SnSyncIndexCandidate } from "@services/snSyncIndexService.js";

suite("snPushReportService", () => {
  test("uses got transport by default to build push report", async () => {
    const server = http.createServer((request, response) => {
      const url = request.url ?? "";

      if (url.includes("/api/now/table/sys_script/abc")) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            result: {
              "sys_scope.scope": "x_app_one",
              "sys_scope.name": "App One",
            },
          }),
        );
        return;
      }

      if (url.includes("/api/now/table/sys_user_preference?")) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ result: [] }));
        return;
      }

      if (url.includes("/api/now/table/sys_update_set?")) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ result: [] }));
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end("{}");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const service = new SnPushReportService({
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: baseUrl,
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never);

      const report = await service.buildPushReport(
        {} as vscode.ExtensionContext,
        vscode.Uri.file("/tmp/ws"),
        [createCandidate("src/a.js", "sys_script", "abc")],
      );

      assert.strictEqual(report.files.length, 1);
      assert.strictEqual(report.files[0].scopeId, "x_app_one");
      assert.strictEqual(report.files[0].scopeName, "App One");
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

  test("builds report with scope and update set per file", async () => {
    const fetchCalls: string[] = [];

    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);
        fetchCalls.push(url);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_script_include/def")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  value: "us-1",
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set/us-1?")) {
          return new Response(
            JSON.stringify({
              result: {
                name: "My Update Set",
              },
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const candidates: SnSyncIndexCandidate[] = [
      createCandidate("src/business_rules/rule.js", "sys_script", "abc"),
      createCandidate(
        "src/script_includes/include.js",
        "sys_script_include",
        "def",
      ),
    ];

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      candidates,
    );

    assert.strictEqual(report.files.length, 2);
    assert.strictEqual(report.scopes.length, 1);
    assert.strictEqual(report.scopes[0].scopeId, "x_app_one");
    assert.strictEqual(report.scopes[0].scopeName, "App One");
    assert.strictEqual(report.scopes[0].files, 2);
    assert.strictEqual(report.scopes[0].updateSetId, "us-1");
    assert.strictEqual(report.scopes[0].updateSetName, "My Update Set");

    const preferenceCalls = fetchCalls.filter((url) =>
      url.includes("/api/now/table/sys_user_preference?"),
    );
    assert.strictEqual(preferenceCalls.length, 1);

    const updateSetNameCalls = fetchCalls.filter((url) =>
      url.includes("/api/now/table/sys_update_set/us-1?"),
    );
    assert.strictEqual(updateSetNameCalls.length, 1);
  });

  test("falls back to global scope and empty update set when unavailable", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {},
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.deepStrictEqual(report.scopes, [
      {
        scopeId: "global",
        scopeName: "global",
        files: 1,
        updateSetId: undefined,
        updateSetName: undefined,
      },
    ]);
  });

  test("uses default update set for scope when user preference is missing", async () => {
    const fetchCalls: string[] = [];

    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);
        fetchCalls.push(url);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  sys_id: "default-us",
                  name: "Default App Update Set",
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.strictEqual(report.files.length, 1);
    assert.strictEqual(report.files[0].scopeId, "x_app_one");
    assert.strictEqual(report.files[0].updateSetId, "default-us");
    assert.strictEqual(report.files[0].updateSetName, "Default App Update Set");

    const defaultUpdateSetQueryCall = fetchCalls.find((url) =>
      url.includes("/api/now/table/sys_update_set?"),
    );
    assert.ok(defaultUpdateSetQueryCall);
    assert.ok(defaultUpdateSetQueryCall?.includes("is_default%3Dtrue"));
    assert.ok(defaultUpdateSetQueryCall?.includes("sys_scope%3Dx_app_one"));
    assert.ok(!defaultUpdateSetQueryCall?.includes("sys_created_by"));
    assert.ok(!defaultUpdateSetQueryCall?.includes("state%3Din%20progress"));
  });

  test("throws when auth is missing", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => undefined,
      } as unknown as never,
      fetch,
    );

    await assert.rejects(
      () =>
        service.buildPushReport(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [createCandidate("src/a.js", "sys_script", "abc")],
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });

  test("uses resolved authorization headers and skips user preference lookup when username is missing", async () => {
    const fetchCalls: string[] = [];

    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          headers: {
            Authorization: "Basic YWRtaW46c2VjcmV0",
          },
        }),
      } as unknown as never,
      (async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push(url);

        const headers = (init?.headers as Record<string, string>) ?? {};
        assert.strictEqual(headers.Authorization, "Basic YWRtaW46c2VjcmV0");

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.strictEqual(report.files.length, 1);
    const preferenceCalls = fetchCalls.filter((url) =>
      url.includes("/api/now/table/sys_user_preference?"),
    );
    assert.strictEqual(preferenceCalls.length, 0);
  });

  test("throws when connection has no headers and no credentials", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
        }),
      } as unknown as never,
      fetch,
    );

    await assert.rejects(
      () =>
        service.buildPushReport(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [createCandidate("src/a.js", "sys_script", "abc")],
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });

  test("handles array/non-array payload fallbacks and empty normalized values", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/arr")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_script/no-name")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_scope_no_name",
                "sys_scope.name": "   ",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: {
                value: "not-an-array",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response(
            JSON.stringify({
              result: {
                sys_id: "not-an-array",
              },
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [
        createCandidate("src/a.js", "sys_script", "arr"),
        createCandidate("src/b.js", "sys_script", "no-name"),
      ],
    );

    const globalScope = report.scopes.find(
      (scope) => scope.scopeId === "global",
    );
    assert.ok(globalScope);

    const namedFallbackScope = report.scopes.find(
      (scope) => scope.scopeId === "x_scope_no_name",
    );
    assert.ok(namedFallbackScope);
    assert.strictEqual(namedFallbackScope?.scopeName, "x_scope_no_name");

    assert.strictEqual(report.files[0].updateSetId, undefined);
    assert.strictEqual(report.files[1].updateSetId, undefined);
  });

  test("keeps report generation when record lookup returns 404", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/missing")) {
          return new Response("{}", { status: 404, statusText: "Not Found" });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/missing.js", "sys_script", "missing")],
    );

    assert.strictEqual(report.files.length, 1);
    assert.strictEqual(report.files[0].scopeId, "unknown");
    assert.strictEqual(report.files[0].scopeName, "unknown");
    assert.strictEqual(
      report.files[0].resolutionNote,
      "Record not found in instance (404).",
    );
    assert.deepStrictEqual(report.scopes, [
      {
        scopeId: "unknown",
        scopeName: "unknown",
        files: 1,
        updateSetId: undefined,
        updateSetName: undefined,
      },
    ]);
  });

  test("continues when update set lookup returns 404", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response("{}", { status: 404, statusText: "Not Found" });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.strictEqual(report.files.length, 1);
    assert.strictEqual(report.files[0].scopeId, "x_app_one");
    assert.strictEqual(report.files[0].updateSetId, undefined);
    assert.strictEqual(
      report.files[0].resolutionNote,
      "Update set table is not available (404).",
    );
  });

  test("keeps update set id when preference exists and name lookup returns 404", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  value: "us-from-pref",
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set/us-from-pref?")) {
          return new Response("{}", { status: 404, statusText: "Not Found" });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.strictEqual(report.files.length, 1);
    assert.strictEqual(report.files[0].scopeId, "x_app_one");
    assert.strictEqual(report.files[0].updateSetId, "us-from-pref");
    assert.strictEqual(report.files[0].updateSetName, undefined);
    assert.strictEqual(report.files[0].resolutionNote, undefined);
  });

  test("throws when record scope lookup fails with non-404", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/boom")) {
          return new Response("{}", {
            status: 500,
            statusText: "Internal Server Error",
          });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.buildPushReport(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [createCandidate("src/a.js", "sys_script", "boom")],
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          "ServiceNow data request failed with status: 500",
        ),
    );
  });

  test("throws when update set lookup fails with non-404", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  value: "us-from-pref",
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set/us-from-pref?")) {
          return new Response("{}", {
            status: 500,
            statusText: "Internal Server Error",
          });
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.buildPushReport(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          [createCandidate("src/a.js", "sys_script", "abc")],
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes(
          "ServiceNow data request failed with status: 500",
        ),
    );
  });

  test("keeps update set id when name lookup returns array payload", async () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [
                {
                  value: "us-from-pref",
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set/us-from-pref?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    const report = await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [createCandidate("src/a.js", "sys_script", "abc")],
    );

    assert.strictEqual(report.files.length, 1);
    assert.strictEqual(report.files[0].updateSetId, "us-from-pref");
    assert.strictEqual(report.files[0].updateSetName, undefined);
  });

  test("isNotFoundError handles non-Error values", () => {
    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      fetch,
    );

    const isNotFoundWithMixedCase = (
      service as unknown as { isNotFoundError(error: unknown): boolean }
    ).isNotFoundError("404 Not Found");

    const isNotFoundWithLowerCase = (
      service as unknown as { isNotFoundError(error: unknown): boolean }
    ).isNotFoundError("404 not found");

    assert.strictEqual(isNotFoundWithMixedCase, false);
    assert.strictEqual(isNotFoundWithLowerCase, true);
  });

  test("reports progress while building report", async () => {
    const progressEvents: Array<{
      processed: number;
      total: number;
      localPath: string;
    }> = [];

    const service = new SnPushReportService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (input: unknown) => {
        const url = String(input);

        if (url.includes("/api/now/table/sys_script/abc")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_one",
                "sys_scope.name": "App One",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_script/def")) {
          return new Response(
            JSON.stringify({
              result: {
                "sys_scope.scope": "x_app_two",
                "sys_scope.name": "App Two",
              },
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_user_preference?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/now/table/sys_update_set?")) {
          return new Response(
            JSON.stringify({
              result: [],
            }),
            { status: 200 },
          );
        }

        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    await service.buildPushReport(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      [
        createCandidate("src/a.js", "sys_script", "abc"),
        createCandidate("src/b.js", "sys_script", "def"),
      ],
      {
        onProgress: (event) => {
          progressEvents.push(event);
        },
      },
    );

    assert.deepStrictEqual(progressEvents, [
      { processed: 1, total: 2, localPath: "src/a.js" },
      { processed: 2, total: 2, localPath: "src/b.js" },
    ]);
  });
});

function createCandidate(
  localPath: string,
  table: string,
  sysId: string,
): SnSyncIndexCandidate {
  return {
    entry: {
      localPath,
      table,
      sysId,
      fieldName: "script",
      baseHash: "sha256:base",
      updatedAt: "now",
    },
    localContent: "content",
    localHash: "sha256:local",
  };
}
