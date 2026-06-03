import * as assert from "assert";
import * as http from "node:http";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  buildServiceNowTableApiUrl,
  buildBasicAuthHeader,
  createGotFetchTransport,
  handleHttpError,
  normalizeInstanceUrl,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";

suite("snHttpService", () => {
  test("normalizeInstanceUrl trims trailing slashes", () => {
    assert.strictEqual(
      normalizeInstanceUrl("https://dev.service-now.com///"),
      "https://dev.service-now.com",
    );
  });

  test("buildBasicAuthHeader returns base64 basic auth header", () => {
    assert.strictEqual(
      buildBasicAuthHeader("admin", "secret"),
      `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
    );
  });

  test("buildServiceNowTableApiUrl encodes query params and dynamic path segments", () => {
    const url = buildServiceNowTableApiUrl(
      "https://dev.service-now.com/",
      "sys?script",
      {
        pathSegments: [{ value: "abc#123", label: "sys_id" }],
        queryParams: {
          sysparm_fields: "sys_scope,name",
          sysparm_limit: 1,
          sysparm_offset: undefined,
        },
      },
    );

    assert.strictEqual(
      url,
      "https://dev.service-now.com/api/now/table/sys%3Fscript/abc%23123?sysparm_fields=sys_scope%2Cname&sysparm_limit=1",
    );
  });

  test("buildServiceNowTableApiUrl returns base table url when options are omitted", () => {
    const url = buildServiceNowTableApiUrl(
      "https://dev.service-now.com/",
      "sys_script",
    );

    assert.strictEqual(url, "https://dev.service-now.com/api/now/table/sys_script");
  });

  test("buildServiceNowTableApiUrl rejects unsafe path segments", () => {
    assert.throws(
      () =>
        buildServiceNowTableApiUrl("https://dev.service-now.com", "../sys", {
          pathSegments: [{ value: "abc", label: "sys_id" }],
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.SN_REQUEST_INVALID_PATH_SEGMENT_PREFIX} table name.`,
    );

    assert.throws(
      () =>
        buildServiceNowTableApiUrl(
          "https://dev.service-now.com",
          "sys_script",
          {
            pathSegments: [{ value: "bad/control\n", label: "sys_id" }],
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.SN_REQUEST_INVALID_PATH_SEGMENT_PREFIX} sys_id.`,
    );
  });

  test("resolveConnectionHeaders uses explicit headers when provided", () => {
    const headers = resolveConnectionHeaders({
      headers: {
        Authorization: "Bearer x",
      },
      username: "admin",
      password: "secret",
    });

    assert.deepStrictEqual(headers, {
      Authorization: "Bearer x",
    });
  });

  test("resolveConnectionHeaders builds basic auth from username/password", () => {
    const headers = resolveConnectionHeaders({
      username: "admin",
      password: "secret",
    });

    assert.deepStrictEqual(headers, {
      Authorization: `Basic ${Buffer.from("admin:secret", "utf-8").toString("base64")}`,
    });
  });

  test("resolveConnectionHeaders throws when no connection input is provided", () => {
    assert.throws(
      () => resolveConnectionHeaders(undefined),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });

  test("resolveConnectionHeaders throws when credentials are incomplete", () => {
    assert.throws(
      () =>
        resolveConnectionHeaders({
          username: "admin",
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED,
    );
  });

  test("handleHttpError allows successful responses", () => {
    assert.doesNotThrow(() =>
      handleHttpError(new Response("{}", { status: 200 }), "prefix"),
    );
  });

  test("handleHttpError maps 401 to invalid credentials", () => {
    assert.throws(
      () =>
        handleHttpError(
          new Response("{}", { status: 401, statusText: "Unauthorized" }),
          SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS,
    );
  });

  test("handleHttpError keeps 403 as status-based error", () => {
    assert.throws(
      () =>
        handleHttpError(
          new Response("{}", { status: 403, statusText: "Forbidden" }),
          SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX} 403 Forbidden`,
    );
  });

  test("handleHttpError formats non-auth HTTP status messages", () => {
    assert.throws(
      () =>
        handleHttpError(
          new Response("{}", {
            status: 500,
            statusText: "Internal Server Error",
          }),
          SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX} 500 Internal Server Error`,
    );
  });

  test("createGotFetchTransport performs GET with default method", async () => {
    let receivedMethod: string | undefined;
    let receivedHeader: string | undefined;

    const server = http.createServer((request, response) => {
      receivedMethod = request.method;
      receivedHeader = request.headers["x-test"] as string | undefined;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/ping`;

    try {
      const gotFetch = createGotFetchTransport();
      const response = await gotFetch(url, {
        headers: new Headers({ "X-Test": "one" }),
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(receivedMethod, "GET");
      assert.strictEqual(receivedHeader, "one");
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

  test("createGotFetchTransport supports calls without init", async () => {
    let receivedMethod: string | undefined;

    const server = http.createServer((request, response) => {
      receivedMethod = request.method;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/no-init`;

    try {
      const gotFetch = createGotFetchTransport();
      const response = await gotFetch(url);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(receivedMethod, "GET");
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

  test("createGotFetchTransport preserves explicit method and body", async () => {
    let receivedMethod: string | undefined;
    let receivedBody = "";
    let receivedHeader: string | undefined;

    const server = http.createServer((request, response) => {
      receivedMethod = request.method;
      receivedHeader = request.headers["x-array"] as string | undefined;
      request.on("data", (chunk) => {
        receivedBody += chunk.toString();
      });
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/patch`;

    try {
      const gotFetch = createGotFetchTransport();
      const response = await gotFetch(url, {
        method: "patch",
        headers: [["x-array", "ok"]],
        body: '{"x":1}',
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(receivedMethod, "PATCH");
      assert.strictEqual(receivedHeader, "ok");
      assert.strictEqual(receivedBody, '{"x":1}');
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

  test("createGotFetchTransport normalizes object headers and non-string body", async () => {
    let receivedMethod: string | undefined;
    let receivedBody = "";
    let receivedHeader: string | undefined;

    const server = http.createServer((request, response) => {
      receivedMethod = request.method;
      receivedHeader = request.headers["x-plain"] as string | undefined;
      request.on("data", (chunk) => {
        receivedBody += chunk.toString();
      });
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address === "object");

    try {
      const gotFetch = createGotFetchTransport();
      const response = await gotFetch(
        new URL(`http://127.0.0.1:${address.port}/post`),
        {
          method: "post",
          headers: { "x-plain": "yes" },
          body: new URLSearchParams({ foo: "bar" }),
        },
      );

      assert.strictEqual(response.status, 200);
      assert.strictEqual(receivedMethod, "POST");
      assert.strictEqual(receivedHeader, "yes");
      assert.strictEqual(receivedBody, "foo=bar");
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
});
