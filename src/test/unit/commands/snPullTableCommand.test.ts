import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullTableCommand,
  runSnPullTableCommand,
} from "@commands/snPullTableCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snPullTableCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPullTableCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes pull-table command", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPullTableCommand(
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

    await runSnPullTableCommand(
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
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no settings are configured", async () => {
    const shownInfos: string[] = [];

    await runSnPullTableCommand(
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
          createTempWorkspaceUri("pull-table-no-settings"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async () => {
          throw new Error("must-not-be-called");
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("shows cancelled info when table selection is dismissed", async () => {
    const shownInfos: string[] = [];

    await runSnPullTableCommand(
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
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-cancel"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async () => undefined,
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_TABLE_CANCELLED]);
  });

  test("builds table picker descriptions with plural setting counts", async () => {
    const shownInfos: string[] = [];
    const pickerDescriptions: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "widgets_html",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "html", field_name: "template" }],
          },
          {
            folder: "widgets_css",
            table: "sp_widget",
            query: "active=true",
            key: "id",
            fields: [{ extension: "css", field_name: "css" }],
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
          createTempWorkspaceUri("pull-table-plural"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => {
          pickerDescriptions.push(
            ...items.map((item) => item.description ?? ""),
          );
          return undefined;
        },
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(pickerDescriptions, ["2 settings"]);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_TABLE_CANCELLED]);
  });

  test("pulls selected table using pullTable and records index updates", async () => {
    const shownInfos: string[] = [];
    const selectedTables: string[] = [];
    const usedRootDirs: string[] = [];
    const recordedUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullTableCommand(
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
        pullConfiguredScripts: async () => ({
          settings: 0,
          records: 0,
          files: 0,
        }),
        pullTable: async (
          _context,
          _workspaceUri,
          _settings,
          table,
          options,
        ) => {
          selectedTables.push(table);
          usedRootDirs.push(options?.rootDir ?? "missing");
          options?.onFileWritten?.({
            settingFolder: "widgets",
            fileName: "widget.html",
            localPath: "app/widgets/widget/widget.html",
            table: "sp_widget",
            sysId: "abc123",
            fieldName: "template",
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
          createTempWorkspaceUri("pull-table-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) =>
          items.find((item) => item.label === "sp_widget"),
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async (_workspaceUri, updates) => {
          recordedUpdates.push(...updates);
        },
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(selectedTables, ["sp_widget"]);
    assert.deepStrictEqual(usedRootDirs, ["app"]);
    assert.deepStrictEqual(recordedUpdates, [
      {
        localPath: "app/widgets/widget/widget.html",
        table: "sp_widget",
        sysId: "abc123",
        fieldName: "template",
        baseHash: "sha256:abc",
      },
    ]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 1 files from 1 records (sp_widget).`,
    ]);
  });

  test("falls back to pullConfiguredScripts when pullTable is unavailable", async () => {
    const shownInfos: string[] = [];
    const capturedSettingsLengths: number[] = [];

    await runSnPullTableCommand(
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
          {
            folder: "rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "src",
          pull: { clearBeforePull: "ask" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async (_context, _workspaceUri, settings) => {
          capturedSettingsLengths.push(settings.length);
          return {
            settings: settings.length,
            records: 2,
            files: 2,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-fallback"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) =>
          items.find((item) => item.label === "sp_widget"),
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(capturedSettingsLengths, [1]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 2 files from 2 records (sp_widget).`,
    ]);
  });

  test("shows prefixed error when pull fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullTableCommand(
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
        getPreferences: async () => ({
          rootDir: "src",
          pull: { clearBeforePull: "ask" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("pull-table-fail");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-failed"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        createDirectory: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_FAILED_PREFIX} (SN_PULL_TABLE_FAILED) pull-table-fail`,
    ]);
  });

  test("default runtime succeeds when vscode APIs are patched", async () => {
    const shownInfos: string[] = [];
    await withPatchedWorkspaceFolders(
      [
        {
          uri: createTempWorkspaceUri("pull-table-default-runtime"),
          name: "ws",
          index: 0,
        },
      ] as vscode.WorkspaceFolder[],
      async () => {
        await withPatchedWindowMethods(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async (items) => items[0],
          async (_options, task) => task({ report: () => undefined }),
          async () => {
            await runSnPullTableCommand(
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
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 1 files from 1 records (sp_widget).`,
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
  const originalWithProgress = windowObject.withProgress;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showQuickPick = showQuickPick;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.withProgress = originalWithProgress;
  }
}
