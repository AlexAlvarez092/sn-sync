import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnUpdateSetResetCommand,
  runSnUpdateSetResetCommand,
  type SnUpdateSetResetConfigService,
  type SnUpdateSetResetRuntime,
} from "@commands/snUpdateSetResetCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snUpdateSetResetCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnUpdateSetResetCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    let clearCalled = false;
    const shownErrors: string[] = [];

    const configService: SnUpdateSetResetConfigService = {
      clearActivationSelections: async () => {
        clearCalled = true;
      },
    };
    const runtime: SnUpdateSetResetRuntime = {
      getWorkspaceFolderUri: () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnUpdateSetResetCommand(configService, runtime);

    assert.strictEqual(clearCalled, false);
    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("clears selections and shows success message", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("update-set-reset");
    let clearedUri: vscode.Uri | undefined;

    const configService: SnUpdateSetResetConfigService = {
      clearActivationSelections: async (workspaceFolderUri: vscode.Uri) => {
        clearedUri = workspaceFolderUri;
      },
    };
    const runtime: SnUpdateSetResetRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnUpdateSetResetCommand(configService, runtime);

    assert.strictEqual(clearedUri?.toString(), workspaceUri.toString());
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.UPDATE_SET_RESET_SUCCESS,
    ]);
  });

  test("shows detailed error when reset fails", async () => {
    const shownErrors: string[] = [];
    const workspaceUri = createTempWorkspaceUri("update-set-reset-failure");

    const configService: SnUpdateSetResetConfigService = {
      clearActivationSelections: async () => {
        throw new Error("reset-fail");
      },
    };
    const runtime: SnUpdateSetResetRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnUpdateSetResetCommand(configService, runtime);

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.UPDATE_SET_RESET_FAILED_PREFIX} reset-fail`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri(
      "default-runtime-update-set-reset-success",
    );
    let clearCalls = 0;
    const shownInfos: string[] = [];

    const configService: SnUpdateSetResetConfigService = {
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
            await runSnUpdateSetResetCommand(configService);
          },
        );
      },
    );

    assert.strictEqual(clearCalls, 1);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.UPDATE_SET_RESET_SUCCESS,
    ]);
  });

  test("uses default runtime and shows no-workspace error when workspace is missing", async () => {
    const shownErrors: string[] = [];

    const configService: SnUpdateSetResetConfigService = {
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
          await runSnUpdateSetResetCommand(configService);
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
