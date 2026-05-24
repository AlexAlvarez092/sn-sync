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

  test("falls back to replacePullSnapshot when clearIndex is unavailable", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("reset-index-fallback");
    let snapshotCalls = 0;

    await runSnResetIndexCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        replacePullSnapshot: async (
          receivedUri: vscode.Uri,
          updates: Array<unknown>,
        ) => {
          assert.strictEqual(receivedUri.toString(), workspaceUri.toString());
          assert.deepStrictEqual(updates, []);
          snapshotCalls += 1;
        },
        recordPullFiles: async () => undefined,
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => workspaceUri,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(snapshotCalls, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_INDEX_SUCCESS]);
  });

  test("shows detailed error when reset operation is unsupported", async () => {
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
          createTempWorkspaceUri("reset-index-unsupported"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RESET_INDEX_FAILED_PREFIX} Index service does not support reset operations.`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("reset-index-default-runtime");
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
