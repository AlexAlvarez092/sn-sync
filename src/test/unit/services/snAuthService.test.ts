import * as assert from "assert";
import * as http from "node:http";
import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SECRET_KEYS,
} from "@shared/constants/snSyncConstants.js";
import type { SnAuthInput } from "@shared/models/auth.js";

suite("snAuthService", () => {
  test("validateAuth uses got transport successfully against local server", async () => {
    const server = http.createServer((request, response) => {
      if (
        request.url?.startsWith(
          "/api/now/v2/table/sys_user?user_name=admin&sysparm_fields=user_name,name",
        )
      ) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ result: [] }));
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({}));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const service = new SnAuthService({
        getInstanceName: async () => "dev1",
      } as unknown as never);

      await service.validateAuth(
        {
          secrets: {
            get: async () =>
              JSON.stringify({
                instanceUrl: baseUrl,
                username: "admin",
                password: "secret",
              }),
          },
        } as unknown as vscode.ExtensionContext,
        vscode.Uri.file("/tmp/ws"),
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

  test("stores instance name in config service and credentials in secret storage", async () => {
    const authInput: SnAuthInput = {
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    };
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    let savedInstanceName: string | undefined;
    let savedWorkspaceUri: vscode.Uri | undefined;
    let storedSecretKey: string | undefined;
    let storedSecretValue: string | undefined;

    const configService = {
      setInstanceName: async (
        currentWorkspaceUri: vscode.Uri,
        instanceName: string,
      ): Promise<void> => {
        savedWorkspaceUri = currentWorkspaceUri;
        savedInstanceName = instanceName;
      },
      getInstanceName: async () => authInput.instanceName,
    };
    const context = {
      secrets: {
        get: async () => undefined,
        store: async (key: string, value: string): Promise<void> => {
          storedSecretKey = key;
          storedSecretValue = value;
        },
      },
    } as unknown as vscode.ExtensionContext;

    const service = new SnAuthService(configService as unknown as never);

    await service.saveAuth(context, workspaceFolderUri, authInput);

    assert.strictEqual(
      savedWorkspaceUri?.toString(),
      workspaceFolderUri.toString(),
    );
    assert.strictEqual(savedInstanceName, authInput.instanceName);
    assert.strictEqual(
      storedSecretKey,
      `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:${authInput.instanceName}`,
    );
    assert.deepStrictEqual(JSON.parse(storedSecretValue ?? "{}"), {
      instanceUrl: authInput.instanceUrl,
      username: authInput.username,
      password: authInput.password,
    });
  });

  test("saveAuth preserves previously stored session/bearer auth fields", async () => {
    const authInput: SnAuthInput = {
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    };

    let storedSecretValue: string | undefined;

    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await service.saveAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              bearer: "token-1",
              userToken: "ut-1",
              cookie: "JSESSIONID=abc",
            }),
          store: async (_key: string, value: string): Promise<void> => {
            storedSecretValue = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/workspace"),
      authInput,
    );

    assert.deepStrictEqual(JSON.parse(storedSecretValue ?? "{}"), {
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
      bearer: "token-1",
      userToken: "ut-1",
      cookie: "JSESSIONID=abc",
    });
  });

  test("returns saved auth when instance config and secret exist", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              username: "admin",
              password: "secret",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.deepStrictEqual(loadedAuth, {
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    });
  });

  test("returns undefined when secret payload is invalid", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () => '{"instanceUrl":"https://x"}',
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("returns undefined when no instance name is configured", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => undefined,
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () => {
            throw new Error("must not be called");
          },
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("returns undefined when secret does not exist", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("returns undefined when secret value is not valid json", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () => "not-json",
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("returns undefined when secret json is not an object", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const loadedAuth = await service.getSavedAuth(
      {
        secrets: {
          get: async () => '"plain-string"',
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("validateAuth throws when no saved auth is configured", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => undefined,
      } as unknown as never,
      (async () => {
        throw new Error("must not be called");
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () => undefined,
            },
          } as unknown as vscode.ExtensionContext,
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

  test("validateAuth calls ServiceNow sys_user table endpoint with basic auth", async () => {
    let requestedUrl: string | undefined;
    let requestedAuthorization: string | undefined;

    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async (
        url: string,
        options: {
          headers: Record<string, string>;
        },
      ) => {
        requestedUrl = url;
        requestedAuthorization = options.headers.Authorization;

        return {
          statusCode: 200,
          statusMessage: "OK",
        };
      }) as unknown as never,
    );

    await service.validateAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com/",
              username: "admin",
              password: "secret",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(
      requestedUrl,
      "https://dev1.service-now.com/api/now/v2/table/sys_user?user_name=admin&sysparm_fields=user_name,name",
    );
    assert.strictEqual(
      requestedAuthorization,
      `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
    );
  });

  test("validateAuth throws invalid credentials message for 401 response", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        return {
          statusCode: 401,
          statusMessage: "Unauthorized",
        };
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  username: "admin",
                  password: "bad-secret",
                }),
            },
          } as unknown as vscode.ExtensionContext,
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

  test("validateAuth throws status-based message for non-auth HTTP errors", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        return {
          statusCode: 500,
          statusMessage: "Internal Server Error",
        };
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  username: "admin",
                  password: "secret",
                }),
            },
          } as unknown as vscode.ExtensionContext,
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

  test("validateAuth throws normalized message for fetch/network errors", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        const error = new TypeError("net::ERR_EMPTY_RESPONSE");
        throw error;
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  username: "admin",
                  password: "secret",
                }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} net::ERR_EMPTY_RESPONSE (https://dev1.service-now.com)`,
        );
        return true;
      },
    );
  });

  test("validateAuth normalizes ERR_EMPTY_RESPONSE from generic Error", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        throw new Error("net::ERR_EMPTY_RESPONSE");
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  username: "admin",
                  password: "secret",
                }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} net::ERR_EMPTY_RESPONSE (https://dev1.service-now.com)`,
        );
        return true;
      },
    );
  });

  test("validateAuth uses admin fallback when username is missing", async () => {
    let requestedUrl: string | undefined;

    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async (url: string) => {
        requestedUrl = url;
        return {
          statusCode: 200,
          statusMessage: "OK",
        };
      }) as unknown as never,
    );

    await service.validateAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              bearer: "my-token",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.ok(
      requestedUrl?.includes(
        "/api/now/v2/table/sys_user?user_name=admin&sysparm_fields=user_name,name",
      ),
    );
  });

  test("validateAuth handles missing status text in non-auth HTTP errors", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        return {
          statusCode: 500,
          statusMessage: undefined as unknown as string,
        };
      }) as unknown as never,
    );

    await assert.rejects(
      () =>
        service.validateAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  username: "admin",
                  password: "secret",
                }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} 500`,
        );
        return true;
      },
    );
  });

  test("resolveConnectionAuth prioritizes user token and cookie over bearer and basic", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              username: "admin",
              password: "secret",
              userToken: "token-123",
              cookie: "JSESSIONID=abc",
              bearer: "bearer-should-not-be-used",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(resolved.headers, {
      "X-UserToken": "token-123",
      Cookie: "JSESSIONID=abc",
    });
    assert.strictEqual(resolved.username, "admin");
  });

  test("resolveConnectionAuth uses bearer when session headers are not configured", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              username: "admin",
              password: "secret",
              bearer: "my-token",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(resolved.headers, {
      Authorization: "Bearer my-token",
    });
    assert.strictEqual(resolved.username, "admin");
  });

  test("resolveConnectionAuth supports session auth with only user token", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              userToken: "token-only",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(resolved.headers, {
      "X-UserToken": "token-only",
    });
  });

  test("resolveConnectionAuth supports session auth with only cookie", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              cookie: "JSESSIONID=only-cookie",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(resolved.headers, {
      Cookie: "JSESSIONID=only-cookie",
    });
  });

  test("resolveConnectionAuth keeps bearer prefix when already present", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              bearer: "Bearer prefixed-token",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.deepStrictEqual(resolved.headers, {
      Authorization: "Bearer prefixed-token",
    });
  });

  test("resolveConnectionAuth falls back to basic auth when advanced auth is missing", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://dev1.service-now.com",
              username: "admin",
              password: "secret",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(
      resolved.headers.Authorization,
      `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
    );
    assert.strictEqual(resolved.username, "admin");
  });

  test("resolveConnectionAuth throws when instanceUrl exists but no auth method is available", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                }),
            },
          } as unknown as vscode.ExtensionContext,
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

  test("resolveConnectionAuth throws when advanced auth values are blank strings", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  instanceUrl: "https://dev1.service-now.com",
                  userToken: "   ",
                }),
            },
          } as unknown as vscode.ExtensionContext,
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

  test("resetAuth deletes active instance secret", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    let deletedKey: string | undefined;

    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await service.resetAuth(
      {
        secrets: {
          delete: async (key: string): Promise<void> => {
            deletedKey = key;
          },
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(
      deletedKey,
      `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:dev1`,
    );
  });

  test("resetAuth skips deletion when no instance is configured", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => undefined,
    } as unknown as never);

    let deleteCalls = 0;

    await service.resetAuth(
      {
        secrets: {
          delete: async (): Promise<void> => {
            deleteCalls += 1;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/workspace"),
    );

    assert.strictEqual(deleteCalls, 0);
  });
});
