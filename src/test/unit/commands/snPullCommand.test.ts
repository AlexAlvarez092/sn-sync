import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPullCommand,
  runSnPullCommand,
} from "@commands/snPullCommand.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";

suite("snPullCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPullCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
      showQuickPick: async () => {
        throw new Error("must-not-be-called");
      },
      executeCommand: async () => {
        throw new Error("must-not-be-called");
      },
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when quick pick is cancelled", async () => {
    const shownInfos: string[] = [];
    let executed = false;

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
      showQuickPick: async () => undefined,
      executeCommand: async () => {
        executed = true;
      },
    });

    assert.strictEqual(executed, false);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_CANCELLED]);
  });

  test("dispatches to pull all files", async () => {
    const executedCommands: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(items: readonly T[]) =>
        Promise.resolve(items[0]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [
      SN_SYNC_COMMANDS.PULL_ALL_FILES,
    ]);
  });

  test("dispatches to pull current", async () => {
    const executedCommands: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(items: readonly T[]) =>
        Promise.resolve(items[1]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [SN_SYNC_COMMANDS.PULL_CURRENT]);
  });

  test("dispatches to pull table", async () => {
    const executedCommands: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(items: readonly T[]) =>
        Promise.resolve(items[2]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [SN_SYNC_COMMANDS.PULL_TABLE]);
  });

  test("dispatches to pull by sys_id", async () => {
    const executedCommands: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(items: readonly T[]) =>
        Promise.resolve(items[3]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [
      SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
    ]);
  });

  test("register callback executes pull command", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPullCommand(context);

      await withPatchedWorkspaceFolders(undefined, async () => {
        await withPatchedWindowMessages(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async () => undefined,
          async () => {
            await invokeRegistered();
          },
        );
      });
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows error when executeCommand throws", async () => {
    const shownErrors: string[] = [];

    await runSnPullCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(items: readonly T[]) =>
        Promise.resolve(items[0]),
      executeCommand: async () => {
        throw new Error("exec-failed");
      },
    });

    assert.strictEqual(shownErrors.length, 1);
    assert.ok(shownErrors[0].includes("exec-failed"));
  });

  test("default runtime uses vscode.window.showQuickPick and cancels", async () => {
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: vscode.Uri.file("/tmp/ws"), name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowShowQuickPick(
          async () => undefined,
          async () => {
            await withPatchedWindowMessages(
              async () => undefined,
              async (message: string) => {
                shownInfos.push(message);
                return undefined;
              },
              async () => {
                await runSnPullCommand();
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_CANCELLED]);
  });

  test("default runtime uses vscode.commands.executeCommand", async () => {
    const executedCommands: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: vscode.Uri.file("/tmp/ws"), name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowShowQuickPick(
          async <T extends vscode.QuickPickItem>(items: readonly T[]) =>
            items[0],
          async () => {
            await withPatchedCommandsExecuteCommand(
              async (command: string) => {
                executedCommands.push(command);
              },
              async () => {
                await runSnPullCommand();
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(executedCommands, [
      SN_SYNC_COMMANDS.PULL_ALL_FILES,
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

async function withPatchedWindowShowQuickPick(
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ) => Thenable<T | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showQuickPick: <T extends vscode.QuickPickItem>(
      items: readonly T[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<T | undefined>;
  };

  const originalShowQuickPick = windowObject.showQuickPick;
  windowObject.showQuickPick = showQuickPick;

  try {
    await run();
  } finally {
    windowObject.showQuickPick = originalShowQuickPick;
  }
}

async function withPatchedCommandsExecuteCommand(
  executeCommand: (command: string) => Thenable<unknown>,
  run: () => Promise<void>,
): Promise<void> {
  const commandsObject = vscode.commands as unknown as {
    executeCommand: (command: string) => Thenable<unknown>;
  };

  const originalExecuteCommand = commandsObject.executeCommand;
  commandsObject.executeCommand = executeCommand;

  try {
    await run();
  } finally {
    commandsObject.executeCommand = originalExecuteCommand;
  }
}
