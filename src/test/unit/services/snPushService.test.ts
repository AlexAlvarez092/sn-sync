import * as assert from "assert";
import * as vscode from "vscode";
import { SnPushService } from "@services/snPushService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snPushService", () => {
  test("returns remote field content", async () => {
    const service = new SnPushService(
      {
        getSavedAuth: async () => ({
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
        getSavedAuth: async () => ({
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
        getSavedAuth: async () => undefined,
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

  test("returns empty remote field content when ServiceNow field is null", async () => {
    const service = new SnPushService(
      {
        getSavedAuth: async () => ({
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

  test("throws when auth is missing for pushFieldContent", async () => {
    const service = new SnPushService(
      {
        getSavedAuth: async () => undefined,
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
