import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnResetAuthCommand,
  runSnResetAuthCommand,
} from "@commands/snResetAuthCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snResetAuthCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnResetAuthCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnResetAuthCommand(
      {} as vscode.ExtensionContext,
      {
        resetAuth: async () => {
          throw new Error("must-not-be-called");
        },
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

  test("resets auth and shows success", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("reset-auth-success");
    let resetCalls = 0;

    await runSnResetAuthCommand(
      {} as vscode.ExtensionContext,
      {
        resetAuth: async (
          _context: vscode.ExtensionContext,
          receivedWorkspaceUri: vscode.Uri,
        ) => {
          assert.strictEqual(
            receivedWorkspaceUri.toString(),
            workspaceUri.toString(),
          );
          resetCalls += 1;
        },
      },
      {
        getWorkspaceFolderUri: () => workspaceUri,
        askConfirmation: async (message: string, actionLabel: string) => {
          assert.strictEqual(
            message,
            SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_PROMPT,
          );
          assert.strictEqual(
            actionLabel,
            SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_ACTION,
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

    assert.strictEqual(resetCalls, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_AUTH_SUCCESS]);
  });

  test("cancels reset when confirmation is dismissed", async () => {
    const shownInfos: string[] = [];
    let resetCalls = 0;

    await runSnResetAuthCommand(
      {} as vscode.ExtensionContext,
      {
        resetAuth: async () => {
          resetCalls += 1;
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("reset-auth-cancel"),
        askConfirmation: async () => false,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(resetCalls, 0);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_AUTH_CANCELLED]);
  });

  test("shows detailed error when reset auth fails", async () => {
    const shownErrors: string[] = [];

    await runSnResetAuthCommand(
      {} as vscode.ExtensionContext,
      {
        resetAuth: async () => {
          throw new Error("reset-auth-fail");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("reset-auth-failure"),
        askConfirmation: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RESET_AUTH_FAILED_PREFIX} (SN_RESET_AUTH_FAILED) reset-auth-fail`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("reset-auth-default-runtime");
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWarningMessage(
          SN_SYNC_MESSAGES.RESET_AUTH_CONFIRM_ACTION,
          async () => {
            await withPatchedWindowMessages(
              async (_message: string) => undefined,
              async (message: string) => {
                shownInfos.push(message);
                return undefined;
              },
              async () => {
                await runSnResetAuthCommand({} as vscode.ExtensionContext, {
                  resetAuth: async () => undefined,
                });
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_AUTH_SUCCESS]);
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
