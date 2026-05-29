import * as assert from "assert";
import * as vscode from "vscode";
import {
  getDefaultActiveTextEditor,
  openExternalWithDefaultEnv,
  registerSnOpenActiveInInstanceCommand,
  runSnOpenActiveInInstanceCommand,
} from "@commands/snOpenActiveInInstanceCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snOpenActiveInInstanceCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnOpenActiveInInstanceCommand(context);

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
      registerSnOpenActiveInInstanceCommand(context, {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com",
        }),
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

  test("default runtime helper adapters use provided vscode APIs", async () => {
    const editor = {
      document: {
        uri: vscode.Uri.file("/tmp/ws/src/a.js"),
      },
    } as unknown as vscode.TextEditor;

    const resolvedEditor = getDefaultActiveTextEditor({
      activeTextEditor: editor,
    });
    assert.strictEqual(resolvedEditor, editor);

    let openedUri: string | undefined;
    const opened = await openExternalWithDefaultEnv(
      vscode.Uri.parse(
        "https://dev1.service-now.com/sys_script.do?sys_id=abc123",
      ),
      {
        openExternal: async (target: vscode.Uri) => {
          openedUri = target.toString(true);
          return true;
        },
      },
    );

    assert.strictEqual(opened, true);
    assert.strictEqual(
      openedUri,
      "https://dev1.service-now.com/sys_script.do?sys_id=abc123",
    );
  });

  test("shows error when no workspace is open", async () => {
    const shownErrors: string[] = [];

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com",
        }),
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
        openExternal: async () => true,
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

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com",
        }),
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
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.OPEN_ACTIVE_NO_EDITOR,
    ]);
  });

  test("shows info when active file is not indexed", async () => {
    const shownInfos: string[] = [];

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com",
        }),
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
            },
          }) as unknown as vscode.TextEditor,
        openExternal: async () => true,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.OPEN_ACTIVE_NOT_INDEXED,
    ]);
  });

  test("shows detailed error when instance is not configured", async () => {
    const shownErrors: string[] = [];

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => {
          throw new Error("No saved sn-sync auth found. Run 'sn: auth' first.");
        },
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc123",
          fieldName: "script",
          baseHash: "sha256:abc",
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
            },
          }) as unknown as vscode.TextEditor,
        openExternal: async () => true,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.OPEN_ACTIVE_FAILED_PREFIX} (SN_OPEN_ACTIVE_IN_INSTANCE_FAILED) No saved sn-sync auth found. Run 'sn: auth' first.`,
    ]);
  });

  test("shows detailed error when openExternal fails", async () => {
    const shownErrors: string[] = [];

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com",
        }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc123",
          fieldName: "script",
          baseHash: "sha256:abc",
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
            },
          }) as unknown as vscode.TextEditor,
        openExternal: async () => false,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.OPEN_ACTIVE_FAILED_PREFIX} (SN_OPEN_ACTIVE_IN_INSTANCE_FAILED) ${SN_SYNC_MESSAGES.OPEN_ACTIVE_OPEN_FAILED}`,
    ]);
  });

  test("opens indexed active record in ServiceNow instance", async () => {
    const shownInfos: string[] = [];
    let openedUri: string | undefined;

    await runSnOpenActiveInInstanceCommand(
      {} as vscode.ExtensionContext,
      {
        resolveConnectionAuth: async () => ({
          instanceUrl: "https://dev1.service-now.com/",
        }),
      },
      {
        findEntryByLocalPath: async () => ({
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc123",
          fieldName: "script",
          baseHash: "sha256:abc",
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
            },
          }) as unknown as vscode.TextEditor,
        openExternal: async (target: vscode.Uri) => {
          openedUri = target.toString(true);
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
      openedUri,
      "https://dev1.service-now.com/sys_script.do?sys_id=abc123",
    );
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.OPEN_ACTIVE_SUCCESS_PREFIX} sys_script:abc123`,
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
