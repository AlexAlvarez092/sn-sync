import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnAuthValidateCommand,
  runSnAuthValidateCommand,
  type SnAuthValidateRuntime,
} from "@commands/snAuthValidateCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snAuthValidateCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnAuthValidateCommand(context);

    assert.strictEqual(context.subscriptions.length, 1);
    context.subscriptions[0].dispose();
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnAuthValidateCommand(
      {} as vscode.ExtensionContext,
      {
        validateAuth: async (): Promise<void> => {
          throw new Error("must not be called");
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

  test("validates login and shows success message", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("validate-auth-success");
    let receivedWorkspaceUri: vscode.Uri | undefined;

    await runSnAuthValidateCommand(
      {} as vscode.ExtensionContext,
      {
        validateAuth: async (
          _context: vscode.ExtensionContext,
          currentWorkspaceUri: vscode.Uri,
        ): Promise<void> => {
          receivedWorkspaceUri = currentWorkspaceUri;
        },
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

    assert.strictEqual(
      receivedWorkspaceUri?.toString(),
      workspaceUri.toString(),
    );
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS,
    ]);
  });

  test("shows detailed error when validation fails", async () => {
    const shownErrors: string[] = [];

    await runSnAuthValidateCommand(
      {} as vscode.ExtensionContext,
      {
        validateAuth: async (): Promise<void> => {
          throw new Error("auth-invalid");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("validate-auth-fail"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.AUTH_VALIDATE_FAILED_PREFIX} (SN_AUTH_VALIDATE_FAILED) auth-invalid`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("validate-default-success");
    const shownInfos: string[] = [];
    let validateCalled = false;

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMethods(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => {
            await runSnAuthValidateCommand({} as vscode.ExtensionContext, {
              validateAuth: async (): Promise<void> => {
                validateCalled = true;
              },
            });
          },
        );
      },
    );

    assert.strictEqual(validateCalled, true);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.AUTH_VALIDATE_SUCCESS,
    ]);
  });

  test("uses default runtime and shows error when no workspace exists", async () => {
    const shownErrors: string[] = [];

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMethods(
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async () => undefined,
        async () => {
          await runSnAuthValidateCommand({} as vscode.ExtensionContext, {
            validateAuth: async (): Promise<void> => {
              throw new Error("must not be called");
            },
          });
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

async function withPatchedWindowMethods(
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
