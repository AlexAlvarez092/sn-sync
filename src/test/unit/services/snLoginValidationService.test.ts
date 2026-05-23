import * as assert from "assert";
import * as vscode from "vscode";
import { SnLoginValidationService } from "@services/snLoginValidationService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snLoginValidationService", () => {
  test("throws when no saved auth is configured", async () => {
    const service = new SnLoginValidationService(
      {
        getSavedAuth: async () => undefined,
      } as unknown as never,
      (async () => {
        throw new Error("must not be called");
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.validateLogin(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
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

  test("calls ServiceNow current-user endpoint with basic auth", async () => {
    let requestedUrl: string | undefined;
    let requestedAuthorization: string | undefined;

    const service = new SnLoginValidationService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev1",
          instanceUrl: "https://dev1.service-now.com/",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (
        url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        requestedUrl = url.toString();
        requestedAuthorization = (init?.headers as Record<string, string>)
          ?.Authorization;

        return {
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response;
      }) as typeof fetch,
    );

    await service.validateLogin(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(
      requestedUrl,
      "https://dev1.service-now.com/api/now/ui/user/current",
    );
    assert.strictEqual(
      requestedAuthorization,
      `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
    );
  });

  test("throws invalid credentials message for 401 response", async () => {
    const service = new SnLoginValidationService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev1",
          instanceUrl: "https://dev1.service-now.com",
          username: "admin",
          password: "bad-secret",
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
        service.validateLogin(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
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

  test("throws status-based message for non-auth HTTP errors", async () => {
    const service = new SnLoginValidationService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev1",
          instanceUrl: "https://dev1.service-now.com",
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
        service.validateLogin(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} 500 Internal Server Error`,
        );
        return true;
      },
    );
  });
});
