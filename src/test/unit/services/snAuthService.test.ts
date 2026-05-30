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

      (
        service as unknown as {
          resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
        }
      ).resolveConnectionAuth = async () => ({
        instanceUrl: baseUrl,
        headers: {
          Authorization: `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
        },
        username: "admin",
      });

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

  test("saveAuth normalizes instanceUrl before storing", async () => {
    const authInput: SnAuthInput = {
      instanceName: "dev1",
      instanceUrl: "https://Dev1.Service-Now.com/anything?q=1",
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
    });
  });

  test("saveAuth rejects invalid instance URL before persisting", async () => {
    let setInstanceCalled = false;
    let storeCalled = false;

    const service = new SnAuthService({
      setInstanceName: async () => {
        setInstanceCalled = true;
      },
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => {
                storeCalled = true;
              },
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/workspace"),
          {
            instanceName: "dev1",
            instanceUrl: "http://dev1.service-now.com",
            username: "admin",
            password: "secret",
          },
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Only HTTPS URLs are allowed.`,
        );
        return true;
      },
    );

    assert.strictEqual(setInstanceCalled, false);
    assert.strictEqual(storeCalled, false);
  });

  test("saveAuth overwrites stored secret with basic auth only", async () => {
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

  test("validateAuth throws when resolved connection username is blank", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        throw new Error("must not be called");
      }) as unknown as never,
    );

    (
      service as unknown as {
        resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
      }
    ).resolveConnectionAuth = async () => ({
      instanceUrl: "https://dev1.service-now.com",
      headers: {
        Authorization: "Basic dGVzdDp0ZXN0",
      },
      username: "   ",
    });

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

  test("resolveConnectionAuth returns basic auth headers", async () => {
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

  test("resolveConnectionAuth throws when saved auth omits username and password", async () => {
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
                  username: "admin",
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

  test("resolveConnectionAuth rejects stored instance URL outside default host policy", async () => {
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
                  instanceUrl: "https://sn.example.net",
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
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Host is not allowed. Enable 'sn-sync.auth.allowCustomHosts' and add the exact hostname to 'sn-sync.auth.customHosts'.`,
        );
        return true;
      },
    );
  });

  test("resolveConnectionAuth allows configured custom host when policy opt-in is enabled", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: true,
          customHosts: ["sn.example.net"],
        },
      }),
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              instanceUrl: "https://SN.example.net/path",
              username: "admin",
              password: "secret",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(resolved.instanceUrl, "https://sn.example.net");
    assert.strictEqual(
      resolved.headers.Authorization,
      `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
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
