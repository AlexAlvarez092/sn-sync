import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullCommand,
  runSnPullCommand,
} from "@commands/snPullCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snPullCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnPullCommand(context);

    assert.strictEqual(context.subscriptions.length, 1);
    context.subscriptions[0].dispose();
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPullCommand(
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
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no settings are configured", async () => {
    const shownInfos: string[] = [];

    await runSnPullCommand(
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
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-no-settings"),
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

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("pulls configured scripts and shows granular progress and success summary", async () => {
    const shownInfos: string[] = [];
    const pulledSettingFolders: string[] = [];
    const progressMessages: string[] = [];
    const progressIncrements: number[] = [];
    const progressTitles: string[] = [];

    await runSnPullCommand(
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
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          settings,
          options,
        ) => {
          pulledSettingFolders.push(settings[0].folder);

          if (settings[0].folder === "business_rules") {
            options?.onFileWritten?.({
              settingFolder: "business_rules",
              fileName: "rule1.js",
            });
            options?.onFileWritten?.({
              settingFolder: "business_rules",
              fileName: "rule2.js",
            });

            return {
              settings: 1,
              records: 2,
              files: 2,
            };
          }

          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl1.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl2.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl3.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl4.js",
          });

          return {
            settings: 1,
            records: 3,
            files: 4,
          };
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
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

    assert.deepStrictEqual(pulledSettingFolders, [
      "business_rules",
      "security_rules",
    ]);
    assert.deepStrictEqual(progressTitles, [
      "Pulling scripts from ServiceNow...",
    ]);
    assert.deepStrictEqual(progressMessages, [
      "Writing 1 files... (business_rules/rule1.js)",
      "Writing 2 files... (business_rules/rule2.js)",
      "business_rules complete (2 files)",
      "Writing 3 files... (security_rules/acl1.js)",
      "Writing 4 files... (security_rules/acl2.js)",
      "Writing 5 files... (security_rules/acl3.js)",
      "Writing 6 files... (security_rules/acl4.js)",
      "security_rules complete (4 files)",
    ]);
    assert.deepStrictEqual(progressIncrements, [50, 50]);

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_SUCCESS_PREFIX} 6 files from 5 records (2 settings).`,
    ]);
  });

  test("shows detailed error when pull fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
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
        pullConfiguredScripts: async () => {
          throw new Error("pull-fail");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-failure"),
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
      `${SN_SYNC_MESSAGES.PULL_FAILED_PREFIX} pull-fail`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("pull-default-runtime-success");
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMessages(
          async (_message: string) => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async (_options, task) =>
            task({
              report: () => undefined,
            }),
          async () => {
            await runSnPullCommand(
              {} as vscode.ExtensionContext,
              {
                getSyncSettings: async () => [
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
      `${SN_SYNC_MESSAGES.PULL_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
    ]);
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
        async (_options, task) =>
          task({
            report: () => undefined,
          }),
        async () => {
          await runSnPullCommand(
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
