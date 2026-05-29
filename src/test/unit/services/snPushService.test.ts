import * as assert from "assert";
import * as http from "node:http";
import * as vscode from "vscode";
import { SnPushService } from "@services/snPushService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snPushService", () => {
  test("uses got transport by default for get and push", async () => {
    let patchBody = "";
    const server = http.createServer((request, response) => {
      if (request.method === "GET") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ result: { script: "remote-script" } }));
        return;
      }

      if (request.method === "PATCH") {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk.toString();
        });
        request.on("end", () => {
          patchBody = body;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end("{}");
        });
        return;
      }

      response.writeHead(405, { "Content-Type": "application/json" });
      response.end("{}");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const entry = {
      localPath: "src/a.js",
      table: "sys_script",
      sysId: "abc",
      fieldName: "script",
      baseHash: "sha256:x",
      updatedAt: new Date().toISOString(),
    };

    try {
      const service = new SnPushService({
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: baseUrl,
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never);

      const content = await service.getRemoteFieldContent(
        {} as vscode.ExtensionContext,
        vscode.Uri.file("/tmp/ws"),
        entry,
      );

      assert.strictEqual(content, "remote-script");

      await service.pushFieldContent(
        {} as vscode.ExtensionContext,
        vscode.Uri.file("/tmp/ws"),
        entry,
        "updated-content",
      );

      assert.strictEqual(
        patchBody,
        JSON.stringify({ script: "updated-content" }),
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

  test("returns remote field content", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async () =>
        new Response(
          JSON.stringify({
            result: {
              script: "answer=true;",
            },
          }),
          {
            status: 200,
          },
        )) as typeof fetch,
    );

    const content = await service.getRemoteFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
    );

    assert.strictEqual(content, "answer=true;");
  });

  test("pushes field content using PATCH", async () => {
    const calls: Array<{ method: string; body: string | null }> = [];

    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async (_input: unknown, init?: RequestInit) => {
        calls.push({
          method: init?.method ?? "",
          body: (init?.body as string | null) ?? null,
        });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );

    await service.pushFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
      "new-content",
    );

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].method, "PATCH");
    assert.strictEqual(
      calls[0].body,
      JSON.stringify({ script: "new-content" }),
    );
  });

  test("throws when auth is missing", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => undefined,
      } as unknown as never,
      fetch,
    );

    await assert.rejects(
      () =>
        service.getRemoteFieldContent(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            localPath: "src/a.js",
            table: "sys_script",
            sysId: "abc",
            fieldName: "script",
            baseHash: "sha256:x",
            updatedAt: new Date().toISOString(),
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });

  test("uses resolved authorization headers when available", async () => {
    const calls: RequestInit[] = [];
    const service = new SnPushService(
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
        return new Response(JSON.stringify({ result: { script: "ok" } }), {
          status: 200,
        });
      }) as typeof fetch,
    );

    await service.getRemoteFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
    );

    const headers = (calls[0].headers as Record<string, string>) ?? {};
    assert.strictEqual(headers.Authorization, "Basic YWRtaW46c2VjcmV0");
  });

  test("throws when connection has no headers and no credentials", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
        }),
      } as unknown as never,
      (async () => new Response("{}", { status: 200 })) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.getRemoteFieldContent(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            localPath: "src/a.js",
            table: "sys_script",
            sysId: "abc",
            fieldName: "script",
            baseHash: "sha256:x",
            updatedAt: new Date().toISOString(),
          },
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

  test("returns empty remote field content when ServiceNow field is null", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async () =>
        new Response(
          JSON.stringify({
            result: {
              script: null,
            },
          }),
          {
            status: 200,
          },
        )) as typeof fetch,
    );

    const content = await service.getRemoteFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
    );

    assert.strictEqual(content, "");
  });

  test("pushFieldContent returns stored content from PATCH response", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async () =>
        new Response(
          JSON.stringify({
            result: {
              script: "stored-by-servicenow",
            },
          }),
          { status: 200 },
        )) as typeof fetch,
    );

    const stored = await service.pushFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
      "new-content",
    );

    assert.strictEqual(stored, "stored-by-servicenow");
  });

  test("pushFieldContent returns empty string when PATCH response field is null", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => ({
          instanceName: "dev",
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
          password: "pwd",
        }),
      } as unknown as never,
      (async () =>
        new Response(
          JSON.stringify({
            result: {
              script: null,
            },
          }),
          { status: 200 },
        )) as typeof fetch,
    );

    const stored = await service.pushFieldContent(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      {
        localPath: "src/a.js",
        table: "sys_script",
        sysId: "abc",
        fieldName: "script",
        baseHash: "sha256:x",
        updatedAt: new Date().toISOString(),
      },
      "new-content",
    );

    assert.strictEqual(stored, "");
  });

  test("throws when auth is missing for pushFieldContent", async () => {
    const service = new SnPushService(
      {
        resolveConnectionAuth: async () => undefined,
      } as unknown as never,
      fetch,
    );

    await assert.rejects(
      () =>
        service.pushFieldContent(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            localPath: "src/a.js",
            table: "sys_script",
            sysId: "abc",
            fieldName: "script",
            baseHash: "sha256:x",
            updatedAt: new Date().toISOString(),
          },
          "updated-content",
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });
});
