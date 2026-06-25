import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  buildConflictMarkersFromDiff3,
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

  test("returns skip when user skips after choosing merge", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Skip file",
        initialLocalFileContent: "original-local",
      },
      async ({ workspaceFolderUri, localFileUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "original-local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
        assert.strictEqual(
          await fs.readFile(localFileUri.fsPath, "utf8"),
          "original-local",
          "local file must be restored to original content on skip",
        );
      },
    );
  });

  test("restores original content when merge notification is dismissed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        initialLocalFileContent: "original-local",
      },
      async ({ workspaceFolderUri, localFileUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: {
            localPath: "a.js",
            localContent: "original-local",
          },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
        assert.strictEqual(
          await fs.readFile(localFileUri.fsPath, "utf8"),
          "original-local",
          "local file must be restored to original content when notification is dismissed",
        );
      },
    );
  });

  test("writes diff3 conflict markers to local file before user confirms", async () => {
    let contentOnDiskDuringPrompt = "";

    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Skip file",
        initialLocalFileContent: "local line",
      },
      async ({ workspaceFolderUri, localFileUri }) => {
        const windowObject = vscode.window as unknown as {
          showInformationMessage: (...args: unknown[]) => Promise<unknown>;
        };
        const original = windowObject.showInformationMessage;
        windowObject.showInformationMessage = async (...args: unknown[]) => {
          contentOnDiskDuringPrompt = await fs.readFile(
            localFileUri.fsPath,
            "utf8",
          );
          return original(...args);
        };

        try {
          await resolvePushConflictInteractive({
            workspaceFolderUri,
            candidate: {
              localPath: "a.js",
              localContent: "local line",
            },
            remoteContent: "remote line",
          });
        } finally {
          windowObject.showInformationMessage = original;
        }

        assert.ok(
          contentOnDiskDuringPrompt.includes("<<<<<<<"),
          "conflict markers must be written to disk before user responds",
        );
        assert.ok(contentOnDiskDuringPrompt.includes("local line"));
        assert.ok(contentOnDiskDuringPrompt.includes("remote line"));
      },
    );
  });

  test("returns merge result and saves dirty document when merge is confirmed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Push merged",
        mergeDocumentDirty: true,
        savedFileContent: "merged-from-editor",
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

  test("no conflict markers when local and remote are identical", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "merge" }),
        showInformationMessage: async () => "Push merged",
        initialLocalFileContent: "same-content",
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

  test("buildConflictMarkersFromDiff3 produces line-level conflict markers", () => {
    const local = ["line1", "local change", "line3"].join("\n");
    const remote = ["line1", "remote change", "line3"].join("\n");

    const result = buildConflictMarkersFromDiff3(local, remote);

    assert.ok(result.includes("<<<<<<<"), "must contain opening marker");
    assert.ok(result.includes("======="), "must contain separator");
    assert.ok(result.includes(">>>>>>>"), "must contain closing marker");
    assert.ok(result.includes("local change"), "must contain local content");
    assert.ok(result.includes("remote change"), "must contain remote content");

    // Unchanged lines must appear outside of conflict markers
    const lines = result.split("\n");
    const markerIndices = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.startsWith("<<<<<<<") || l.startsWith(">>>>>>>"))
      .map(({ i }) => i);
    const line1Index = lines.indexOf("line1");
    const line3Index = lines.indexOf("line3");
    assert.ok(
      line1Index < markerIndices[0],
      "line1 must appear before the conflict block",
    );
    assert.ok(
      line3Index > markerIndices[markerIndices.length - 1],
      "line3 must appear after the conflict block",
    );
  });

  test("buildConflictMarkersFromDiff3 returns unchanged content when local equals remote", () => {
    const content = "line1\nline2\nline3";
    assert.strictEqual(buildConflictMarkersFromDiff3(content, content), content);
  });

  test("buildConflictMarkersFromDiff3 uses 3-way diff3Merge when base is provided", () => {
    // Base: A + shared + B
    // Local: A-modified + shared + B     (only local changed A)
    // Remote: A + shared + B-modified    (only remote changed B)
    // 3-way result should auto-merge: A-modified + shared + B-modified (no conflict)
    const base = "line-a\nshared\nline-b";
    const local = "line-a-modified\nshared\nline-b";
    const remote = "line-a\nshared\nline-b-modified";

    const result = buildConflictMarkersFromDiff3(local, remote, base);

    assert.ok(
      !result.includes("<<<<<<<"),
      "no conflict markers expected when changes are in different regions",
    );
    assert.ok(result.includes("line-a-modified"), "local change preserved");
    assert.ok(result.includes("line-b-modified"), "remote change preserved");
    assert.ok(result.includes("shared"), "shared line preserved");
  });

  test("buildConflictMarkersFromDiff3 with base marks conflict when both sides change same region", () => {
    // Base: shared line
    // Local: changes the line one way, remote changes it another
    const base = "shared-line";
    const local = "local-version";
    const remote = "remote-version";

    const result = buildConflictMarkersFromDiff3(local, remote, base);

    assert.ok(result.includes("<<<<<<<"), "conflict marker expected");
    assert.ok(result.includes("local-version"), "local version in conflict");
    assert.ok(result.includes("remote-version"), "remote version in conflict");
  });

  test("vscode.diff is called once on the merge path", async () => {
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
          executeCalls.filter((call) => call.command === "vscode.diff").length,
          1,
        );
        assert.strictEqual(
          executeCalls.filter((call) => call.command === "_open.mergeEditor")
            .length,
          0,
          "_open.mergeEditor must not be called",
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
  mergeDocumentDirty?: boolean;
  initialLocalFileContent?: string;
  savedFileContent?: string;
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
          if (options.savedFileContent !== undefined) {
            await fs.writeFile(
              localFileUri.fsPath,
              options.savedFileContent,
              "utf8",
            );
          }
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
