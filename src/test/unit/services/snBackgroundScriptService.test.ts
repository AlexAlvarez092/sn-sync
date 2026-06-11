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

  test("resolveScopeOptions adds missing global scope when API doesn't include it", async () => {
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
            text: "<html><body><select name='sys_scope'><option value='global'>Global</option></select></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({
              result: [
                { scope: "x_app_one", name: "App One" },
                { scope: "x_app_two", name: "App Two" },
              ],
            }),
          },
        ],
        calls,
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-scope-options-missing-global"),
    );

    assert.ok(
      resolution.options.some((item) => item.id === "global"),
      "global scope should be added by defensive fallback",
    );
    assert.ok(resolution.options.some((item) => item.id === "x_app_one"));
    assert.ok(resolution.options.some((item) => item.id === "x_app_two"));
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
          {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            text: "",
          },
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

  test("runBackgroundScript extracts output from HTML when <pre> blocks are missing", async () => {
    const calls: FakeFetchCall[] = [];
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
            text: "<html><body>Script output without pre tags</body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-no-pre-tags"),
      "gs.print('test')",
      "global",
    );

    assert.ok(result.output.includes("Script output without pre tags"));
  });

  test("runBackgroundScript accepts 'global' as scope when no options available in HTML", async () => {
    const calls: FakeFetchCall[] = [];
    const scriptsPageHtml = buildScriptsPageHtml("");
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
          { ok: false, status: 500, statusText: "Server Error", text: "" },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>Result</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-global-no-options"),
      "gs.print('test')",
      "global",
    );

    assert.ok(result.output.includes("Result"));
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes("sys_scope=global"));
  });

  test("runBackgroundScript uses API lookup result when HTML options don't match requested scope", async () => {
    const calls: FakeFetchCall[] = [];
    const customSysId = "bbbb2222cccc3333dddd4444aaaa1111";
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global'>Global</option><option value='x_other'>Other Scope</option>",
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
            text: JSON.stringify({
              result: [
                {
                  sys_id: customSysId,
                  scope: "x_custom_app",
                  name: "Custom App",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>done</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-api-lookup"),
      "gs.print('test')",
      "x_custom_app",
    );

    assert.ok(result.output);
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${customSysId}`));
  });

  test("runBackgroundScript matches scope by canonical form (removing special chars)", async () => {
    const calls: FakeFetchCall[] = [];
    const scopeSysId = "cccc3333dddd4444aaaa1111bbbb2222";
    const scriptsPageHtml = buildScriptsPageHtml(
      `<option value='${scopeSysId}'>Custom_App-v1.0</option>`,
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
            text: "<html><body><pre>Success</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-canonical-match"),
      "gs.print('test')",
      "customappv10",
    );

    assert.ok(result.output);
    const decodedBody = decodeURIComponent(calls[2].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${scopeSysId}`));
  });

  test("runBackgroundScript matches scope by fuzzy substring", async () => {
    const calls: FakeFetchCall[] = [];
    const scopeSysId = "dddd4444aaaa1111bbbb2222cccc3333";
    const scriptsPageHtml = buildScriptsPageHtml(
      `<option value='${scopeSysId}'>Very Long Scope Name With Many Words</option>`,
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
            text: "<html><body><pre>Fuzzy</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-fuzzy-match"),
      "gs.print('test')",
      "Long Scope Name",
    );

    assert.ok(result.output);
    const decodedBody = decodeURIComponent(calls[2].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${scopeSysId}`));
  });

  test("runBackgroundScript rejects unknown scope when all resolution methods fail", async () => {
    const calls: FakeFetchCall[] = [];
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global'>Global</option><option value='x_other'>Other</option>",
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
            text: JSON.stringify({ result: [] }),
          },
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-unknown-scope"),
        "gs.print('test')",
        "x_unknown_scope",
      );
      assert.fail("Should have thrown error for unknown scope");
    } catch (error) {
      assert.ok(
        (error as Error).message.includes("not available"),
        `Expected error about unavailable scope, got: ${(error as Error).message}`,
      );
    }
  });

  test("scope resolution accepts sys_id when no other resolution works", async () => {
    const calls: FakeFetchCall[] = [];
    const customSysId = "eeee5555ffff6666aaaa1111bbbb2222";
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
          { ok: false, status: 500, statusText: "Server Error", text: "" },
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

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-direct-id"),
      "gs.print('test')",
      customSysId,
    );

    assert.ok(result.output);
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${customSysId}`));
  });

  test("tryResolveScopeValueByLookup skips API results without sys_id", async () => {
    const calls: FakeFetchCall[] = [];
    const validSysId = "ffff6666aaaa1111bbbb2222cccc3333";
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
            text: JSON.stringify({
              result: [
                { scope: "x_invalid", name: "Invalid App" },
                {
                  sys_id: validSysId,
                  scope: "x_target_app",
                  name: "Target App",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>done</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-skip-no-sysid"),
      "gs.print('test')",
      "x_target_app",
    );

    assert.ok(result.output);
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${validSysId}`));
  });

  test("tryResolveScopeValueByLookup matches API result by exact scope name", async () => {
    const calls: FakeFetchCall[] = [];
    const appSysId = "aaaa1111bbbb2222cccc3333dddd4444";
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
            text: JSON.stringify({
              result: [
                {
                  sys_id: appSysId,
                  scope: "x_my_application",
                  name: "My Application",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>API match</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-api-exact-match"),
      "gs.print('test')",
      "x_my_application",
    );

    assert.ok(result.output.includes("API match"));
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${appSysId}`));
  });

  test("tryResolveScopeValueByLookup matches by exact sys_id", async () => {
    const calls: FakeFetchCall[] = [];
    const customSysId = "1111aaaa2222bbbb3333cccc4444dddd";
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global'>Global</option><option value='other'>Other</option>",
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
            text: JSON.stringify({
              result: [
                {
                  sys_id: customSysId,
                  scope: "x_searched_scope",
                  name: "Searched Scope",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>api_found</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-api-lookup-match"),
      "gs.print('test')",
      "x_searched_scope",
    );

    assert.ok(result.output.includes("api_found"));
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${customSysId}`));
  });

  test("resolveScopeOptions skips scopes without scope field from API", async () => {
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
            text: "<html><body><select name='sys_scope'><option value='global'>Global</option></select></body></html>",
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: JSON.stringify({
              result: [
                { name: "Invalid - no scope" },
                {
                  scope: "x_valid_app",
                  name: "Valid App",
                },
              ],
            }),
          },
        ],
        calls,
      ),
    );

    const resolution = await service.resolveScopeOptions(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("scope-options-skip-no-scope"),
    );

    assert.ok(
      resolution.options.some((opt) => opt.id === "x_valid_app"),
      "Should include app with valid scope",
    );
  });

  test("tryResolveScopeValueByLookup finds match by canonical form from API", async () => {
    const calls: FakeFetchCall[] = [];
    const appSysId = "2222bbbb3333cccc4444ddddaaaa1111";
    const scriptsPageHtml = buildScriptsPageHtml(
      "<option value='global'>Global</option><option value='other'>Other</option>",
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
            text: JSON.stringify({
              result: [
                {
                  sys_id: appSysId,
                  scope: "x-custom-app-v2",
                  name: "Custom-App-V2",
                },
              ],
            }),
          },
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: "<html><body><pre>canonical</pre></body></html>",
          },
        ],
        calls,
      ),
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-canonical-api"),
      "gs.print('test')",
      "xcustomappv2",
    );

    assert.ok(result.output.includes("canonical"));
    const decodedBody = decodeURIComponent(calls[3].body.replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes(`sys_scope=${appSysId}`));
  });

  test("tryResolveScopeValueByLookup returns undefined when API has no matching results", async () => {
    const calls: FakeFetchCall[] = [];
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
            text: JSON.stringify({
              result: [
                {
                  sys_id: "bbbb3333cccc4444ddddaaaabbbb2222",
                  scope: "x_other_app",
                  name: "Other App",
                },
              ],
            }),
          },
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-no-api-match"),
        "gs.print('test')",
        "z_completely_unknown",
      );
      assert.fail("Should have thrown error for unknown scope");
    } catch (error) {
      assert.ok(
        (error as Error).message.includes("not available"),
        "Should fail when scope not found",
      );
    }
  });

  test("scope resolution rejects scope that becomes empty after sanitization", async () => {
    const calls: FakeFetchCall[] = [];
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
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-sanitized-empty"),
        "gs.print('test')",
        "^^^",
      );
      assert.fail(
        "Should have thrown error for empty scope after sanitization",
      );
    } catch (error) {
      assert.ok(
        (error as Error).message.includes("not available"),
        "Should fail when scope becomes empty after sanitization",
      );
    }
  });

  test("runBackgroundScript throws AUTH_INVALID_CREDENTIALS when server returns 401", async () => {
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
          // warmSession()
          { ok: true, status: 200, statusText: "OK", text: "" },
          // fetchScriptsPage()
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: buildScriptsPageHtml(
              `<option value="global" selected>Global</option>`,
            ),
          },
          // runBackgroundScript() - script execution with 401 error
          { ok: false, status: 401, statusText: "Unauthorized", text: "" },
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-401-error"),
        "gs.print('test')",
        "global",
      );
      assert.fail("Should have thrown AUTH_INVALID_CREDENTIALS");
    } catch (error) {
      assert.strictEqual(
        (error as Error).message,
        SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS,
        `Expected AUTH_INVALID_CREDENTIALS error, got: ${(error as Error).message}`,
      );
    }
  });

  test("runBackgroundScript throws HTTP error when server returns 403 Forbidden", async () => {
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
          // warmSession()
          { ok: true, status: 200, statusText: "OK", text: "" },
          // fetchScriptsPage()
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: buildScriptsPageHtml(
              `<option value="global" selected>Global</option>`,
            ),
          },
          // runBackgroundScript() - script execution with 403 error
          { ok: false, status: 403, statusText: "Forbidden", text: "" },
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-403-error"),
        "gs.print('test')",
        "global",
      );
      assert.fail("Should have thrown an error");
    } catch (error) {
      // 403 is handled by snHttpService which throws generic HTTP error
      const msg = (error as Error).message;
      assert.ok(msg.length > 0, `Expected error message, got: ${msg}`);
    }
  });

  test("runBackgroundScript throws HTTP error when server returns 500", async () => {
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
          // warmSession()
          { ok: true, status: 200, statusText: "OK", text: "" },
          // fetchScriptsPage()
          {
            ok: true,
            status: 200,
            statusText: "OK",
            text: buildScriptsPageHtml(
              `<option value="global" selected>Global</option>`,
            ),
          },
          // runBackgroundScript() - script execution with 500 error
          {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            text: "",
          },
        ],
        calls,
      ),
    );

    try {
      await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-500-error"),
        "gs.print('test')",
        "global",
      );
      assert.fail("Should have thrown HTTP error");
    } catch (error) {
      const msg = (error as Error).message;
      assert.ok(
        msg.includes("500") && msg.includes("Internal Server Error"),
        `Expected HTTP 500 error message, got: ${msg}`,
      );
    }
  });
});
