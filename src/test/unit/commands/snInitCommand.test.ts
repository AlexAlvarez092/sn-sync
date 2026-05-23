import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnInitCommand,
  runSnInitCommand,
  type SnInitCommandRuntime,
  type SnSyncInitializer,
} from "@commands/snInitCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snInitCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnInitCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    let initializeCalled = false;
    const shownErrors: string[] = [];

    const configService: SnSyncInitializer = {
      initialize: async () => {
        initializeCalled = true;
      },
    };
    const runtime: SnInitCommandRuntime = {
      getWorkspaceFolderUri: () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnInitCommand(configService, runtime);

    assert.strictEqual(initializeCalled, false);
    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("initializes and shows success message", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri();
    let initializedUri: vscode.Uri | undefined;

    const configService: SnSyncInitializer = {
      initialize: async (workspaceFolderUri: vscode.Uri) => {
        initializedUri = workspaceFolderUri;
      },
    };
    const runtime: SnInitCommandRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnInitCommand(configService, runtime);

    assert.strictEqual(initializedUri?.toString(), workspaceUri.toString());
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.INIT_SUCCESS]);
  });

  test("shows detailed error when initialization fails", async () => {
    const shownErrors: string[] = [];
    const workspaceUri = createTempWorkspaceUri();

    const configService: SnSyncInitializer = {
      initialize: async () => {
        throw new Error("fail");
      },
    };
    const runtime: SnInitCommandRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnInitCommand(configService, runtime);

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.INIT_FAILED_PREFIX} fail`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("default-runtime-success");
    let initializeCalls = 0;
    const shownInfos: string[] = [];

    const configService: SnSyncInitializer = {
      initialize: async () => {
        initializeCalls += 1;
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
            await runSnInitCommand(configService);
          },
        );
      },
    );

    assert.strictEqual(initializeCalls, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.INIT_SUCCESS]);
  });

  test("uses default runtime and shows failure message when init throws", async () => {
    const workspaceUri = createTempWorkspaceUri("default-runtime-failure");
    const shownErrors: string[] = [];

    const configService: SnSyncInitializer = {
      initialize: async () => {
        throw new Error("default-runtime-fail");
      },
    };

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMessages(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async (_message: string) => undefined,
          async () => {
            await runSnInitCommand(configService);
          },
        );
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.INIT_FAILED_PREFIX} default-runtime-fail`,
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
