import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullCommand,
  runSnPullCommand,
  type SnPullRuntime,
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
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("pulls configured scripts and shows success summary", async () => {
    const shownInfos: string[] = [];

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
          records: 2,
          files: 2,
        }),
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_SUCCESS_PREFIX} 2 files from 2 records (1 settings).`,
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
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
  }
}
