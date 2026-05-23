import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnAuthCommand,
  runSnAuthCommand,
  type SnAuthRuntime,
} from "@commands/snAuthCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snAuthCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnAuthCommand(context);

    assert.strictEqual(context.subscriptions.length, 1);
    context.subscriptions[0].dispose();
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];
    const authService = {
      saveAuth: async (): Promise<void> => {
        throw new Error("must not be called");
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => undefined,
      askInput: async () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows cancelled info when user aborts input flow", async () => {
    const shownInfos: string[] = [];
    let saveCalled = false;

    const authService = {
      saveAuth: async (): Promise<void> => {
        saveCalled = true;
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri(),
      askInput: async () => undefined,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.strictEqual(saveCalled, false);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when user aborts on instance url", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", undefined];
    let askCall = 0;
    let saveCalled = false;

    const authService = {
      saveAuth: async (): Promise<void> => {
        saveCalled = true;
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri(),
      askInput: async () => {
        const value = answers[askCall];
        askCall += 1;
        return value;
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.strictEqual(saveCalled, false);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when user aborts on username", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", "https://dev1.service-now.com", undefined];
    let askCall = 0;

    const authService = {
      saveAuth: async (): Promise<void> => {
        throw new Error("must not be called");
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri(),
      askInput: async () => {
        const value = answers[askCall];
        askCall += 1;
        return value;
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when user aborts on password", async () => {
    const shownInfos: string[] = [];
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "admin",
      undefined,
    ];
    let askCall = 0;

    const authService = {
      saveAuth: async (): Promise<void> => {
        throw new Error("must not be called");
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri(),
      askInput: async () => {
        const value = answers[askCall];
        askCall += 1;
        return value;
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("collects auth inputs and saves them", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("auth-success");
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "admin",
      "super-secret",
    ];
    let askCall = 0;
    let receivedContext: vscode.ExtensionContext | undefined;
    let receivedWorkspaceUri: vscode.Uri | undefined;
    let receivedAuthInput:
      | {
          instanceName: string;
          instanceUrl: string;
          username: string;
          password: string;
        }
      | undefined;

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    const authService = {
      saveAuth: async (
        currentContext: vscode.ExtensionContext,
        currentWorkspaceUri: vscode.Uri,
        authInput: {
          instanceName: string;
          instanceUrl: string;
          username: string;
          password: string;
        },
      ): Promise<void> => {
        receivedContext = currentContext;
        receivedWorkspaceUri = currentWorkspaceUri;
        receivedAuthInput = authInput;
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      askInput: async () => {
        const value = answers[askCall];
        askCall += 1;
        return value;
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
    };

    await runSnAuthCommand(context, authService as unknown as never, runtime);

    assert.strictEqual(receivedContext, context);
    assert.strictEqual(
      receivedWorkspaceUri?.toString(),
      workspaceUri.toString(),
    );
    assert.deepStrictEqual(receivedAuthInput, {
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "super-secret",
    });
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_SUCCESS]);
  });

  test("shows detailed error when save auth fails", async () => {
    const shownErrors: string[] = [];
    const workspaceUri = createTempWorkspaceUri("auth-failure");
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "admin",
      "super-secret",
    ];
    let askCall = 0;

    const authService = {
      saveAuth: async (): Promise<void> => {
        throw new Error("save-failed");
      },
    };
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      askInput: async () => {
        const value = answers[askCall];
        askCall += 1;
        return value;
      },
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      authService as unknown as never,
      runtime,
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX} save-failed`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("auth-default-runtime-success");
    const shownInfos: string[] = [];
    const answers = [
      "dev-default",
      "https://dev-default.service-now.com",
      "admin",
      "secret",
    ];
    let askCall = 0;
    let saveCalled = false;

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const authService = {
      saveAuth: async (): Promise<void> => {
        saveCalled = true;
      },
    };

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMethods(
          async () => {
            const value = answers[askCall];
            askCall += 1;
            return value;
          },
          async (_message: string) => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => {
            await runSnAuthCommand(context, authService as unknown as never);
          },
        );
      },
    );

    assert.strictEqual(saveCalled, true);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_SUCCESS]);
  });

  test("uses default runtime and shows error when no workspace exists", async () => {
    const shownErrors: string[] = [];

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMethods(
        async () => undefined,
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async () => undefined,
        async () => {
          await runSnAuthCommand(
            {} as vscode.ExtensionContext,
            {
              saveAuth: async (): Promise<void> => {
                throw new Error("must not be called");
              },
            } as unknown as never,
          );
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
  showInputBox: (
    options: vscode.InputBoxOptions,
  ) => Thenable<string | undefined>,
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showInputBox: (
      options: vscode.InputBoxOptions,
    ) => Thenable<string | undefined>;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
  };

  const originalShowInputBox = windowObject.showInputBox;
  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;

  windowObject.showInputBox = showInputBox;
  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;

  try {
    await run();
  } finally {
    windowObject.showInputBox = originalShowInputBox;
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
  }
}
