import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  registerSnPushCurrentCommand,
  runSnPushCurrentCommand,
} from "@commands/snPushCurrentCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { hashText } from "@shared/services/hashService.js";

suite("snPushCurrentCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPushCurrentCommand(context);

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
      registerSnPushCurrentCommand(context, {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
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
            await runSnPushCurrentCommand(
              {} as vscode.ExtensionContext,
              {
                getRemoteFieldContent: async () => "",
                pushFieldContent: async () => "",
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
      SN_SYNC_MESSAGES.PUSH_CURRENT_NO_EDITOR,
    ]);
  });

  test("shows error when no workspace is open", async () => {
    const shownErrors: string[] = [];

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
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
        getCurrentTextEditor: () => undefined,
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

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
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
        getCurrentTextEditor: () => undefined,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_CURRENT_NO_EDITOR,
    ]);
  });

  test("shows info when active file is not indexed", async () => {
    const shownInfos: string[] = [];

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "",
        pushFieldContent: async () => "",
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
        getCurrentTextEditor: () =>
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
      SN_SYNC_MESSAGES.PUSH_CURRENT_NOT_INDEXED,
    ]);
  });

  test("shows info when current file has no local changes", async () => {
    const shownInfos: string[] = [];
    let fetchedRemote = false;

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => {
          fetchedRemote = true;
          return "old";
        },
        pushFieldContent: async () => "",
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
        getCurrentTextEditor: () =>
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
      SN_SYNC_MESSAGES.PUSH_CURRENT_NO_LOCAL_CHANGES,
    ]);
  });

  test("shows conflict error when remote changed from baseline", async () => {
    const shownErrors: string[] = [];
    let pushed = false;

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-new",
        pushFieldContent: async () => {
          pushed = true;
          return "";
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
        getCurrentTextEditor: () =>
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
      `${SN_SYNC_MESSAGES.PUSH_CURRENT_CONFLICT_PREFIX} src/a.js`,
    ]);
  });

  test("resolves active conflict by overwriting remote", async () => {
    let pushedContent = "";
    let updated = false;

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-new",
        pushFieldContent: async (_context, _workspace, _entry, content) => {
          pushedContent = content;
          return content;
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
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "local-new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        resolveConflict: async () => ({ kind: "overwriteRemote" }),
      },
    );

    assert.strictEqual(pushedContent, "local-new");
    assert.strictEqual(updated, true);
  });

  test("resolves active conflict by pushing merged content", async () => {
    let pushedContent = "";

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-new",
        pushFieldContent: async (_context, _workspace, _entry, content) => {
          pushedContent = content;
          return content;
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
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "local-new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        resolveConflict: async () => ({
          kind: "merge",
          mergedContent: "merged-content",
        }),
      },
    );

    assert.strictEqual(pushedContent, "merged-content");
  });

  test("resolves active conflict by discarding local and updating base hash", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sn-sync-active-"));
    const workspaceUri = vscode.Uri.file(tempDir);
    const localFilePath = path.join(tempDir, "a.js");
    await fs.writeFile(localFilePath, "local-new", "utf8");

    let pushed = false;
    let updatedHash = "";
    const shownInfos: string[] = [];

    try {
      await runSnPushCurrentCommand(
        {} as vscode.ExtensionContext,
        {
          getRemoteFieldContent: async () => "remote-new",
          pushFieldContent: async () => {
            pushed = true;
            return "";
          },
        },
        {
          findEntryByLocalPath: async () => ({
            localPath: "a.js",
            table: "sys_script",
            sysId: "abc",
            fieldName: "script",
            baseHash: hashText("old"),
            updatedAt: "now",
          }),
          toWorkspaceRelativePath: () => "a.js",
          getModifiedCandidates: async () => [],
          recordPullFiles: async () => undefined,
          updateBaseHashes: async (_workspace, updates) => {
            updatedHash = updates[0]?.baseHash ?? "";
          },
        },
        {
          getWorkspaceFolderUri: () => workspaceUri,
          getCurrentTextEditor: () =>
            ({
              document: {
                uri: vscode.Uri.file(localFilePath),
                getText: () => "local-new",
              },
            }) as unknown as vscode.TextEditor,
          showErrorMessage: async () => undefined,
          showInformationMessage: async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          resolveConflict: async () => ({ kind: "discardLocal" }),
        },
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }

    assert.strictEqual(pushed, false);
    assert.strictEqual(updatedHash, hashText("remote-new"));
    assert.strictEqual(shownInfos.length, 1);
    assert.ok(shownInfos[0].includes("0 files uploaded"));
    assert.ok(shownInfos[0].includes("Discarded: 1"));
  });

  test("skips active push when conflict resolver returns skip", async () => {
    let pushed = false;
    let updated = false;
    const shownInfos: string[] = [];

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "remote-new",
        pushFieldContent: async () => {
          pushed = true;
          return "";
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
        getCurrentTextEditor: () =>
          ({
            document: {
              uri: vscode.Uri.file("/tmp/ws/src/a.js"),
              getText: () => "local-new",
            },
          }) as unknown as vscode.TextEditor,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        resolveConflict: async () => ({ kind: "skip" }),
      },
    );

    assert.strictEqual(pushed, false);
    assert.strictEqual(updated, false);
    assert.strictEqual(shownInfos.length, 1);
    assert.ok(shownInfos[0].includes("0 files uploaded"));
    assert.ok(shownInfos[0].includes("Skipped: 1"));
  });

  test("shows detailed error when push current throws", async () => {
    const shownErrors: string[] = [];

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => {
          throw new Error("remote-fail");
        },
        pushFieldContent: async () => "",
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
        getCurrentTextEditor: () =>
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
      `${SN_SYNC_MESSAGES.PUSH_CURRENT_FAILED_PREFIX} (SN_PUSH_CURRENT_FAILED) remote-fail`,
    ]);
  });

  test("pushes current file when no conflict is detected", async () => {
    const shownInfos: string[] = [];
    let pushed = false;
    let updated = false;

    await runSnPushCurrentCommand(
      {} as vscode.ExtensionContext,
      {
        getRemoteFieldContent: async () => "old",
        pushFieldContent: async () => {
          pushed = true;
          return "new";
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
        getCurrentTextEditor: () =>
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
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PUSH_CURRENT_SUCCESS} 1 file uploaded.`,
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
