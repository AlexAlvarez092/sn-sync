import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnResetSelectionsCommand,
  runSnResetSelectionsCommand,
  type SnResetSelectionsConfigService,
  type SnResetSelectionsRuntime,
} from "@commands/snResetSelectionsCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snResetSelectionsCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnResetSelectionsCommand(context);

    assert.strictEqual(context.subscriptions.length, 1);
    context.subscriptions[0].dispose();
  });

  test("shows error when no workspace folder is open", async () => {
    let clearCalled = false;
    const shownErrors: string[] = [];

    const configService: SnResetSelectionsConfigService = {
      clearActivationSelections: async () => {
        clearCalled = true;
      },
    };
    const runtime: SnResetSelectionsRuntime = {
      getWorkspaceFolderUri: () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnResetSelectionsCommand(configService, runtime);

    assert.strictEqual(clearCalled, false);
    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("clears selections and shows success message", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("reset-selections");
    let clearedUri: vscode.Uri | undefined;

    const configService: SnResetSelectionsConfigService = {
      clearActivationSelections: async (workspaceFolderUri: vscode.Uri) => {
        clearedUri = workspaceFolderUri;
      },
    };
    const runtime: SnResetSelectionsRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnResetSelectionsCommand(configService, runtime);

    assert.strictEqual(clearedUri?.toString(), workspaceUri.toString());
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_SELECTIONS_SUCCESS]);
  });

  test("shows detailed error when reset fails", async () => {
    const shownErrors: string[] = [];
    const workspaceUri = createTempWorkspaceUri("reset-selections-failure");

    const configService: SnResetSelectionsConfigService = {
      clearActivationSelections: async () => {
        throw new Error("reset-fail");
      },
    };
    const runtime: SnResetSelectionsRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnResetSelectionsCommand(configService, runtime);

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RESET_SELECTIONS_FAILED_PREFIX} reset-fail`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("default-runtime-reset-success");
    let clearCalls = 0;
    const shownInfos: string[] = [];

    const configService: SnResetSelectionsConfigService = {
      clearActivationSelections: async () => {
        clearCalls += 1;
      },
    };

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
            await runSnResetSelectionsCommand(configService);
          },
        );
      },
    );

    assert.strictEqual(clearCalls, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RESET_SELECTIONS_SUCCESS]);
  });

  test("uses default runtime and shows no-workspace error when workspace is missing", async () => {
    const shownErrors: string[] = [];

    const configService: SnResetSelectionsConfigService = {
      clearActivationSelections: async () => {
        throw new Error("must-not-be-called");
      },
    };

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMessages(
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async (_message: string) => undefined,
        async () => {
          await runSnResetSelectionsCommand(configService);
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
