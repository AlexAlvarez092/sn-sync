import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPushActiveCommand,
  runSnPushActiveCommand,
} from "@commands/snPushActiveCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { hashText } from "@shared/services/hashService.js";

suite("snPushActiveCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPushActiveCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes command with default runtime", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPushActiveCommand(context, {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => undefined,
      });

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

  test("default runtime reads active editor from vscode.window", async () => {
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: vscode.Uri.file("/tmp/ws"), name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMessages(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => {
            await runSnPushActiveCommand(
              {} as vscode.ExtensionContext,
              {
                getRemoteFieldContent: async () => "",
                pushFieldContent: async () => undefined,
              },
              {
                findEntryByLocalPath: async () => undefined,
                toWorkspaceRelativePath: () => "",
                getModifiedCandidates: async () => [],
                recordPullFiles: async () => undefined,
                updateBaseHashes: async () => undefined,
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_ACTIVE_NO_EDITOR,
    ]);
  });

  test("shows error when no workspace is open", async () => {
    const shownErrors: string[] = [];

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => undefined,
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => undefined,
        getActiveTextEditor: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no active editor exists", async () => {
    const shownInfos: string[] = [];

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => undefined,
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () => undefined,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_ACTIVE_NO_EDITOR,
    ]);
  });

  test("shows info when active file is not indexed", async () => {
    const shownInfos: string[] = [];

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => undefined,
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_ACTIVE_NOT_INDEXED,
    ]);
  });

  test("shows info when active file has no local changes", async () => {
    const shownInfos: string[] = [];
    let fetchedRemote = false;

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => {
          fetchedRemote = true;
          return "old";
        },
        pushFieldContent: async () => undefined,
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("same"),
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "same",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(fetchedRemote, false);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_ACTIVE_NO_LOCAL_CHANGES,
    ]);
  });

  test("shows conflict error when remote changed from baseline", async () => {
    const shownErrors: string[] = [];
    let pushed = false;

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-new",
        pushFieldContent: async () => {
          pushed = true;
        },
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("old"),
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "local-new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.strictEqual(pushed, false);
    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PUSH_ACTIVE_CONFLICT_PREFIX} src/a.js`,
    ]);
  });

  test("shows detailed error when push active throws", async () => {
    const shownErrors: string[] = [];

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => {
          throw new Error("remote-fail");
        },
        pushFieldContent: async () => undefined,
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("old"),
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "local-new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PUSH_ACTIVE_FAILED_PREFIX} remote-fail`,
    ]);
  });

  test("pushes active file when no conflict is detected", async () => {
    const shownInfos: string[] = [];
    let pushed = false;
    let updated = false;

    await runSnPushActiveCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "old",
        pushFieldContent: async () => {
          pushed = true;
        },
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("old"),
          updatedAt: "now",
        }),
        toWorkspaceRelativePath: () => "src/a.js",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => {
          updated = true;
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        getActiveTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(pushed, true);
    assert.strictEqual(updated, true);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PUSH_ACTIVE_SUCCESS]);
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
