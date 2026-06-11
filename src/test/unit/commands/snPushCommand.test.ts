import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPushCommand,
  runSnPushCommand,
} from "@commands/snPushCommand.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";

suite("snPushCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPushCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPushCommand({
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

    await runSnPushCommand({
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
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PUSH_CANCELLED]);
  });

  test("dispatches to push modified for all files", async () => {
    const executedCommands: string[] = [];

    await runSnPushCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(
        items: readonly T[],
      ) => Promise.resolve(items[0]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [SN_SYNC_COMMANDS.PUSH_MODIFIED]);
  });

  test("dispatches to push active for current file", async () => {
    const executedCommands: string[] = [];

    await runSnPushCommand({
      getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: <T extends vscode.QuickPickItem>(
        items: readonly T[],
      ) => Promise.resolve(items[1]),
      executeCommand: async (command: string) => {
        executedCommands.push(command);
      },
    });

    assert.deepStrictEqual(executedCommands, [SN_SYNC_COMMANDS.PUSH_ACTIVE]);
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
