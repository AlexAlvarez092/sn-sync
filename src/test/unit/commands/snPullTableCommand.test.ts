import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  registerSnPullTableCommand,
  runSnPullTableCommand,
  type SnPullTableRuntime,
} from "@commands/snPullTableCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  createTempWorkspaceUri,
  withTempDir,
} from "@test/helpers/testRuntime.js";

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
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
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
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => {
          throw new Error("must-not-be-called");
        },
        delete: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("shows cancelled info when user dismisses quick-pick", async () => {
    const shownInfos: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
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
          createTempWorkspaceUri("pull-table-cancelled"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async () => undefined,
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => {
          throw new Error("must-not-be-called");
        },
        delete: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PULL_TABLE_CANCELLED,
    ]);
  });

  test("clears table folder and pulls with progress and shows success summary", async () => {
    const shownInfos: string[] = [];
    const deletedEntries: string[] = [];
    const pulledSettingFolders: string[] = [];
    const progressMessages: string[] = [];
    const progressIncrements: number[] = [];
    const progressTitles: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (_context, _workspaceUri, settings, options) => {
          pulledSettingFolders.push(settings[0].folder);
          options?.onFileWritten?.({
            settingFolder: settings[0].folder,
            fileName: "rule1.js",
          });
          options?.onFileWritten?.({
            settingFolder: settings[0].folder,
            fileName: "rule2.js",
          });
          return { settings: 1, records: 2, files: 2 };
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-table-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => items[0],
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
        readDirectory: async () => [
          ["rule1.js", vscode.FileType.File],
          ["stale.js", vscode.FileType.File],
        ],
        delete: async (uri: vscode.Uri) => {
          deletedEntries.push(uri.toString());
        },
        withProgress: async (title, task) => {
          progressTitles.push(title);
          return task({
            report: ({ message, increment }) => {
              progressMessages.push(message ?? "");
              if (typeof increment === "number") {
                progressIncrements.push(increment);
              }
            },
          });
        },
      },
    );

    assert.strictEqual(deletedEntries.length, 2);
    assert.ok(deletedEntries[0].includes("/src/business_rules/rule1.js"));
    assert.ok(deletedEntries[1].includes("/src/business_rules/stale.js"));
    assert.deepStrictEqual(pulledSettingFolders, ["business_rules"]);
    assert.deepStrictEqual(progressTitles, [
      "Pulling scripts from ServiceNow...",
    ]);
    assert.deepStrictEqual(progressMessages, [
      "Writing 1 files... (business_rules/rule1.js)",
      "Writing 2 files... (business_rules/rule2.js)",
      "",
    ]);
    assert.deepStrictEqual(progressIncrements, [100]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 2 files from 2 records (business_rules).`,
    ]);
  });

  test("keeps folder when skip action selected and still syncs", async () => {
    let deleteCalled = false;
    const shownInfos: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
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
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-keep-folder"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => items[0],
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_SKIP_ACTION,
        readDirectory: async () => {
          throw new Error("must-not-be-called");
        },
        delete: async () => {
          deleteCalled = true;
        },
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.strictEqual(deleteCalled, false);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 1 files from 1 records (business_rules).`,
    ]);
  });

  test("clears table folder ignores missing folder (FileNotFound)", async () => {
    const shownInfos: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => ({
          settings: 1,
          records: 0,
          files: 0,
        }),
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-folder-missing"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showQuickPick: async (items) => items[0],
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
        readDirectory: async () => {
          throw new Error("FileNotFound");
        },
        delete: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 0 files from 0 records (business_rules).`,
    ]);
  });

  test("shows detailed error when pull fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("pull-table-fail");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-table-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_FAILED_PREFIX} pull-table-fail`,
    ]);
  });

  test("shows detailed error when clearing table folder fails with non-FileNotFound error", async () => {
    const shownErrors: string[] = [];

    await runSnPullTableCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
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
          createTempWorkspaceUri("pull-table-clear-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showQuickPick: async (items) => items[0],
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
        readDirectory: async () => {
          throw new Error("permission-denied");
        },
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({ report: () => undefined }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_TABLE_FAILED_PREFIX} permission-denied`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    await withTempDir("pull-table-default-runtime-success-", async (tempDir) => {
      const shownInfos: string[] = [];
      const workspaceUri = vscode.Uri.file(tempDir);
      const tableDir = path.join(tempDir, "src", "business_rules");

      await fs.mkdir(tableDir, { recursive: true });

      await withPatchedWorkspaceFolders(
        [{ uri: workspaceUri, name: "tmp", index: 0 }],
        async () => {
          await withPatchedWindowMessages(
            async (_message: string) => undefined,
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async (items) => items[0],
            async () =>
              SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
            async (_options, task) =>
              task({ report: () => undefined }),
            async () => {
              await runSnPullTableCommand(
                {} as vscode.ExtensionContext,
                {
                  getSyncSettings: async () => [
                    {
                      folder: "business_rules",
                      table: "sys_script",
                      query: "active=true",
                      key: "name",
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

      assert.deepStrictEqual(shownInfos, [
        `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 1 files from 1 records (business_rules).`,
      ]);
    });
  });

  test("uses default runtime and clears table folder when it exists", async () => {
    await withTempDir("pull-table-default-runtime-clear-", async (tempDir) => {
      const shownInfos: string[] = [];
      const workspaceUri = vscode.Uri.file(tempDir);
      const tableDir = path.join(tempDir, "src", "business_rules");

      await fs.mkdir(path.join(tableDir, "sub"), { recursive: true });
      await fs.writeFile(
        path.join(tableDir, "old_rule.js"),
        "old",
        "utf-8",
      );

      await withPatchedWorkspaceFolders(
        [{ uri: workspaceUri, name: "tmp", index: 0 }],
        async () => {
          await withPatchedWindowMessages(
            async (_message: string) => undefined,
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async (items) => items[0],
            async () =>
              SN_SYNC_MESSAGES.PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION,
            async (_options, task) =>
              task({ report: () => undefined }),
            async () => {
              await runSnPullTableCommand(
                {} as vscode.ExtensionContext,
                {
                  getSyncSettings: async () => [
                    {
                      folder: "business_rules",
                      table: "sys_script",
                      query: "active=true",
                      key: "name",
                      fields: [{ extension: "js", field_name: "script" }],
                    },
                  ],
                } as unknown as never,
                {
                  pullConfiguredScripts: async () => ({
                    settings: 1,
                    records: 0,
                    files: 0,
                  }),
                },
              );
            },
          );
        },
      );

      const remainingEntries = await fs.readdir(tableDir).catch(() => null);
      assert.deepStrictEqual(remainingEntries, []);
      assert.deepStrictEqual(shownInfos, [
        `${SN_SYNC_MESSAGES.PULL_TABLE_SUCCESS_PREFIX} 0 files from 0 records (business_rules).`,
      ]);
    });
  });

  test("uses default runtime and shows no-workspace error when workspace is missing", async () => {
    const shownErrors: string[] = [];

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMessages(
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async (_message: string) => undefined,
        async () => undefined,
        async () => undefined,
        async (_options, task) =>
          task({ report: () => undefined }),
        async () => {
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
          );
        },
      );
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
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

type AnyQuickPickItem = vscode.QuickPickItem & Record<string, unknown>;

async function withPatchedWindowMessages(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  showQuickPick: (
    items: readonly AnyQuickPickItem[],
    options?: vscode.QuickPickOptions,
  ) => Thenable<AnyQuickPickItem | undefined>,
  showWarningMessage: (
    message: string,
    ...items: string[]
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
    showQuickPick: (
      items: readonly AnyQuickPickItem[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<AnyQuickPickItem | undefined>;
    showWarningMessage: (
      message: string,
      ...items: string[]
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
  const originalShowWarningMessage = windowObject.showWarningMessage;
  const originalWithProgress = windowObject.withProgress;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showQuickPick = showQuickPick;
  windowObject.showWarningMessage = showWarningMessage;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showWarningMessage = originalShowWarningMessage;
    windowObject.withProgress = originalWithProgress;
  }
}
