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
  test("validateAuth uses default requestWithGot transport", async () => {
    const server = http.createServer((request, response) => {
      if (
        request.url?.startsWith(
          "/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id",
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
        authType: "oauth",
        instanceUrl: baseUrl,
        headers: {
          Authorization: "Bearer token-1",
        },
      });

      await service.validateAuth(
        {
          secrets: {
            get: async () => undefined,
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

  test("beginOAuthSignIn builds OAuth URL with PKCE", async () => {
    const service = new SnAuthService({
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    const result = await service.beginOAuthSignIn(
      vscode.Uri.file("/tmp/ws"),
      "https://dev1.service-now.com/path",
      "client-1",
    );

    const parsed = new URL(result.authorizationUrl);
    assert.strictEqual(parsed.pathname, "/oauth_auth.do");
    assert.strictEqual(parsed.searchParams.get("response_type"), "code");
    assert.strictEqual(parsed.searchParams.get("client_id"), "client-1");
    assert.strictEqual(
      parsed.searchParams.get("redirect_uri"),
      "/sdk-oauth.do",
    );
    assert.strictEqual(parsed.searchParams.get("scope"), "openid");
    assert.strictEqual(
      parsed.searchParams.get("code_challenge_method"),
      "S256",
    );
    assert.ok(parsed.searchParams.get("state"));
    assert.ok(parsed.searchParams.get("code_challenge"));
    assert.ok(result.codeVerifier.length > 20);
  });

  test("beginOAuthSignIn rejects invalid instance URL", async () => {
    const service = new SnAuthService({
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    await assert.rejects(
      () =>
        service.beginOAuthSignIn(
          vscode.Uri.file("/tmp/ws"),
          "http://dev1.service-now.com",
          "client-1",
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_INVALID_INSTANCE_URL_PREFIX} Only HTTPS URLs are allowed.`,
        );
        return true;
      },
    );
  });

  test("saveAuth stores basic secret", async () => {
    const authInput: SnAuthInput = {
      authType: "basic",
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    };

    let storedSecretKey: string | undefined;
    let storedSecretValue: string | undefined;

    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    await service.saveAuth(
      {
        secrets: {
          get: async () => undefined,
          store: async (key: string, value: string): Promise<void> => {
            storedSecretKey = key;
            storedSecretValue = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
      authInput,
    );

    assert.strictEqual(
      storedSecretKey,
      `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:dev1`,
    );
    assert.deepStrictEqual(JSON.parse(storedSecretValue ?? "{}"), {
      authType: "basic",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    });
  });

  test("saveAuth stores oauth secret after successful token exchange", async () => {
    let storedSecretValue: string | undefined;

    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const body = String(init?.body ?? "");
      assert.ok(body.includes("grant_type=authorization_code"));
      assert.ok(body.includes("code=code-1"));
      assert.ok(body.includes("client_id=client-1"));
      return new Response(
        JSON.stringify({
          access_token: "at-1",
          token_type: "Bearer",
          refresh_token: "rt-1",
          expires_in: "3600",
          scope: "openid",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    await service.saveAuth(
      {
        secrets: {
          store: async (_key: string, value: string): Promise<void> => {
            storedSecretValue = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/workspace"),
      {
        authType: "oauth",
        instanceName: "dev1",
        instanceUrl: "https://dev1.service-now.com",
        clientId: "client-1",
        authorizationCode: "code-1",
        codeVerifier: "verifier-1",
      },
    );

    const parsed = JSON.parse(storedSecretValue ?? "{}");
    assert.strictEqual(parsed.authType, "oauth");
    assert.strictEqual(parsed.accessToken, "at-1");
    assert.strictEqual(parsed.tokenType, "Bearer");
    assert.strictEqual(parsed.refreshToken, "rt-1");
    assert.strictEqual(parsed.scope, "openid");
    assert.ok(typeof parsed.expiresAt === "number");
  });

  test("saveAuth stores oauth secret when optional token fields are missing", async () => {
    let storedSecretValue: string | undefined;

    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response(
        JSON.stringify({
          access_token: "at-1",
          token_type: "",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    await service.saveAuth(
      {
        secrets: {
          store: async (_key: string, value: string): Promise<void> => {
            storedSecretValue = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/workspace"),
      {
        authType: "oauth",
        instanceName: "dev1",
        instanceUrl: "https://dev1.service-now.com",
        clientId: "client-1",
        authorizationCode: "code-1",
        codeVerifier: "verifier-1",
      },
    );

    const parsed = JSON.parse(storedSecretValue ?? "{}");
    assert.strictEqual(parsed.tokenType, "Bearer");
    assert.strictEqual(parsed.refreshToken, undefined);
    assert.strictEqual(parsed.expiresAt, undefined);
    assert.strictEqual(parsed.scope, undefined);
  });

  test("saveAuth throws invalid credentials on token endpoint 401", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response("{}", {
        status: 401,
        statusText: "Unauthorized",
      })) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
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

  test("saveAuth throws prefixed status error on token endpoint non-ok", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response("{}", {
        status: 500,
        statusText: "Internal Server Error",
      })) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_EXCHANGE_FAILED_PREFIX} 500 Internal Server Error`,
        );
        return true;
      },
    );
  });

  test("saveAuth throws prefixed network error on token request failure", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () => {
      throw new TypeError("net::ERR_EMPTY_RESPONSE");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_EXCHANGE_FAILED_PREFIX} ${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} net::ERR_EMPTY_RESPONSE (https://dev1.service-now.com)`,
        );
        return true;
      },
    );
  });

  test("saveAuth rethrows non-network token request errors", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () => {
      throw new Error("boom");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
        ),
      /boom/,
    );
  });

  test("saveAuth throws for invalid token response payload", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response("not-json", { status: 200 })) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_EXCHANGE_FAILED_PREFIX} Invalid token response payload.`,
        );
        return true;
      },
    );
  });

  test("saveAuth throws when access token is missing in response", async () => {
    const service = new SnAuthService({
      setInstanceName: async () => undefined,
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response(JSON.stringify({ token_type: "Bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await assert.rejects(
      () =>
        service.saveAuth(
          {
            secrets: {
              store: async (): Promise<void> => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
          {
            authType: "oauth",
            instanceName: "dev1",
            instanceUrl: "https://dev1.service-now.com",
            clientId: "client-1",
            authorizationCode: "code-1",
            codeVerifier: "verifier-1",
          },
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_EXCHANGE_FAILED_PREFIX} Missing access token in response.`,
        );
        return true;
      },
    );
  });

  test("getSavedAuth returns undefined for missing/invalid payloads", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    const missingSecret = await service.getSavedAuth(
      {
        secrets: {
          get: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );
    assert.strictEqual(missingSecret, undefined);

    const badShape = await service.getSavedAuth(
      {
        secrets: {
          get: async () => JSON.stringify({ authType: "legacy" }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );
    assert.strictEqual(badShape, undefined);

    const badJson = await service.getSavedAuth(
      {
        secrets: {
          get: async () => "not-json",
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );
    assert.strictEqual(badJson, undefined);

    const nonObject = await service.getSavedAuth(
      {
        secrets: {
          get: async () => "1",
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );
    assert.strictEqual(nonObject, undefined);
  });

  test("getSavedAuth returns undefined when no instance is configured", async () => {
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
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(loadedAuth, undefined);
  });

  test("validateAuth uses resolved headers and handles status errors", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => ({
        statusCode: 500,
        statusMessage: "Internal Server Error",
      })) as unknown as never,
    );

    (
      service as unknown as {
        resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
      }
    ).resolveConnectionAuth = async () => ({
      authType: "oauth",
      instanceUrl: "https://dev1.service-now.com",
      headers: { Authorization: "Bearer token-1" },
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
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} 500 Internal Server Error`,
        );
        return true;
      },
    );
  });

  test("validateAuth handles missing status message and invalid credentials", async () => {
    const serviceMissing = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => ({
        statusCode: 500,
        statusMessage: undefined,
      })) as unknown as never,
    );

    (
      serviceMissing as unknown as {
        resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
      }
    ).resolveConnectionAuth = async () => ({
      authType: "oauth",
      instanceUrl: "https://dev1.service-now.com",
      headers: { Authorization: "Bearer token-1" },
    });

    await assert.rejects(
      () =>
        serviceMissing.validateAuth(
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
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} 500`,
        );
        return true;
      },
    );

    const serviceUnauthorized = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => ({
        statusCode: 401,
        statusMessage: "Unauthorized",
      })) as unknown as never,
    );

    (
      serviceUnauthorized as unknown as {
        resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
      }
    ).resolveConnectionAuth = async () => ({
      authType: "oauth",
      instanceUrl: "https://dev1.service-now.com",
      headers: { Authorization: "Bearer token-1" },
    });

    await assert.rejects(
      () =>
        serviceUnauthorized.validateAuth(
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
          SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS,
        );
        return true;
      },
    );
  });

  test("validateAuth normalizes network errors", async () => {
    const service = new SnAuthService(
      {
        getInstanceName: async () => "dev1",
      } as unknown as never,
      (async () => {
        throw new TypeError("net::ERR_EMPTY_RESPONSE");
      }) as unknown as never,
    );

    (
      service as unknown as {
        resolveConnectionAuth: SnAuthService["resolveConnectionAuth"];
      }
    ).resolveConnectionAuth = async () => ({
      authType: "oauth",
      instanceUrl: "https://dev1.service-now.com",
      headers: { Authorization: "Bearer token-1" },
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
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} net::ERR_EMPTY_RESPONSE (https://dev1.service-now.com)`,
        );
        return true;
      },
    );
  });

  test("resolveConnectionAuth returns basic headers and rejects incomplete basic", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    const resolved = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              authType: "basic",
              instanceUrl: "https://dev1.service-now.com",
              username: "admin",
              password: "secret",
            }),
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(resolved.authType, "basic");
    assert.strictEqual(
      resolved.headers.Authorization,
      buildBasic("admin", "secret"),
    );

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "basic",
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

    (
      service as unknown as {
        getSavedAuth: SnAuthService["getSavedAuth"];
      }
    ).getSavedAuth = async () =>
      ({
        instanceName: "dev1",
        authType: "basic",
        instanceUrl: "https://dev1.service-now.com",
        username: "admin",
      }) as unknown as Awaited<ReturnType<SnAuthService["getSavedAuth"]>>;

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      /No saved sn-sync auth found/,
    );
  });

  test("resolveConnectionAuth returns oauth bearer and refreshes when needed", async () => {
    let storedSecretValue: string | undefined;
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    const resolvedNoRefresh = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              authType: "oauth",
              instanceUrl: "https://dev1.service-now.com",
              clientId: "client-1",
              accessToken: "at-1",
              tokenType: "Bearer",
            }),
          store: async () => {
            throw new Error("must not be called");
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(resolvedNoRefresh.headers.Authorization, "Bearer at-1");

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response(
        JSON.stringify({
          access_token: "at-refreshed",
          token_type: "Bearer",
          refresh_token: "rt-refreshed",
          expires_in: 3600,
          scope: "openid profile",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const resolvedRefresh = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              authType: "oauth",
              instanceUrl: "https://dev1.service-now.com",
              clientId: "client-1",
              accessToken: "at-old",
              tokenType: "Bearer",
              refreshToken: "rt-old",
              expiresAt: Date.now() - 1,
            }),
          store: async (_key: string, value: string): Promise<void> => {
            storedSecretValue = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(
      resolvedRefresh.headers.Authorization,
      "Bearer at-refreshed",
    );
    assert.ok(storedSecretValue);

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response(
        JSON.stringify({
          access_token: "at-refreshed-2",
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const resolvedFallbackRefresh = await service.resolveConnectionAuth(
      {
        secrets: {
          get: async () =>
            JSON.stringify({
              authType: "oauth",
              instanceUrl: "https://dev1.service-now.com",
              clientId: "client-1",
              accessToken: "at-old",
              tokenType: "Bearer",
              refreshToken: "rt-old",
              expiresAt: Date.now() - 1,
              scope: "openid",
            }),
          store: async (): Promise<void> => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
    );

    assert.strictEqual(
      resolvedFallbackRefresh.headers.Authorization,
      "Bearer at-refreshed-2",
    );
  });

  test("resolveConnectionAuth handles oauth refresh failures", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "oauth",
                  instanceUrl: "https://dev1.service-now.com",
                  clientId: "client-1",
                  accessToken: "at-old",
                  tokenType: "Bearer",
                  expiresAt: Date.now() - 1,
                }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          SN_SYNC_MESSAGES.AUTH_OAUTH_REAUTH_REQUIRED,
        );
        return true;
      },
    );

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () =>
      new Response("{}", {
        status: 401,
        statusText: "Unauthorized",
      })) as typeof fetch;

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "oauth",
                  instanceUrl: "https://dev1.service-now.com",
                  clientId: "client-1",
                  accessToken: "at-old",
                  tokenType: "Bearer",
                  refreshToken: "rt-old",
                  expiresAt: Date.now() - 1,
                }),
              store: async () => undefined,
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

    (service as unknown as { fetchApi: typeof fetch }).fetchApi = (async () => {
      throw new TypeError("net::ERR_EMPTY_RESPONSE");
    }) as typeof fetch;

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "oauth",
                  instanceUrl: "https://dev1.service-now.com",
                  clientId: "client-1",
                  accessToken: "at-old",
                  tokenType: "Bearer",
                  refreshToken: "rt-old",
                  expiresAt: Date.now() - 1,
                }),
              store: async () => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      (error: unknown) => {
        assert.strictEqual(
          (error as Error).message,
          `${SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_REFRESH_FAILED_PREFIX} ${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} net::ERR_EMPTY_RESPONSE (https://dev1.service-now.com)`,
        );
        return true;
      },
    );
  });

  test("resolveOAuthSecret omits scope when absent in saved and refreshed tokens", async () => {
    let persistedSecret: string | undefined;
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    (
      service as unknown as {
        shouldRefreshOAuthToken: (expiresAt: number | undefined) => boolean;
      }
    ).shouldRefreshOAuthToken = () => true;

    (
      service as unknown as {
        refreshOAuthToken: (input: {
          instanceUrl: string;
          clientId: string;
          refreshToken: string;
          currentScope?: string;
        }) => Promise<{
          accessToken: string;
          tokenType: string;
          refreshToken?: string;
          expiresAt?: number;
          scope?: string;
        }>;
      }
    ).refreshOAuthToken = async () => ({
      accessToken: "at-refreshed-3",
      tokenType: "Bearer",
      refreshToken: "rt-refreshed-3",
    });

    const resolved = await (
      service as unknown as {
        resolveOAuthSecret: (
          context: vscode.ExtensionContext,
          workspaceFolderUri: vscode.Uri,
          instanceName: string,
          savedAuth: {
            authType: "oauth";
            instanceUrl: string;
            clientId: string;
            accessToken: string;
            tokenType: string;
            refreshToken?: string;
            expiresAt?: number;
            scope?: string;
          },
          instanceUrl: string,
        ) => Promise<{
          authType: "oauth";
          instanceUrl: string;
          clientId: string;
          accessToken: string;
          tokenType: string;
          refreshToken?: string;
          expiresAt?: number;
          scope?: string;
        }>;
      }
    ).resolveOAuthSecret(
      {
        secrets: {
          store: async (_key: string, value: string): Promise<void> => {
            persistedSecret = value;
          },
        },
      } as unknown as vscode.ExtensionContext,
      vscode.Uri.file("/tmp/ws"),
      "dev1",
      {
        authType: "oauth",
        instanceUrl: "https://dev1.service-now.com",
        clientId: "client-1",
        accessToken: "at-old",
        tokenType: "Bearer",
        refreshToken: "rt-old",
        expiresAt: Date.now() - 1,
      },
      "https://dev1.service-now.com",
    );

    assert.strictEqual(resolved.accessToken, "at-refreshed-3");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(resolved, "scope"),
      false,
    );
    assert.ok(persistedSecret);
    const parsedPersisted = JSON.parse(persistedSecret ?? "{}");
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(parsedPersisted, "scope"),
      false,
    );
  });

  test("resolveConnectionAuth rejects invalid and incomplete payloads", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () => JSON.stringify({ authType: "legacy" }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      /No saved sn-sync auth found/,
    );

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "oauth",
                  instanceUrl: "https://dev1.service-now.com",
                  clientId: "client-1",
                  tokenType: "Bearer",
                }),
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      /No saved sn-sync auth found/,
    );

    (
      service as unknown as {
        getSavedAuth: SnAuthService["getSavedAuth"];
      }
    ).getSavedAuth = async () =>
      ({
        instanceName: "dev1",
        authType: "oauth",
        instanceUrl: "https://dev1.service-now.com",
        clientId: "client-1",
        tokenType: "Bearer",
      }) as unknown as Awaited<ReturnType<SnAuthService["getSavedAuth"]>>;

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () => undefined,
            },
          } as unknown as vscode.ExtensionContext,
          vscode.Uri.file("/tmp/ws"),
        ),
      /No saved sn-sync auth found/,
    );
  });

  test("resolveConnectionAuth rejects non-allowed custom host", async () => {
    const service = new SnAuthService({
      getInstanceName: async () => "dev1",
      getPreferences: async () => ({
        rootDir: "src",
        pull: { clearBeforePull: "ask" },
        auth: {
          allowCustomHosts: false,
          customHosts: [],
        },
      }),
    } as unknown as never);

    await assert.rejects(
      () =>
        service.resolveConnectionAuth(
          {
            secrets: {
              get: async () =>
                JSON.stringify({
                  authType: "basic",
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

  test("resetAuth deletes active instance secret and skips when no instance", async () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    let deletedKey: string | undefined;

    const serviceDelete = new SnAuthService({
      getInstanceName: async () => "dev1",
    } as unknown as never);

    await serviceDelete.resetAuth(
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

    let deleteCalls = 0;
    const serviceSkip = new SnAuthService({
      getInstanceName: async () => undefined,
    } as unknown as never);

    await serviceSkip.resetAuth(
      {
        secrets: {
          delete: async (): Promise<void> => {
            deleteCalls += 1;
          },
        },
      } as unknown as vscode.ExtensionContext,
      workspaceFolderUri,
    );

    assert.strictEqual(deleteCalls, 0);
  });
});

function buildBasic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`;
}
