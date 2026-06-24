import * as assert from "assert";
import * as vscode from "vscode";
import {
  openExternalWithDefaultEnv,
  registerSnHelpCommand,
  runSnHelpCommand,
} from "@commands/snHelpCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snHelpCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnHelpCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes command with default runtime", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnHelpCommand(context);

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

    // openExternal in test env returns false → HELP_FAILED_PREFIX error is shown
    assert.ok(
      shownErrors.length === 0 || shownErrors[0].includes("sn-sync"),
    );
  });

  test("opens documentation URL and shows success message", async () => {
    const openedUris: string[] = [];
    const shownInfos: string[] = [];

    await runSnHelpCommand({
      openExternal: async (uri: vscode.Uri) => {
        openedUris.push(uri.toString());
        return true;
      },
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
      showErrorMessage: async () => undefined,
      getWorkspaceFolderUri: () => undefined,
    });

    assert.strictEqual(openedUris.length, 1);
    assert.ok(
      openedUris[0].includes("alexalvarez092.github.io/sn-sync"),
      `Expected GitHub Pages URL, got: ${openedUris[0]}`,
    );
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.HELP_SUCCESS]);
  });

  test("shows error message when openExternal returns false", async () => {
    const shownErrors: string[] = [];

    await runSnHelpCommand({
      openExternal: async () => false,
      showInformationMessage: async () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      getWorkspaceFolderUri: () => undefined,
    });

    assert.strictEqual(shownErrors.length, 1);
    assert.ok(
      shownErrors[0].includes(SN_SYNC_MESSAGES.HELP_FAILED_PREFIX),
      `Expected error prefix in message, got: ${shownErrors[0]}`,
    );
  });

  test("shows error message when openExternal throws", async () => {
    const shownErrors: string[] = [];

    await runSnHelpCommand({
      openExternal: async () => {
        throw new Error("browser-open-failed");
      },
      showInformationMessage: async () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      getWorkspaceFolderUri: () => undefined,
    });

    assert.strictEqual(shownErrors.length, 1);
    assert.ok(
      shownErrors[0].includes("browser-open-failed"),
      `Expected error detail in message, got: ${shownErrors[0]}`,
    );
  });

  test("openExternalWithDefaultEnv delegates to vscode.env.openExternal", async () => {
    const openedUris: vscode.Uri[] = [];
    const uri = vscode.Uri.parse("https://alexalvarez092.github.io/sn-sync/");

    const result = await openExternalWithDefaultEnv(uri, {
      openExternal: async (target: vscode.Uri) => {
        openedUris.push(target);
        return true;
      },
    });

    assert.strictEqual(result, true);
    assert.strictEqual(openedUris.length, 1);
    assert.strictEqual(openedUris[0].toString(), uri.toString());
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
  run: (invokeRegistered: () => Promise<void>) => Promise<void>,
): Promise<void> {
  const commandsObject = vscode.commands as unknown as {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };
  const originalRegisterCommand = commandsObject.registerCommand;
  let registered: (() => unknown) | undefined;

  commandsObject.registerCommand = (
    _command: string,
    callback: (...args: unknown[]) => unknown,
  ) => {
    registered = callback as () => unknown;
    return new vscode.Disposable(() => undefined);
  };

  try {
    await run(async () => {
      assert.ok(registered);
      await Promise.resolve(registered?.());
    });
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
