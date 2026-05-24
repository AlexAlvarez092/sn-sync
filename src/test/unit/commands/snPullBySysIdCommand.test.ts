import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullBySysIdCommand,
  runSnPullBySysIdCommand,
} from "@commands/snPullBySysIdCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snPullBySysIdCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPullBySysIdCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes pull-by-sys-id command", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPullBySysIdCommand(
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
        await withPatchedWindowMethods(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async () => undefined,
          async () => undefined,
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

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPullBySysIdCommand(
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
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async () => undefined,
        showInputBox: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no settings are configured", async () => {
    const shownInfos: string[] = [];

    await runSnPullBySysIdCommand(
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
          createTempWorkspaceUri("pull-by-sys-id-no-settings"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async () => {
          throw new Error("must-not-be-called");
        },
        showInputBox: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("shows cancelled info when table selection is dismissed", async () => {
    const shownInfos: string[] = [];

    await runSnPullBySysIdCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-cancel-table"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async () => undefined,
        showInputBox: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PULL_BY_SYS_ID_CANCELLED,
    ]);
  });

  test("shows cancelled info when sys_id input is dismissed", async () => {
    const shownInfos: string[] = [];

    await runSnPullBySysIdCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-cancel-input"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => items[0],
        showInputBox: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PULL_BY_SYS_ID_CANCELLED,
    ]);
  });

  test("shows error when sys_id input is blank", async () => {
    const shownErrors: string[] = [];

    await runSnPullBySysIdCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-blank-input"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showInputBox: async (options) => {
          await options.validateInput?.("abc123");
          await options.validateInput?.("   ");
          return "   ";
        },
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      SN_SYNC_MESSAGES.PULL_BY_SYS_ID_INVALID_SYS_ID,
    ]);
  });

  test("pulls selected table record by sys_id and records index updates", async () => {
    const shownInfos: string[] = [];
    const pulledQueries: string[] = [];
    const usedRootDirs: string[] = [];
    const recordedUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullBySysIdCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "app",
          pull: { clearBeforePull: "ask" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          settings,
          options,
        ) => {
          pulledQueries.push(settings[0].query);
          usedRootDirs.push(options?.rootDir ?? "missing");

          options?.onFileWritten?.({
            settingFolder: "script_includes",
            fileName: "new_si.js",
            localPath: "app/script_includes/new_si.js",
            table: "sys_script_include",
            sysId: "abc123",
            fieldName: "script",
            baseHash: "sha256:abc",
          });

          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => items[0],
        showInputBox: async () => "  abc123  ",
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async (_workspaceUri, updates) => {
          recordedUpdates.push(...updates);
        },
      },
    );

    assert.deepStrictEqual(pulledQueries, ["sys_id=abc123"]);
    assert.deepStrictEqual(usedRootDirs, ["app"]);
    assert.deepStrictEqual(recordedUpdates, [
      {
        localPath: "app/script_includes/new_si.js",
        table: "sys_script_include",
        sysId: "abc123",
        fieldName: "script",
        baseHash: "sha256:abc",
      },
    ]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_SUCCESS_PREFIX} 1 files from 1 records (script_includes).`,
    ]);
  });

  test("uses fallback preferences when config service does not expose getPreferences", async () => {
    const usedRootDirs: string[] = [];

    await runSnPullBySysIdCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          _settings,
          options,
        ) => {
          usedRootDirs.push(options?.rootDir ?? "missing");
          return {
            settings: 1,
            records: 0,
            files: 0,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-fallback-preferences"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showInputBox: async () => "abc123",
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(usedRootDirs, ["src"]);
  });

  test("skips index updates when pull metadata is incomplete", async () => {
    const recordedUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullBySysIdCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          _settings,
          options,
        ) => {
          options?.onFileWritten?.({
            settingFolder: "script_includes",
            fileName: "new_si.js",
            localPath: "src/script_includes/new_si.js",
            table: "sys_script_include",
          });
          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-missing-metadata"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showInputBox: async () => "abc123",
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async (_workspaceUri, updates) => {
          recordedUpdates.push(...updates);
        },
      },
    );

    assert.deepStrictEqual(recordedUpdates, []);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("pull-by-sys-id-default-success");
    const shownInfos: string[] = [];
    const progressTitles: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMethods(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async (items) => items[0],
          async () => "abc123",
          async (options, task) => {
            progressTitles.push(options.title ?? "");
            return task({ report: () => undefined });
          },
          async () => {
            await runSnPullBySysIdCommand(
              {
                workspaceState: {
                  get: () => undefined,
                  update: async () => undefined,
                },
              } as unknown as vscode.ExtensionContext,
              {
                getSyncSettings: async () => [
                  {
                    folder: "script_includes",
                    table: "sys_script_include",
                    query: "active=true",
                    key: "api_name",
                    fields: [{ extension: "js", field_name: "script" }],
                  },
                ],
              } as unknown as never,
              {
                pullConfiguredScripts: async () => ({
                  settings: 1,
                  records: 1,
                  files: 1,
                }),
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(progressTitles, [
      SN_SYNC_MESSAGES.PULL_PROGRESS_TITLE,
    ]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_SUCCESS_PREFIX} 1 files from 1 records (script_includes).`,
    ]);
  });

  test("shows detailed error when pull by sys_id fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullBySysIdCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "script_includes",
            table: "sys_script_include",
            query: "active=true",
            key: "api_name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("pull-by-sys-id-fail");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-by-sys-id-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showInputBox: async () => "abc123",
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_BY_SYS_ID_FAILED_PREFIX} pull-by-sys-id-fail`,
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

async function withPatchedWindowMethods(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ) => Thenable<T | undefined>,
  showInputBox: (
    options: vscode.InputBoxOptions,
  ) => Thenable<string | undefined>,
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
    showQuickPick: <T extends vscode.QuickPickItem>(
      items: readonly T[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<T | undefined>;
    showInputBox: (
      options: vscode.InputBoxOptions,
    ) => Thenable<string | undefined>;
    withProgress: <T>(
      options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
      ) => Thenable<T>,
    ) => Thenable<T>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalShowQuickPick = windowObject.showQuickPick;
  const originalShowInputBox = windowObject.showInputBox;
  const originalWithProgress = windowObject.withProgress;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showQuickPick = showQuickPick;
  windowObject.showInputBox = showInputBox;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showInputBox = originalShowInputBox;
    windowObject.withProgress = originalWithProgress;
  }
}
