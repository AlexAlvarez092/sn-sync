import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnResetIndexCommand,
  runSnResetIndexCommand,
} from "@commands/snResetIndexCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snResetIndexCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnResetIndexCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnResetIndexCommand(
      {} as vscode.ExtensionContext,
      {
        clearIndex: async () => {
          throw new Error("must-not-be-called");
        },
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => undefined,
        askConfirmation: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("resets index using clearIndex and shows success", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("reset-index-success");
    let clearCalls = 0;

    await runSnResetIndexCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        clearIndex: async (receivedUri: vscode.Uri) => {
          assert.strictEqual(receivedUri.toString(), workspaceUri.toString());
          clearCalls += 1;
        },
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => workspaceUri,
        askConfirmation: async (message: string, actionLabel: string) => {
          assert.strictEqual(
            message,
            SN_SYNC_MESSAGES.RESET_INDEX_CONFIRM_PROMPT,
          );
          assert.strictEqual(
            actionLabel,
            SN_SYNC_MESSAGES.RESET_INDEX_CONFIRM_ACTION,
          );
          return true;
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(clearCalls, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS]);
  });

  test("cancels reset when confirmation is dismissed", async () => {
    const shownInfos: string[] = [];
    let clearCalls = 0;

    await runSnResetIndexCommand(
      {} as vscode.ExtensionContext,
      {
        clearIndex: async () => {
          clearCalls += 1;
        },
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("reset-index-cancel"),
        askConfirmation: async () => false,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(clearCalls, 0);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RESET_INDEX_CANCELLED,
    ]);
  });

  test("shows detailed error when reset fails", async () => {
    const shownErrors: string[] = [];

    await runSnResetIndexCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        clearIndex: async () => {
          throw new Error("clear-index-fail");
        },
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("reset-index-failure"),
        askConfirmation: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX} (SN_RESET_INDEX_FAILED) clear-index-fail`,
    ]);
  });

  test("shows detailed error when index service does not support clearIndex", async () => {
    const shownErrors: string[] = [];

    await runSnResetIndexCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("reset-index-missing-clear"),
        askConfirmation: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX} (SN_RESET_INDEX_FAILED) Index service does not support clearIndex`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("reset-index-default-runtime");
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWarningMessage(
          SN_SYNC_MESSAGES.RESET_INDEX_CONFIRM_ACTION,
          async () => {
            await withPatchedWindowMessages(
              async (_message: string) => undefined,
              async (message: string) => {
                shownInfos.push(message);
                return undefined;
              },
              async () => {
                await runSnResetIndexCommand(
                  {
                    workspaceState: {
                      get: () => undefined,
                      update: async () => undefined,
                    },
                  } as unknown as vscode.ExtensionContext,
                  {
                    clearIndex: async () => undefined,
                    recordPullFiles: async () => undefined,
                    findEntryByLocalPath: async () => undefined,
                    toWorkspaceRelativePath: () => "",
                    getModifiedCandidates: async () => [],
                    updateBaseHashes: async () => undefined,
                  },
                );
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS]);
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

async function withPatchedWarningMessage(
  response: string | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showWarningMessage: (
      message: string,
      options: vscode.MessageOptions,
      ...items: string[]
    ) => Thenable<string | undefined>;
  };

  const originalShowWarningMessage = windowObject.showWarningMessage;
  windowObject.showWarningMessage = async () => response;

  try {
    await run();
  } finally {
    windowObject.showWarningMessage = originalShowWarningMessage;
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
