import * as assert from "assert";
import * as vscode from "vscode";
import { SnBackgroundScriptService } from "@services/snBackgroundScriptService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

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

  test("posts script to sys.scripts.do and extracts pre output", async () => {
    const calledUrls: string[] = [];
    const calledBodies: string[] = [];

    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com/",
          headers: { Authorization: "Basic x" },
          username: "admin",
        }),
      } as unknown as never,
      (async (url: string | URL | Request, init?: RequestInit) => {
        calledUrls.push(url.toString());
        calledBodies.push(String(init?.body ?? ""));

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            "<html><body><pre>Script completed\nRows: 12</pre></body></html>",
        } as Response;
      }) as typeof fetch,
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-success"),
      "gs.info('hello')",
    );

    assert.strictEqual(
      calledUrls[0],
      `https://dev.service-now.com${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_PATH}`,
    );
    const decodedBody = decodeURIComponent(calledBodies[0].replace(/\+/g, "%20"));
    assert.ok(decodedBody.includes("__snSyncWrap('info', 'INFO')"));
    assert.ok(decodedBody.includes("script=(function () {"));
    assert.strictEqual(result.output, "Script completed\nRows: 12");
    assert.ok(result.rawResponse.includes("<pre>"));
  });

  test("falls back to body text when pre is missing", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => "<html><body>Execution done &amp; verified</body></html>",
        } as Response;
      }) as typeof fetch,
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-body-fallback"),
      "gs.info('x')",
    );

    assert.strictEqual(result.output, "Execution done & verified");
  });

  test("returns default message when response has no meaningful output", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => "<html><body><br/></body></html>",
        } as Response;
      }) as typeof fetch,
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-no-output"),
      "gs.info('x')",
    );

    assert.strictEqual(
      result.output,
      "(No printable output returned by ServiceNow. Use gs.print()/gs.warn() if you need visible output. gs.info() writes to system logs.)",
    );
  });

  test("decodes hex and decimal entities and preserves unknown entities", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            "<html><body><pre>Hex: &#x41; Dec: &#65; Unknown: &custom;</pre></body></html>",
        } as Response;
      }) as typeof fetch,
    );

    const result = await service.runBackgroundScript(
      {} as vscode.ExtensionContext,
      createTempWorkspaceUri("bg-script-entity-decode"),
      "gs.info('x')",
    );

    assert.strictEqual(result.output, "Hex: A Dec: A Unknown: &custom;");
  });

  test("keeps numeric entities unchanged when parseInt returns NaN", async () => {
    const service = new SnBackgroundScriptService(
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev.service-now.com",
          headers: { Authorization: "Basic x" },
        }),
      } as unknown as never,
      (async () => {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            "<html><body><pre>Hex: &#x41; Dec: &#65;</pre></body></html>",
        } as Response;
      }) as typeof fetch,
    );

    const originalParseInt = Number.parseInt;
    Number.parseInt = (() => Number.NaN) as typeof Number.parseInt;

    try {
      const result = await service.runBackgroundScript(
        {} as vscode.ExtensionContext,
        createTempWorkspaceUri("bg-script-entity-nan"),
        "gs.info('x')",
      );

      assert.strictEqual(result.output, "Hex: &#x41; Dec: &#65;");
    } finally {
      Number.parseInt = originalParseInt;
    }
  });

  test("throws auth error on 401", async () => {
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
          status: 401,
          statusText: "Unauthorized",
          text: async () => "",
        } as Response;
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.runBackgroundScript(
          {} as vscode.ExtensionContext,
          createTempWorkspaceUri("bg-script-401"),
          "gs.info('x')",
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

  test("throws auth error on 403", async () => {
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
          createTempWorkspaceUri("bg-script-403"),
          "gs.info('x')",
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

  test("throws HTTP status error on non-success response", async () => {
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
          "gs.info('x')",
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
});
