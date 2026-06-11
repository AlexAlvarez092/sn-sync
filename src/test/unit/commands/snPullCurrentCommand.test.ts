import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullCurrentCommand,
  runSnPullCurrentCommand,
} from "@commands/snPullCurrentCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snPullCurrentCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPullCurrentCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => {
          throw new Error("must-not-be-called");
        },
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => undefined,
        getCurrentTextEditor: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("register callback executes pull-current command", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPullCurrentCommand(
        context,
        {
          getSyncSettings: async () => {
            throw new Error("must-not-be-called");
          },
        } as unknown as never,
        {
          pullConfiguredScripts: async () => ({
            settings: 0,
            records: 0,
            files: 0,
          }),
        },
      );

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

  test("shows info when no current editor exists", async () => {
    const shownInfos: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => {
          throw new Error("must-not-be-called");
        },
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-no-editor"),
        getCurrentTextEditor: () => undefined,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PULL_CURRENT_NO_EDITOR,
    ]);
  });

  test("shows info when current file is not indexed", async () => {
    const shownInfos: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => {
          throw new Error("must-not-be-called");
        },
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-not-indexed"),
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PULL_CURRENT_NOT_INDEXED,
    ]);
  });

  test("shows info when no settings are configured", async () => {
    const shownInfos: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-no-settings"),
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sp_widget",
          sysId: "abc123",
          fieldName: "template",
          baseHash: "sha256:base",
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("pulls current record and records index updates", async () => {
    const shownInfos: string[] = [];
    const capturedCalls: Array<{
      table: string;
      sysId: string;
      settings: number;
    }> = [];
    const recordedUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullCurrentCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "html", field_name: "template" }],
          },
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "css", field_name: "css" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "src",
          pull: { clearBeforePull: "ask" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async () => ({
          settings: 1,
          records: 1,
          files: 1,
        }),
        pullRecordBySysId: async (
          _context,
          _workspaceUri,
          settings,
          table,
          sysId,
          options,
        ) => {
          capturedCalls.push({ table, sysId, settings: settings.length });
          options?.onFileWritten?.({
            settingFolder: "widgets",
            fileName: "widget.html",
            localPath: "src/widgets/widget/widget.html",
            table: "sp_widget",
            sysId,
            fieldName: "template",
            baseHash: "sha256:abc",
          });
          return {
            settings: 2,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-success"),
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/widgets/widget/widget.html"),
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/widgets/widget/widget.html",
          table: "sp_widget",
          sysId: "0123456789abcdef0123456789abcdef",
          fieldName: "template",
          baseHash: "sha256:base",
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/widgets/widget/widget.html",
        getModifiedCandidates: async () => [],
        recordPullFiles: async (_workspaceUri, updates) => {
          recordedUpdates.push(...updates);
        },
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(capturedCalls, [
      {
        table: "sp_widget",
        sysId: "0123456789abcdef0123456789abcdef",
        settings: 2,
      },
    ]);
    assert.deepStrictEqual(recordedUpdates, [
      {
        localPath: "src/widgets/widget/widget.html",
        table: "sp_widget",
        sysId: "0123456789abcdef0123456789abcdef",
        fieldName: "template",
        baseHash: "sha256:abc",
      },
    ]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_CURRENT_SUCCESS_PREFIX} 1 files from 1 records (sp_widget/0123456789abcdef0123456789abcdef).`,
    ]);
  });

  test("falls back to pullConfiguredScripts when pullRecordBySysId is unavailable", async () => {
    const pulledQueries: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "html", field_name: "template" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (_context, _workspaceUri, settings) => {
          pulledQueries.push(settings[0].query);
          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-fallback"),
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/widgets/widget/widget.html"),
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/widgets/widget/widget.html",
          table: "sp_widget",
          sysId: "0123456789abcdef0123456789abcdef",
          fieldName: "template",
          baseHash: "sha256:base",
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/widgets/widget/widget.html",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(pulledQueries, [
      "sys_id=0123456789abcdef0123456789abcdef",
    ]);
  });

  test("default runtime succeeds when vscode APIs are patched", async () => {
    const workspaceUri = createTempWorkspaceUri("pull-current-default-runtime");
    const shownErrors: string[] = [];
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWorkspaceGetWorkspaceFolder(workspaceUri, async () => {
          await withPatchedWindowState(
            {
              document: {
                uri: vscode.Uri.joinPath(
                  workspaceUri,
                  "src/widgets/widget/widget.html",
                ),
              },
            } as unknown as vscode.TextEditor,
            async (message: string) => {
              shownErrors.push(message);
              return undefined;
            },
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async (_items) => undefined,
            async (_options, task) => task({ report: () => undefined }),
            async () => {
              await runSnPullCurrentCommand(
                {} as vscode.ExtensionContext,
                {
                  getSyncSettings: async () => [
                    {
                      folder: "widgets",
                      table: "sp_widget",
                      query: "active=true",
                      key: "id",
                      fields: [{ extension: "html", field_name: "template" }],
                    },
                  ],
                } as unknown as never,
                {
                  pullConfiguredScripts: async () => ({
                    settings: 1,
                    records: 1,
                    files: 1,
                  }),
                  pullRecordBySysId: async () => ({
                    settings: 1,
                    records: 1,
                    files: 1,
                  }),
                },
                undefined,
                {
                  findEntryByLocalPath: async () => ({
                    localPath: "src/widgets/widget/widget.html",
                    table: "sp_widget",
                    sysId: "0123456789abcdef0123456789abcdef",
                    fieldName: "template",
                    baseHash: "sha256:base",
                    updatedAt: "now",
                  }),
                  toWorkspaceRelativePath: () =>
                    "src/widgets/widget/widget.html",
                  getModifiedCandidates: async () => [],
                  recordPullFiles: async () => undefined,
                  updateBaseHashes: async () => undefined,
                },
              );
            },
          );
        });
      },
    );

    assert.deepStrictEqual(shownErrors, []);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_CURRENT_SUCCESS_PREFIX} 1 files from 1 records (sp_widget/0123456789abcdef0123456789abcdef).`,
    ]);
  });

  test("shows detailed error when pull current fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "widgets",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "html", field_name: "template" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
        pullRecordBySysId: async () => {
          throw new Error("pull-current-fail");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-current-failure"),
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/widgets/widget/widget.html"),
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/widgets/widget/widget.html",
          table: "sp_widget",
          sysId: "0123456789abcdef0123456789abcdef",
          fieldName: "template",
          baseHash: "sha256:base",
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/widgets/widget/widget.html",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_CURRENT_FAILED_PREFIX} (SN_PULL_CURRENT_FAILED) pull-current-fail`,
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

async function withPatchedWindowState(
  activeTextEditor: vscode.TextEditor | undefined,
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ) => Thenable<T | undefined>,
  withProgress: <T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ) => Thenable<T>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    activeTextEditor: vscode.TextEditor | undefined;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    showQuickPick: <T extends vscode.QuickPickItem>(
      items: readonly T[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<T | undefined>;
    withProgress: <T>(
      options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
      ) => Thenable<T>,
    ) => Thenable<T>;
  };
  const originalActiveEditorDescriptor = Object.getOwnPropertyDescriptor(
    vscode.window,
    "activeTextEditor",
  );
  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalShowQuickPick = windowObject.showQuickPick;
  const originalWithProgress = windowObject.withProgress;

  Object.defineProperty(vscode.window, "activeTextEditor", {
    configurable: true,
    value: activeTextEditor,
  });
  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showQuickPick = showQuickPick;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    if (originalActiveEditorDescriptor) {
      Object.defineProperty(
        vscode.window,
        "activeTextEditor",
        originalActiveEditorDescriptor,
      );
    }
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.withProgress = originalWithProgress;
  }
}

async function withPatchedWorkspaceGetWorkspaceFolder(
  workspaceUri: vscode.Uri,
  run: () => Promise<void>,
): Promise<void> {
  const workspaceObject = vscode.workspace as unknown as {
    getWorkspaceFolder: (uri: vscode.Uri) => vscode.WorkspaceFolder | undefined;
  };
  const originalGetWorkspaceFolder = workspaceObject.getWorkspaceFolder;

  workspaceObject.getWorkspaceFolder = (_uri: vscode.Uri) => ({
    uri: workspaceUri,
    name: "tmp",
    index: 0,
  });

  try {
    await run();
  } finally {
    workspaceObject.getWorkspaceFolder = originalGetWorkspaceFolder;
  }
}
