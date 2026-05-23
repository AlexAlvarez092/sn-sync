import * as assert from "assert";
import * as vscode from "vscode";
import { SnActivationDataService } from "@services/snActivationDataService.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snActivationDataService", () => {
  test("lists scoped applications from ServiceNow", async () => {
    const service = new SnActivationDataService(
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
          ok: true,
          json: async () => ({
            result: [
              { sys_id: "app-1", name: "My App", scope: "x_company_app" },
              {
                sys_id: "app-2",
                name: "Another App",
                scope: "x_company_another",
              },
            ],
          }),
        } as Response;
      }) as typeof fetch,
    );

    const apps = await service.listScopedApplications(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(apps, [
      { sys_id: "app-1", name: "My App", scope: "x_company_app" },
      {
        sys_id: "app-2",
        name: "Another App",
        scope: "x_company_another",
      },
    ]);
  });

  test("filters update sets by app when app is not global", async () => {
    let requestedUrl: string | undefined;

    const service = new SnActivationDataService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev1",
          instanceUrl: "https://dev1.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (url: string | URL | Request): Promise<Response> => {
        requestedUrl = url.toString();
        return {
          ok: true,
          json: async () => ({
            result: [{ sys_id: "us-1", name: "Update Set 1" }],
          }),
        } as Response;
      }) as typeof fetch,
    );

    const updateSets = await service.listInProgressUpdateSets(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      "app-sys-id",
    );

    assert.deepStrictEqual(updateSets, [
      { sys_id: "us-1", name: "Update Set 1" },
    ]);
    assert.ok(
      requestedUrl?.includes(
        "sysparm_query=state%3Din%20progress%5Eapplication%3Dapp-sys-id",
      ),
    );
  });

  test("filters global update sets by application=global", async () => {
    let requestedUrl: string | undefined;

    const service = new SnActivationDataService(
      {
        getSavedAuth: async () => ({
          instanceName: "dev1",
          instanceUrl: "https://dev1.service-now.com",
          username: "admin",
          password: "secret",
        }),
      } as unknown as never,
      (async (url: string | URL | Request): Promise<Response> => {
        requestedUrl = url.toString();
        return {
          ok: true,
          json: async () => ({
            result: [{ sys_id: "us-global", name: "Global Update Set" }],
          }),
        } as Response;
      }) as typeof fetch,
    );

    await service.listInProgressUpdateSets(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      "global",
    );

    assert.ok(
      requestedUrl?.includes(
        "sysparm_query=state%3Din%20progress%5Eapplication%3Dglobal",
      ),
    );
  });

  test("throws status-based message for non-auth HTTP errors", async () => {
    const service = new SnActivationDataService(
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
        service.listScopedApplications(
          {} as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.ACTIVATE_STATUS_HTTP_STATUS_PREFIX} 500 Internal Server Error`,
        );
        return true;
      },
    );
  });

  test("returns empty array when payload result is not an array", async () => {
    const service = new SnActivationDataService(
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
          ok: true,
          json: async () => ({ result: null }),
        } as Response;
      }) as typeof fetch,
    );

    const apps = await service.listScopedApplications(
      {} as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(apps, []);
  });

  test("returns invalid credentials error on 401", async () => {
    const service = new SnActivationDataService(
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
        service.listScopedApplications(
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

  test("throws when saved auth is missing", async () => {
    const service = new SnActivationDataService(
      {
        getSavedAuth: async () => undefined,
      } as unknown as never,
      (async () => {
        throw new Error("must not be called");
      }) as typeof fetch,
    );

    await assert.rejects(
      () =>
        service.listScopedApplications(
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
});
