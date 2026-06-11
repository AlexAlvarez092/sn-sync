import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  formatConflictList,
  formatConflictSummary,
  flushScheduledTempMergeCleanup,
  resolvePushConflictInteractive,
} from "@shared/services/snPushConflictResolutionService.js";

suite("snPushConflictResolutionService", () => {
  test("formats conflict list and summary", () => {
    assert.strictEqual(formatConflictList(["a", "b"]), "a, b");
    assert.strictEqual(
      formatConflictList(["a", "b", "c", "d", "e", "f"]),
      "a, b, c, d, e (+1 more)",
    );

    assert.strictEqual(
      formatConflictSummary({
        conflicts: 0,
        overwrite: 0,
        merged: 0,
        discarded: 0,
        skipped: 0,
      }),
      "",
    );

    assert.strictEqual(
      formatConflictSummary({
        conflicts: 3,
        overwrite: 1,
        merged: 1,
        discarded: 1,
        skipped: 0,
      }),
      " Conflicts: 3. Overwrite: 1. Merged: 1. Discarded: 1. Skipped: 0.",
    );
  });

  test("returns skip when conflict picker is dismissed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => undefined,
      },
      async ({ executeCalls, workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
        assert.ok(executeCalls.some((call) => call.command === "vscode.diff"));
      },
    );
  });

  test("returns overwrite when overwrite option is selected", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "overwriteRemote" }),
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "overwriteRemote" });
      },
    );
  });

  test("returns discardLocal only when discard is confirmed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "discardLocal" }),
        showWarningMessage: async () => "Discard local",
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "discardLocal" });
      },
    );

    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "discardLocal" }),
        showWarningMessage: async () => undefined,
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
      },
    );
  });

  test("returns skip when merge editor opens but user skips pushing merged", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Skip file",
      },
      async ({ executeCalls, workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
        assert.ok(
          executeCalls.some((call) => call.command === "_open.mergeEditor"),
        );
        assert.strictEqual(
          executeCalls.filter((call) => call.command === "_open.mergeEditor")
            .length,
          1,
        );
      },
    );
  });

  test("returns merge result and saves dirty document when merge is confirmed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Push merged",
        mergeDocumentDirty: true,
        initialLocalFileContent: "merged-from-editor",
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, {
          kind: "merge",
          mergedContent: "merged-from-editor",
        });
      },
    );
  });

  test("does not delete merge temp files immediately after opening merge editor", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Skip file",
      },
      async ({ executeCalls, workspaceFolderUri }) => {
        await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.strictEqual(
          executeCalls.filter((call) => call.command === "_open.mergeEditor")
            .length,
          1,
        );
        assert.strictEqual(
          executeCalls.filter((call) => call.command === "vscode.diff").length,
          1,
        );
      },
    );
  });

  test("falls back to conflict markers when merge editor cannot open", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Push merged",
        failMergeEditor: true,
      },
      async ({ workspaceFolderUri, localFileUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, {
          kind: "merge",
          mergedContent: [
            "<<<<<<< LOCAL",
            "local",
            "=======",
            "remote",
            ">>>>>>> REMOTE",
            "",
          ].join("\n"),
        });

        assert.ok(
          (await fs.readFile(localFileUri.fsPath, "utf8")).includes(
            "<<<<<<< LOCAL",
          ),
        );
      },
    );
  });

  test("fallback keeps original content when local and remote are equal", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Push merged",
        failMergeEditor: true,
      },
      async ({ workspaceFolderUri, localFileUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "same-content",
          },
          remoteContent: "same-content",
        });

        assert.deepStrictEqual(result, {
          kind: "merge",
          mergedContent: "same-content",
        });
        assert.strictEqual(
          await fs.readFile(localFileUri.fsPath, "utf8"),
          "same-content",
        );
      },
    );
  });

  test("deferred cleanup tolerates temp-path mutations", async () => {
    const previousDelay = process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
    process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = "60000";

    try {
      await withPatchedConflictUi(
        {
          showQuickPick: async () => ({ value: "overwriteRemote" }),
        },
        async ({ executeCalls, workspaceFolderUri }) => {
          const result = await resolvePushConflictInteractive({
            workspaceFolderUri,
            candidate: {
              localPath: "a.js",
              localContent: "local",
            },
            remoteContent: "remote",
          });

          assert.deepStrictEqual(result, { kind: "overwriteRemote" });

          const diffCall = executeCalls.find(
            (call) => call.command === "vscode.diff",
          );
          assert.ok(diffCall);
          const remoteTempUri = diffCall?.args[0] as vscode.Uri;

          await fs.rm(remoteTempUri.fsPath, { force: true });
          await fs.mkdir(remoteTempUri.fsPath, { recursive: true });
          await fs.writeFile(path.join(remoteTempUri.fsPath, "child.txt"), "x");

          await flushScheduledTempMergeCleanup();
        },
      );
    } finally {
      await flushScheduledTempMergeCleanup();

      if (previousDelay === undefined) {
        delete process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
      } else {
        process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = previousDelay;
      }
    }
  });

  test("deferred cleanup via timeout removes temp file", async () => {
    const previousDelay = process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
    process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = "0";

    try {
      await withPatchedConflictUi(
        {
          showQuickPick: async () => ({ value: "overwriteRemote" }),
        },
        async ({ executeCalls, workspaceFolderUri }) => {
          const result = await resolvePushConflictInteractive({
            workspaceFolderUri,
            candidate: {
              localPath: "a.js",
              localContent: "local",
            },
            remoteContent: "remote",
          });

          assert.deepStrictEqual(result, { kind: "overwriteRemote" });

          const diffCall = executeCalls.find(
            (call) => call.command === "vscode.diff",
          );
          assert.ok(diffCall);
          const remoteTempUri = diffCall?.args[0] as vscode.Uri;

          await new Promise((resolve) => setTimeout(resolve, 15));
          assert.strictEqual(await exists(remoteTempUri.fsPath), false);
        },
      );
    } finally {
      await flushScheduledTempMergeCleanup();

      if (previousDelay === undefined) {
        delete process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
      } else {
        process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = previousDelay;
      }
    }
  });

  test("cleanup delay clamps oversized env value to max bound", async () => {
    const previousDelay = process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
    process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = "999999999";

    const expectedMaxDelayMs = 60 * 60 * 1000;
    const originalSetTimeout = global.setTimeout;
    const capturedDelays: number[] = [];

    global.setTimeout = ((
      callback: (...args: unknown[]) => unknown,
      delay?: number,
      ...args: unknown[]
    ) => {
      capturedDelays.push(Number(delay));
      return originalSetTimeout(
        callback as (...callbackArgs: unknown[]) => void,
        delay,
        ...args,
      );
    }) as typeof setTimeout;

    try {
      await withPatchedConflictUi(
        {
          showQuickPick: async () => ({ value: "overwriteRemote" }),
        },
        async ({ workspaceFolderUri }) => {
          const result = await resolvePushConflictInteractive({
            workspaceFolderUri,
            candidate: {
              localPath: "a.js",
              localContent: "local",
            },
            remoteContent: "remote",
          });

          assert.deepStrictEqual(result, { kind: "overwriteRemote" });
        },
      );

      assert.ok(capturedDelays.includes(expectedMaxDelayMs));
    } finally {
      global.setTimeout = originalSetTimeout;
      await flushScheduledTempMergeCleanup();

      if (previousDelay === undefined) {
        delete process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
      } else {
        process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = previousDelay;
      }
    }
  });

  test("flushScheduledTempMergeCleanup clears pending cleanup tasks", async () => {
    const previousDelay = process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
    process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = "60000";

    try {
      await withPatchedConflictUi(
        {
          showQuickPick: async () => ({ value: "overwriteRemote" }),
        },
        async ({ executeCalls, workspaceFolderUri }) => {
          const result = await resolvePushConflictInteractive({
            workspaceFolderUri,
            candidate: {
              localPath: "a.js",
              localContent: "local",
            },
            remoteContent: "remote",
          });

          assert.deepStrictEqual(result, { kind: "overwriteRemote" });

          const diffCall = executeCalls.find(
            (call) => call.command === "vscode.diff",
          );
          assert.ok(diffCall);
          const remoteTempUri = diffCall?.args[0] as vscode.Uri;
          assert.ok(await exists(remoteTempUri.fsPath));

          await flushScheduledTempMergeCleanup();
          assert.strictEqual(await exists(remoteTempUri.fsPath), false);
        },
      );
    } finally {
      await flushScheduledTempMergeCleanup();

      if (previousDelay === undefined) {
        delete process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS;
      } else {
        process.env.SN_SYNC_MERGE_CLEANUP_DELAY_MS = previousDelay;
      }
    }
  });
});

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

