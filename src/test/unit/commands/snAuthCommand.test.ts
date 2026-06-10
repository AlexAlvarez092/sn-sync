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

    withPatchedRegisterCommand(() => {
      registerSnAuthCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];
    const runtime: SnAuthRuntime = {
      getWorkspaceFolderUri: () => undefined,
      askInput: async () => undefined,
      askChoice: async () => undefined,
      openExternal: async () => true,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
    };

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      runtime,
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows cancelled info when method selection is dismissed", async () => {
    const shownInfos: string[] = [];

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-cancel-method"),
        askChoice: async () => undefined,
        askInput: async () => undefined,
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("collects basic auth inputs and saves them", async () => {
    const shownInfos: string[] = [];
    const workspaceUri = createTempWorkspaceUri("auth-basic-success");
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "admin",
      "super-secret",
    ];
    let askInputCall = 0;
    let receivedAuthInput: unknown;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (
          _context: vscode.ExtensionContext,
          _workspaceFolderUri: vscode.Uri,
          authInput: unknown,
        ): Promise<void> => {
          receivedAuthInput = authInput;
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => workspaceUri,
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(receivedAuthInput, {
      authType: "basic",
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "super-secret",
    });
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_SUCCESS]);
  });

  test("shows cancelled info when basic instance name prompt is dismissed", async () => {
    const shownInfos: string[] = [];

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-cancel-instance"),
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => undefined,
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when basic username prompt is dismissed", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", "https://dev1.service-now.com", undefined];
    let askInputCall = 0;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-cancel-username"),
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when basic instance URL prompt is dismissed", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", undefined];
    let askInputCall = 0;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-cancel-instance-url"),
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows cancelled info when basic password prompt is dismissed", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", "https://dev1.service-now.com", "admin", undefined];
    let askInputCall = 0;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-cancel-password"),
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("collects oauth inputs, opens browser, and saves them", async () => {
    const shownInfos: string[] = [];
    const openedUris: string[] = [];
    const workspaceUri = createTempWorkspaceUri("auth-oauth-success");
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "sdk-client-id",
      "oauth-code-123",
    ];
    let askInputCall = 0;
    let receivedAuthInput: unknown;
    let oauthBeginArgs: {
      workspaceFolderUri: vscode.Uri;
      instanceUrl: string;
      clientId: string;
    } | undefined;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (
          _context: vscode.ExtensionContext,
          _workspaceFolderUri: vscode.Uri,
          authInput: unknown,
        ): Promise<void> => {
          receivedAuthInput = authInput;
        },
        beginOAuthSignIn: async (
          currentWorkspaceFolderUri: vscode.Uri,
          instanceUrl: string,
          clientId: string,
        ) => {
          oauthBeginArgs = {
            workspaceFolderUri: currentWorkspaceFolderUri,
            instanceUrl,
            clientId,
          };
          return {
            authorizationUrl: "https://dev1.service-now.com/oauth_auth.do?x=1",
            codeVerifier: "verifier-1",
          };
        },
      },
      {
        getWorkspaceFolderUri: () => workspaceUri,
        askChoice: async () => ({ label: "oauth", authType: "oauth" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async (uri: vscode.Uri) => {
          openedUris.push(uri.toString());
          return true;
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(
      oauthBeginArgs?.workspaceFolderUri.toString(),
      workspaceUri.toString(),
    );
    assert.strictEqual(oauthBeginArgs?.instanceUrl, "https://dev1.service-now.com");
    assert.strictEqual(oauthBeginArgs?.clientId, "sdk-client-id");
    assert.deepStrictEqual(openedUris, [
      "https://dev1.service-now.com/oauth_auth.do?x%3D1",
    ]);
    assert.deepStrictEqual(receivedAuthInput, {
      authType: "oauth",
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      clientId: "sdk-client-id",
      authorizationCode: "oauth-code-123",
      codeVerifier: "verifier-1",
    });
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.AUTH_OAUTH_OPEN_BROWSER_INFO,
      SN_SYNC_MESSAGES.AUTH_SUCCESS,
    ]);
  });

  test("shows cancelled info when oauth code prompt is dismissed", async () => {
    const shownInfos: string[] = [];
    const answers = [
      "dev1",
      "https://dev1.service-now.com",
      "sdk-client-id",
      undefined,
    ];
    let askInputCall = 0;
    let saveCalled = false;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          saveCalled = true;
        },
        beginOAuthSignIn: async () => ({
          authorizationUrl: "https://dev1.service-now.com/oauth_auth.do?x=1",
          codeVerifier: "verifier-1",
        }),
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-oauth-cancel"),
        askChoice: async () => ({ label: "oauth", authType: "oauth" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(saveCalled, false);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.AUTH_OAUTH_OPEN_BROWSER_INFO,
      SN_SYNC_MESSAGES.AUTH_CANCELLED,
    ]);
  });

  test("shows cancelled info when oauth client id prompt is dismissed", async () => {
    const shownInfos: string[] = [];
    const answers = ["dev1", "https://dev1.service-now.com", undefined];
    let askInputCall = 0;

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("must not be called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-oauth-cancel-client-id"),
        askChoice: async () => ({ label: "oauth", authType: "oauth" }),
        askInput: async () => {
          const value = answers[askInputCall];
          askInputCall += 1;
          return value;
        },
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_CANCELLED]);
  });

  test("shows detailed error when save auth fails", async () => {
    const shownErrors: string[] = [];

    await runSnAuthCommand(
      {} as vscode.ExtensionContext,
      {
        saveAuth: async (): Promise<void> => {
          throw new Error("save-failed");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must not be called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("auth-failure"),
        askChoice: async () => ({ label: "basic", authType: "basic" }),
        askInput: async () => "x",
        openExternal: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX} (SN_AUTH_FAILED) save-failed`,
    ]);
  });

  test("register callback executes command with default runtime", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnAuthCommand(context, {
        saveAuth: async (): Promise<void> => {
          throw new Error("must-not-be-called");
        },
        beginOAuthSignIn: async () => {
          throw new Error("must-not-be-called");
        },
      });

      await withPatchedWorkspaceFolders(undefined, async () => {
        await withPatchedWindowAndEnvMethods(
          async () => undefined,
          async () => undefined,
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async () => undefined,
          async () => true,
          async () => {
            await invokeRegistered();
          },
        );
      });
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("auth-default-runtime-success");
    const shownInfos: string[] = [];
    const answers = ["dev-default", "https://dev-default.service-now.com", "admin", "secret"];
    let askCall = 0;
    let saveCalled = false;

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowAndEnvMethods(
          async () => ({ label: "basic", authType: "basic" }),
          async () => {
            const value = answers[askCall];
            askCall += 1;
            return value;
          },
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => true,
          async () => {
            await runSnAuthCommand(context, {
              saveAuth: async (): Promise<void> => {
                saveCalled = true;
              },
              beginOAuthSignIn: async () => {
                throw new Error("must not be called");
              },
            });
          },
        );
      },
    );

    assert.strictEqual(saveCalled, true);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.AUTH_SUCCESS]);
  });

  test("uses default runtime oauth path and opens external browser", async () => {
    const workspaceUri = createTempWorkspaceUri("auth-default-runtime-oauth");
    const shownInfos: string[] = [];
    const answers = [
      "dev-default",
      "https://dev-default.service-now.com",
      "client-default",
      "oauth-code-default",
    ];
    let askCall = 0;
    let openExternalCalled = false;

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowAndEnvMethods(
          async () => ({ label: "oauth", authType: "oauth" }),
          async () => {
            const value = answers[askCall];
            askCall += 1;
            return value;
          },
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => {
            openExternalCalled = true;
            return true;
          },
          async () => {
            await runSnAuthCommand(
              {} as vscode.ExtensionContext,
              {
                saveAuth: async (): Promise<void> => undefined,
                beginOAuthSignIn: async () => ({
                  authorizationUrl: "https://dev-default.service-now.com/oauth_auth.do?x=1",
                  codeVerifier: "verifier-1",
                }),
              },
            );
          },
        );
      },
    );

    assert.strictEqual(openExternalCalled, true);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.AUTH_OAUTH_OPEN_BROWSER_INFO,
      SN_SYNC_MESSAGES.AUTH_SUCCESS,
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

async function withPatchedWindowAndEnvMethods(
  showQuickPick: (
    items: readonly vscode.QuickPickItem[],
    options: vscode.QuickPickOptions,
  ) => Thenable<vscode.QuickPickItem | undefined>,
  showInputBox: (
    options: vscode.InputBoxOptions,
  ) => Thenable<string | undefined>,
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  openExternal: (uri: vscode.Uri) => Thenable<boolean>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showQuickPick: (
      items: readonly vscode.QuickPickItem[],
      options: vscode.QuickPickOptions,
    ) => Thenable<vscode.QuickPickItem | undefined>;
    showInputBox: (
      options: vscode.InputBoxOptions,
    ) => Thenable<string | undefined>;
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
  };
  const envObject = vscode.env as unknown as {
    openExternal: (uri: vscode.Uri) => Thenable<boolean>;
  };

  const originalShowQuickPick = windowObject.showQuickPick;
  const originalShowInputBox = windowObject.showInputBox;
  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalOpenExternal = envObject.openExternal;

  windowObject.showQuickPick = showQuickPick;
  windowObject.showInputBox = showInputBox;
  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  envObject.openExternal = openExternal;

  try {
    await run();
  } finally {
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showInputBox = originalShowInputBox;
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    envObject.openExternal = originalOpenExternal;
  }
}
