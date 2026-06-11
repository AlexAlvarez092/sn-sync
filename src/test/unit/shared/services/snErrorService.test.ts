import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildCommandErrorMessage,
  logCommandErrorDiagnostic,
  normalizeCommandError,
  resetDiagnosticsChannelForTests,
} from "@shared/services/snErrorService.js";

suite("snErrorService", () => {
  setup(() => {
    resetDiagnosticsChannelForTests();
  });

  test("normalizes command error with explicit category and redacts sensitive context", () => {
    const context: Record<string, unknown> = {
      table: "sys_script",
      token: "abc123",
      nested: {
        Authorization: "Bearer secret",
        safe: true,
      },
      list: [{ cookie: "x" }, "ok"],
    };

    const diagnostic = normalizeCommandError(new Error("boom"), {
      code: "SN_TEST",
      command: "sn-sync.test",
      category: "network",
      context,
    });

    assert.strictEqual(diagnostic.code, "SN_TEST");
    assert.strictEqual(diagnostic.command, "sn-sync.test");
    assert.strictEqual(diagnostic.category, "network");
    assert.strictEqual(diagnostic.message, "boom");
    assert.ok(diagnostic.timestamp.length > 0);
    assert.strictEqual(diagnostic.context?.token, "[REDACTED]");
    assert.deepStrictEqual(diagnostic.context?.nested, {
      Authorization: "[REDACTED]",
      safe: true,
    });
    assert.deepStrictEqual(diagnostic.context?.list, [
      { cookie: "[REDACTED]" },
      "ok",
    ]);
  });

  test("infers categories from error messages", () => {
    assert.strictEqual(
      normalizeCommandError(new Error("401 unauthorized credentials"), {
        code: "SN_A",
        command: "sn-sync.test",
      }).category,
      "auth",
    );

    assert.strictEqual(
      normalizeCommandError(new Error("remote conflict against baseline"), {
        code: "SN_B",
        command: "sn-sync.test",
      }).category,
      "conflict",
    );

    assert.strictEqual(
      normalizeCommandError(new Error("network timeout econnreset"), {
        code: "SN_C",
        command: "sn-sync.test",
      }).category,
      "network",
    );

    assert.strictEqual(
      normalizeCommandError(new Error("missing required field"), {
        code: "SN_D",
        command: "sn-sync.test",
      }).category,
      "validation",
    );

    assert.strictEqual(
      normalizeCommandError(new Error("random failure"), {
        code: "SN_E",
        command: "sn-sync.test",
      }).category,
      "unknown",
    );
  });

  test("handles unknown error values and circular context", () => {
    const circular: Record<string, unknown> = {
      password: "pwd",
    };
    circular.self = circular;

    const diagnostic = normalizeCommandError("not-an-error", {
      code: "SN_UNKNOWN",
      command: "sn-sync.test",
      context: circular,
    });

    assert.strictEqual(diagnostic.message, "Unknown error");
    assert.strictEqual(diagnostic.category, "unknown");
    assert.strictEqual(diagnostic.context?.password, "[REDACTED]");
    assert.strictEqual(diagnostic.context?.self, "[Circular]");
  });

  test("sanitizes nullish values and non-object context values", () => {
    const diagnostic = normalizeCommandError(new Error("boom"), {
      code: "SN_SANITIZE",
      command: "sn-sync.test",
      context: {
        nullable: null,
        undef: undefined,
        fn: () => "x",
      },
    });

    assert.strictEqual(diagnostic.context?.nullable, null);
    assert.strictEqual(diagnostic.context?.undef, undefined);
    assert.strictEqual(typeof diagnostic.context?.fn, "string");
  });

  test("redacts sensitive values even when context keys are not sensitive", () => {
    const diagnostic = normalizeCommandError(new Error("boom"), {
      code: "SN_REDACT_VALUES",
      command: "sn-sync.test",
      context: {
        authHeader: "Bearer top-secret-token",
        callbackUrl:
          "https://example.net/callback?access_token=secret-token-value",
        jwtLike:
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart",
        safe: "hello",
      },
    });

    assert.strictEqual(diagnostic.context?.authHeader, "[REDACTED]");
    assert.strictEqual(diagnostic.context?.callbackUrl, "[REDACTED]");
    assert.strictEqual(diagnostic.context?.jwtLike, "[REDACTED]");
    assert.strictEqual(diagnostic.context?.safe, "hello");
  });

  test("builds user message from prefix and diagnostic", () => {
    const message = buildCommandErrorMessage("failed:", {
      code: "SN_X",
      command: "sn-sync.test",
      category: "unknown",
      message: "boom",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    assert.strictEqual(message, "failed: (SN_X) boom");
  });

  test("logs diagnostic via output channel and reuses channel", () => {
    const lines: string[] = [];
    const windowObject = vscode.window as unknown as {
      createOutputChannel: (
        name: string,
      ) => Pick<vscode.OutputChannel, "appendLine">;
    };
    const originalCreateOutputChannel = windowObject.createOutputChannel;
    let createCalls = 0;

    windowObject.createOutputChannel = (name: string) => {
      createCalls += 1;
      assert.strictEqual(name, "sn-sync diagnostics");
      return {
        appendLine: (line: string) => {
          lines.push(line);
        },
      };
    };

    try {
      const diagnostic = {
        code: "SN_LOG",
        command: "sn-sync.test",
        category: "unknown" as const,
        message: "boom",
        timestamp: "2026-01-01T00:00:00.000Z",
      };

      logCommandErrorDiagnostic(diagnostic);
      logCommandErrorDiagnostic(diagnostic);

      assert.strictEqual(createCalls, 1);
      assert.strictEqual(lines.length, 2);
      assert.ok(lines[0].includes('"code":"SN_LOG"'));
    } finally {
      windowObject.createOutputChannel = originalCreateOutputChannel;
      resetDiagnosticsChannelForTests();
    }
  });

  test("ignores logging when output channel creation fails", () => {
    const windowObject = vscode.window as unknown as {
      createOutputChannel: (
        name: string,
      ) => Pick<vscode.OutputChannel, "appendLine">;
    };
    const originalCreateOutputChannel = windowObject.createOutputChannel;

    windowObject.createOutputChannel = () => {
      throw new Error("cannot-create-channel");
    };

    try {
      logCommandErrorDiagnostic({
        code: "SN_NO_CHANNEL",
        command: "sn-sync.test",
        category: "unknown",
        message: "boom",
        timestamp: "2026-01-01T00:00:00.000Z",
      });
    } finally {
      windowObject.createOutputChannel = originalCreateOutputChannel;
      resetDiagnosticsChannelForTests();
    }
  });
});