interface ConflictUiHarnessOptions {
  showQuickPick?: (
    items: Array<{ value: string }>,
  ) => Promise<{ value: string } | undefined>;
  showWarningMessage?: (message: string) => Promise<string | undefined>;
  showInformationMessage?: (message: string) => Promise<string | undefined>;
  failMergeEditor?: boolean;
  mergeDocumentDirty?: boolean;
  initialLocalFileContent?: string;
}

async function withPatchedConflictUi(
  options: ConflictUiHarnessOptions,
  run: (state: {
    executeCalls: Array<{ command: string; args: unknown[] }>;
    workspaceFolderUri: vscode.Uri;
    localFileUri: vscode.Uri;
  }) => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showQuickPick: (
      items:
        | readonly vscode.QuickPickItem[]
        | Thenable<readonly vscode.QuickPickItem[]>,
      options?: vscode.QuickPickOptions,
    ) => Thenable<vscode.QuickPickItem | undefined>;
    showWarningMessage: (
      message: string,
      options: vscode.MessageOptions,
      ...items: string[]
    ) => Thenable<string | undefined>;
    showInformationMessage: (
      message: string,
      ...items: string[]
    ) => Thenable<string | undefined>;
    showTextDocument: (
      document: vscode.TextDocument,
      options?: vscode.TextDocumentShowOptions,
    ) => Thenable<vscode.TextEditor>;
  };

  const workspaceObject = vscode.workspace as unknown as {
    openTextDocument: (
      uriOrOptions: vscode.Uri | { language?: string; content?: string },
    ) => Thenable<vscode.TextDocument>;
    fs: {
      writeFile: (uri: vscode.Uri, content: Uint8Array) => Thenable<void>;
      readFile: (uri: vscode.Uri) => Thenable<Uint8Array>;
      delete: (uri: vscode.Uri) => Thenable<void>;
    };
  };

  const commandsObject = vscode.commands as unknown as {
    executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  };

  const originalShowQuickPick = windowObject.showQuickPick;
  const originalShowWarningMessage = windowObject.showWarningMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalShowTextDocument = windowObject.showTextDocument;
  const originalOpenTextDocument = workspaceObject.openTextDocument;
  const originalExecuteCommand = commandsObject.executeCommand;

  const executeCalls: Array<{ command: string; args: unknown[] }> = [];
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "sn-sync-conflict-test-"),
  );
  const workspaceFolderUri = vscode.Uri.file(tempDir);
  const localFileUri = vscode.Uri.file(path.join(tempDir, "a.js"));
  await fs.writeFile(
    localFileUri.fsPath,
    options.initialLocalFileContent ?? "",
    "utf8",
  );

  windowObject.showQuickPick = (async (items) => {
    const resolvedItems = (await Promise.resolve(items)) as unknown as Array<{
      value: string;
    }>;
    return options.showQuickPick
      ? ((await options.showQuickPick(
          resolvedItems,
        )) as unknown as vscode.QuickPickItem)
      : undefined;
  }) as typeof windowObject.showQuickPick;

  windowObject.showWarningMessage = (async (message: string) =>
    options.showWarningMessage
      ? options.showWarningMessage(message)
      : undefined) as typeof windowObject.showWarningMessage;

  windowObject.showInformationMessage = (async (message: string) =>
    options.showInformationMessage
      ? options.showInformationMessage(message)
      : undefined) as typeof windowObject.showInformationMessage;

  windowObject.showTextDocument = (async () =>
    ({
      document: {} as vscode.TextDocument,
      selection: {} as vscode.Selection,
      selections: [] as vscode.Selection[],
      visibleRanges: [] as vscode.Range[],
      options: {},
      viewColumn: vscode.ViewColumn.One,
      edit: async () => false,
      insertSnippet: async () => false,
      setDecorations: () => undefined,
      revealRange: () => undefined,
      show: () => undefined,
      hide: () => undefined,
    }) as vscode.TextEditor) as typeof windowObject.showTextDocument;

  workspaceObject.openTextDocument = (async (
    uriOrOptions: vscode.Uri | { language?: string; content?: string },
  ) => {
    if (
      typeof (uriOrOptions as { fsPath?: unknown }).fsPath === "string" &&
      options.mergeDocumentDirty &&
      uriOrOptions.toString() === localFileUri.toString()
    ) {
      const document = {
        uri: localFileUri,
        isDirty: true,
        save: async () => {
          (document as { isDirty: boolean }).isDirty = false;
          return true;
        },
        getText: () => options.initialLocalFileContent ?? "",
      };

      return document as unknown as vscode.TextDocument;
    }

    return originalOpenTextDocument(uriOrOptions);
  }) as typeof workspaceObject.openTextDocument;

  commandsObject.executeCommand = (async (
    command: string,
    ...args: unknown[]
  ) => {
    executeCalls.push({ command, args });
    if (options.failMergeEditor && command === "_open.mergeEditor") {
      throw new Error("merge-editor-unavailable");
    }

    return undefined;
  }) as typeof commandsObject.executeCommand;

  try {
    await run({
      executeCalls,
      workspaceFolderUri,
      localFileUri,
    });
  } finally {
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showWarningMessage = originalShowWarningMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showTextDocument = originalShowTextDocument;
    workspaceObject.openTextDocument = originalOpenTextDocument;
    commandsObject.executeCommand = originalExecuteCommand;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
