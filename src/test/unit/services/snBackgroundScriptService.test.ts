import * as assert from "assert";
import * as vscode from "vscode";
import { SnBackgroundScriptService } from "@services/snBackgroundScriptService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

interface FakeFetchCall {
  url: string;
  method: string;
  body: string;
}

interface FakeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

function buildScriptsPageHtml(optionsHtml: string): string {
  return `<html><body>
    <form>
      <input name="sysparm_ck" value="ck-token-123" />
      <select name="sys_scope">${optionsHtml}</select>
    </form>
  </body></html>`;
}

function createQueuedFetch(
  responses: FakeFetchResponse[],
  calls: FakeFetchCall[],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected fetch call: ${url.toString()}`);
    }

    calls.push({
      url: url.toString(),
      method: (init?.method ?? "GET").toUpperCase(),
      body: String(init?.body ?? ""),
    });

    return {
      ok: next.ok,
      status: next.status,
      statusText: next.statusText,
      text: async () => next.text,
    } as Response;
  }) as typeof fetch;
}

suite("snBackgroundScriptService", () => {
  test("resolves execution context from auth", async () => {
    const service = new SnBackgroundScriptService({
      resolveConnectionAuth: async () => ({
        instanceUrl: "https://dev.service-now.com",
        headers: { Authorization: "Basic x" },
        username: "admin",
      }),
    } as unknown as never);

    const contextInfo = await service.resolveExecutionContext(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-context"),
    );

    assert.deepStrictEqual(contextInfo, {
      instanceUrl: "https://dev.service-now.com",
      username: "admin",
    });
  });

  test("posts script after warmup and resolves custom scope from scripts page", async () => {
    const calls: FakeFetchCall[] = [];
    const customScopeSysId = "7f5301f31b223450aabbccddeeff0011";
    const scriptsPageHtml = buildScriptsPageHtml(
      `<option value="global">Global</option>
       <option value="${customScopeSysId}">Library Intent [sn_library_intent]</option>`,
    );

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com/",
          headers: { Authorization: "Basic x" },
          username: "admin",
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: scriptsPageHtml },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>Script completed\nRows: 12</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-success"),
      "gs.print('hello')",
      "sn_library_intent",
    );

    assert.strictEqual(
      calls[1].url,
      `https://dev.service-now.com${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_PATH}`,
    );
    const decodedBody = decodeURIComponent(calls[2].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes("gs.print('hello')"));
    assert.ok(decodedBody.includes("sysparm_ck=ck-token-123"));
    assert.ok(decodedBody.includes(`sys_scope=${customScopeSysId}`));
    assert.ok(
      decodedBody.includes(
        `runscript=${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_RUN_LABEL}`,
      ),
    );
    assert.strictEqual(result.output, "Script completed\nRows: 12");
  });

  test("uses lookup API when scripts page has no scope options", async () => {
    const calls: FakeFetchCall[] = [];
    const lookupScopeId = "11112222333344445555666677778888";

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><input name='sysparm_ck' value='abc' /></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({
              result: [
                {
                  sys_id: lookupScopeId,
                  scope: "sn_library_intent",
                  name: "Library Intent",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>Done</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-lookup"),
      "gs.print('x')",
      "sn_library_intent",
    );

    assert.ok(calls[2].url.includes("/api/now/table/sys_scope"));
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${lookupScopeId}`));
  });

  test("throws clear error when scope cannot be resolved unambiguously", async () => {
    const calls: FakeFetchCall[] = [];

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><input name='sysparm_ck' value='abc' /></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({
              result: [
                {
                  sys_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  scope: "x_other_scope",
                  name: "Other Scope",
                },
              ],
            }),
          },
        ],
        calls,
      ),
    );

    await assert.rejects(
      () =>
        service.runBackgroundScript(
          {} as vscode.ExtensionContext,
          createTempWorkspaceUri("bg-script-unresolved-scope"),
          "gs.print('x')",
          "sn_library_intent",
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          "Selected scope 'sn_library_intent' is not available for this instance/user.",
        );
        return true;
      },
    );

    assert.strictEqual(calls.length, 3);
  });

  test("accepts direct sys_id when provided as scope", async () => {
    const calls: FakeFetchCall[] = [];
    const directSysId = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><input name='sysparm_ck' value='abc' /></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({ result: [] }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>ok</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-direct-sysid"),
      "gs.print('x')",
      directSysId,
    );

    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${directSysId}`));
  });

  test("throws error when ck token is missing", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><select name='sys_scope'></select></body></html>",
          },
        ],
        [],
      ),
    );

    await assert.rejects(
      () =>
        service.runBackgroundScript(
          {} as vscode.ExtensionContext,
          createTempWorkspaceUri("bg-script-missing-ck"),
          "gs.print('x')",
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          "Could not extract ck token from ServiceNow response",
        );
        return true;
      },
    );
  });

  test("throws error on 401 unauthorized", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: async () => "",
        } as Response;
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.runBackgroundScript(
          {} as vscode.ExtensionContext,
          createTempWorkspaceUri("bg-script-401"),
          "gs.print('x')",
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

  test("throws error on 500 server error", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: false,
          status: 500,
          statusText: "Server Error",
          text: async () => "",
        } as Response;
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.runBackgroundScript(
          {} as vscode.ExtensionContext,
          createTempWorkspaceUri("bg-script-500"),
          "gs.print('x')",
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX} 500 Server Error`,
        );
        return true;
      },
    );
  });

  test("decodes HTML entities in output", async () => {
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global'>Global</option>",
    );

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: scriptsPageHtml },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>Test: &amp; &lt; &gt; &#65;</pre></body></html>",
          },
        ],
        [],
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-entities"),
      "gs.print('x')",
      "global",
    );

    assert.ok(result.output.includes("&"));
    assert.ok(result.output.includes("<"));
    assert.ok(result.output.includes(">"));
    assert.ok(result.output.includes("A"));
  });

  test("resolveScopeOptions merges listed scopes with current selected scope", async () => {
    const calls: FakeFetchCall[] = [];
    const currentScopeHtml = `
      <html><body>
        <select name="sys_scope">
          <option value="global">Global</option>
          <option value="x_current_scope" selected>Current Scope</option>
        </select>
      </body></html>`;

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: currentScopeHtml },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({
              result: [
                { scope: "x_app_one", name: "App One" },
                { scope: "global", name: "Global" },
              ],
            }),
          },
        ],
        calls,
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-merge"),
    );

    assert.ok(calls[2].url.includes("/api/now/table/sys_scope"));
    assert.strictEqual(resolution.defaultScopeId, "x_current_scope");
    assert.ok(resolution.options.some((item) => item.id === "x_app_one"));
    assert.ok(resolution.options.some((item) => item.id === "x_current_scope"));
    assert.ok(resolution.options.some((item) => item.id === "global"));
  });

  test("resolveScopeOptions falls back to global when current selected option has no value", async () => {
    const currentScopeHtml = `
      <html><body>
        <select name="sys_scope">
          <option selected>Missing Value Scope</option>
        </select>
      </body></html>`;

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: currentScopeHtml },
          { ok: false, status: 500, statusText: "Server Error", text: "" },
        ],
        [],
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-fallback"),
    );

    assert.strictEqual(resolution.defaultScopeId, "global");
    assert.deepStrictEqual(resolution.options, [
      { id: "global", label: "Global" },
    ]);
  });

  test("runBackgroundScript scans multiple input tags to find sysparm_ck", async () => {
    const calls: FakeFetchCall[] = [];
    const scriptsPageHtml = `
      <html><body>
        <input name="other" value="x" />
        <input name="sysparm_ck" value="token-2" />
        <select name="sys_scope"><option value="global">Global</option></select>
      </body></html>`;

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: scriptsPageHtml },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>ok</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-ck-loop"),
      "gs.print('x')",
      "global",
    );

    const decodedBody = decodeURIComponent(calls[2].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes("sysparm_ck=token-2"));
  });

  test("resolveScopeOptions handles scripts page without sys_scope select", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body>No select</body></html>",
          },
          { ok: false, status: 500, statusText: "Server Error", text: "" },
        ],
        [],
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-no-select"),
    );

    assert.deepStrictEqual(resolution, {
      options: [{ id: "global", label: "Global" }],
      defaultScopeId: "global",
    });
  });

  test("runBackgroundScript uses global scope when requested scope is empty", async () => {
    const calls: FakeFetchCall[] = [];
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global_sys_id'>Global</option>",
    );

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          { ok: true, status: 200, statusText: "OK", text: scriptsPageHtml },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>ok</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-empty-scope"),
      "gs.print('x')",
      "   ",
    );

    const decodedBody = decodeURIComponent(calls[2].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes("sys_scope=global_sys_id"));
  });

  test("resolveScopeOptions gracefully handles API errors and returns fallback", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><select name='sys_scope'><option value='current' selected>Current</option><option value='other'>Other</option></select></body></html>",
          },
          { ok: false, status: 500, statusText: "Internal Server Error", text: "" },
        ],
        [],
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-api-error"),
    );

    assert.strictEqual(resolution.defaultScopeId, "current");
    assert.ok(resolution.options.some((opt) => opt.id === "current"));
    assert.ok(resolution.options.some((opt) => opt.id === "global"));
  });

  test("resolveScopeOptions handles invalid JSON in API response", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "{ not: valid json }",
          },
        ],
        [],
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-invalid-json"),
    );

    assert.strictEqual(resolution.defaultScopeId, "global");
    assert.deepStrictEqual(resolution.options, [
      { id: "global", label: "Global" },
    ]);
  });

  test("scope resolution accepts direct sys_id when lookup API is unavailable", async () => {
    const calls: FakeFetchCall[] = [];
    const customSysId = "aaaa1111bbbb2222cccc3333dddd4444";
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      createQueuedFetch(
        [
          { ok: true, status: 200, statusText: "OK", text: "{}" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: buildScriptsPageHtml(
              "<option value='global'>Global</option>",
            ),
          },
          {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            text: "",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>Done</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-direct-sysid"),
      "gs.print('test')",
      customSysId,
    );

    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${customSysId}`));
    assert.ok(result.output);
  });
});
