import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPushModifiedCommand,
  runSnPushModifiedCommand,
} from "@commands/snPushModifiedCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { hashText } from "@shared/services/hashService.js";

suite("snPushModifiedCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPushModifiedCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes command with default runtime", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPushModifiedCommand(context, {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
      });

      await withPatchedWorkspaceFolders(undefined, async () => {
        await withPatchedWindowMessages(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async () => undefined,
          async (_options, task) => task({ report: () => undefined }),
          async () => {
            await invokeRegistered();
          },
        );
      });
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("default runtime uses vscode.window.withProgress", async () => {
    const shownInfos: string[] = [];
    const progressMessages: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: vscode.Uri.file("/tmp/ws"), name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMessages(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async (_options, task) =>
            task({
              report: ({ message }) => {
                progressMessages.push(message ?? "");
              },
            }),
          async () => {
            await runSnPushModifiedCommand(
              {} as vscode.ExtensionContext,
              {
                getRemoteFieldContent: async () => "base",
                pushFieldContent: async () => "",
              },
              {
                getModifiedCandidates: async () => [
                  {
                    entry: {
                      localPath: "src/a.js",
                      table: "sys_script",
                      sysId: "a",
                      fieldName: "script",
                      baseHash: hashText("base"),
                      updatedAt: "now",
                    },
                    localContent: "new-a",
                    localHash: hashText("new-a"),
                  },
                ],
                findEntryByLocalPath: async () => undefined,
                toWorkspaceRelativePath: () => "",
                recordPullFiles: async () => undefined,
                updateBaseHashes: async () => undefined,
              },
            );
          },
        );
      },
    );

    assert.strictEqual(progressMessages.length, 1);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} 1 files uploaded.`,
    ]);
  });

  test("shows error when no workspace is open", async () => {
    const shownErrors: string[] = [];

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
      },
      {
        getModifiedCandidates: async () => [],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no modified files are found", async () => {
    const shownInfos: string[] = [];

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
      },
      {
        getModifiedCandidates: async () => [],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_MODIFIED_NO_LOCAL_CHANGES,
    ]);
  });

  test("aborts when conflicts are detected", async () => {
    const shownErrors: string[] = [];
    let pushed = false;

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-changed",
        pushFieldContent: async () => {
          pushed = true;
          return "";
        },
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a.js",
              table: "sys_script",
              sysId: "abc",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "local-changed",
            localHash: hashText("local-changed"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.strictEqual(pushed, false);
    assert.strictEqual(shownErrors.length, 1);
    assert.ok(
      shownErrors[0].startsWith(
        SN_SYNC_MESSAGES.PUSH_MODIFIED_CONFLICTS_PREFIX,
      ),
    );
  });

  test("adds suffix when more than five conflicts are detected", async () => {
    const shownErrors: string[] = [];

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-changed",
        pushFieldContent: async () => "",
      },
      {
        getModifiedCandidates: async () =>
          Array.from({ length: 6 }, (_value, index) => ({
            entry: {
              localPath: `src/file-${index + 1}.js`,
              table: "sys_script",
              sysId: `id-${index + 1}`,
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "local-changed",
            localHash: hashText("local-changed"),
          })),
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.strictEqual(shownErrors.length, 1);
    assert.ok(shownErrors[0].includes("(+1 more)"));
  });

  test("pushes modified files and updates base hashes", async () => {
    const shownInfos: string[] = [];
    const pushedPaths: string[] = [];
    const updatedHashes: string[] = [];
    const progressIncrements: number[] = [];

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "base",
        pushFieldContent: async (_context, _workspaceUri, entry, content) => {
          pushedPaths.push(entry.localPath);
          return content;
        },
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-a",
            localHash: hashText("new-a"),
          },
          {
            entry: {
              localPath: "src/b.js",
              table: "sys_script",
              sysId: "b",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-b",
            localHash: hashText("new-b"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async (_workspace, updates) => {
          updatedHashes.push(...updates.map((update) => update.baseHash));
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        withProgress: async (_title, task) =>
          task({
            report: ({ increment }) => {
              if (typeof increment === "number") {
                progressIncrements.push(increment);
              }
            },
          }),
      },
    );

    assert.deepStrictEqual(pushedPaths, ["src/a.js", "src/b.js"]);
    assert.deepStrictEqual(updatedHashes, [
      hashText("new-a"),
      hashText("new-b"),
    ]);
    assert.deepStrictEqual(progressIncrements, [50, 50]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_SUCCESS_PREFIX} 2 files uploaded.`,
    ]);
  });

  test("groups uploads by record and updates hashes per field", async () => {
    const pushedRecords: Array<{
      table: string;
      sysId: string;
      fieldMap: Record<string, string>;
    }> = [];
    const progressMessages: string[] = [];
    const updatedHashes = new Map<string, string>();

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "base",
        pushFieldContent: async () => {
          throw new Error(
            "pushFieldContent should not be used when grouped API is available",
          );
        },
        pushRecordFields: async (
          _context,
          _workspaceUri,
          table,
          sysId,
          fieldMap,
        ) => {
          pushedRecords.push({ table, sysId, fieldMap });

          if (sysId === "a") {
            return {
              script: "stored-script-a",
              description: "stored-description-a",
            };
          }

          return {
            script: "stored-script-b",
            description: "",
          };
        },
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a-script.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-script-a",
            localHash: hashText("new-script-a"),
          },
          {
            entry: {
              localPath: "src/a-description.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "description",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-description-a",
            localHash: hashText("new-description-a"),
          },
          {
            entry: {
              localPath: "src/b-script.js",
              table: "sys_script",
              sysId: "b",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-script-b",
            localHash: hashText("new-script-b"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async (_workspace, updates) => {
          for (const update of updates) {
            updatedHashes.set(update.localPath, update.baseHash);
          }
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: ({ message }) => {
              progressMessages.push(message ?? "");
            },
          }),
      },
    );

    assert.strictEqual(pushedRecords.length, 2);
    assert.deepStrictEqual(pushedRecords[0], {
      table: "sys_script",
      sysId: "a",
      fieldMap: {
        script: "new-script-a",
        description: "new-description-a",
      },
    });
    assert.deepStrictEqual(pushedRecords[1], {
      table: "sys_script",
      sysId: "b",
      fieldMap: {
        script: "new-script-b",
      },
    });
    assert.strictEqual(
      updatedHashes.get("src/a-script.js"),
      hashText("stored-script-a"),
    );
    assert.strictEqual(
      updatedHashes.get("src/a-description.js"),
      hashText("stored-description-a"),
    );
    assert.strictEqual(
      updatedHashes.get("src/b-script.js"),
      hashText("stored-script-b"),
    );
    assert.strictEqual(progressMessages.length, 2);
    assert.ok(
      progressMessages[0].includes("Uploading record 1/2: sys_script/a"),
    );
    assert.ok(
      progressMessages[1].includes("Uploading record 2/2: sys_script/b"),
    );
  });

  test("uses empty stored value when grouped response omits a field", async () => {
    const updatedHashes = new Map<string, string>();

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "base",
        pushFieldContent: async () => {
          throw new Error(
            "pushFieldContent should not be used when grouped API is available",
          );
        },
        pushRecordFields: async () => ({
          script: "stored-script",
        }),
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a-script.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-script-a",
            localHash: hashText("new-script-a"),
          },
          {
            entry: {
              localPath: "src/a-description.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "description",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-description-a",
            localHash: hashText("new-description-a"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async (_workspace, updates) => {
          for (const update of updates) {
            updatedHashes.set(update.localPath, update.baseHash);
          }
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.strictEqual(
      updatedHashes.get("src/a-script.js"),
      hashText("stored-script"),
    );
    assert.strictEqual(updatedHashes.get("src/a-description.js"), hashText(""));
  });

  test("uses empty stored value when legacy push returns undefined", async () => {
    const updatedHashes = new Map<string, string>();

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "base",
        pushFieldContent: async () => undefined as unknown as string,
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-a",
            localHash: hashText("new-a"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async (_workspace, updates) => {
          for (const update of updates) {
            updatedHashes.set(update.localPath, update.baseHash);
          }
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.strictEqual(updatedHashes.get("src/a.js"), hashText(""));
  });

  test("shows detailed error when push modified throws", async () => {
    const shownErrors: string[] = [];

    await runSnPushModifiedCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => {
          throw new Error("preflight-fail");
        },
        pushFieldContent: async () => "",
      },
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/a.js",
              table: "sys_script",
              sysId: "a",
              fieldName: "script",
              baseHash: hashText("base"),
              updatedAt: "now",
            },
            localContent: "new-a",
            localHash: hashText("new-a"),
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PUSH_MODIFIED_FAILED_PREFIX} (SN_PUSH_MODIFIED_FAILED) preflight-fail`,
    ]);
  });
});

function withPatchedRegisterCommand(run: () => void): void {
  const commandsObject = vscode.commands as unknown as {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };
  const originalRegisterCommand = commandsObject.registerCommand;

  commandsObject.registerCommand = (
    _command: string,
    _callback: (...args: unknown[]) => unknown,
  ) => new vscode.Disposable(() => undefined);

  try {
    run();
  } finally {
    commandsObject.registerCommand = originalRegisterCommand;
  }
}

async function withCapturedRegisterCommand(
  run: (invokeRegistered: () => Promise<unknown>) => Promise<void>,
): Promise<void> {
  const commandsObject = vscode.commands as unknown as {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };
  const originalRegisterCommand = commandsObject.registerCommand;
  let callback: ((...args: unknown[]) => unknown) | undefined;

  commandsObject.registerCommand = (
    _command: string,
    commandCallback: (...args: unknown[]) => unknown,
  ) => {
    callback = commandCallback;
    return new vscode.Disposable(() => undefined);
  };

  try {
    await run(async () => {
      assert.ok(callback);
      return callback!();
    });
  } finally {
    commandsObject.registerCommand = originalRegisterCommand;
  }
}

async function withPatchedWorkspaceFolders(
  folders: vscode.WorkspaceFolder[] | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    vscode.workspace,
    "workspaceFolders",
  );

  Object.defineProperty(vscode.workspace, "workspaceFolders", {
    configurable: true,
    value: folders,
  });

  try {
    await run();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(
        vscode.workspace,
        "workspaceFolders",
        originalDescriptor,
      );
    }
  }
}

async function withPatchedWindowMessages(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  withProgress: <T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ) => Thenable<T>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    withProgress: <T>(
      options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
      ) => Thenable<T>,
    ) => Thenable<T>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalWithProgress = windowObject.withProgress;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.withProgress = originalWithProgress;
  }
}
