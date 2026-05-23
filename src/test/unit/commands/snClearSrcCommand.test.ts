import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  registerSnClearSrcCommand,
  runSnClearSrcCommand,
  type SnClearSrcRuntime,
} from "@commands/snClearSrcCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  createTempWorkspaceUri,
  withTempDir,
} from "@test/helpers/testRuntime.js";

suite("snClearSrcCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnClearSrcCommand(context);

    assert.strictEqual(context.subscriptions.length, 1);
    context.subscriptions[0].dispose();
  });

  test("shows error when no workspace folder is open", async () => {
    let readCalled = false;
    const shownErrors: string[] = [];

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () => undefined,
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      readDirectory: async () => {
        readCalled = true;
        return [];
      },
      delete: async () => undefined,
    };

    await runSnClearSrcCommand(runtime);

    assert.strictEqual(readCalled, false);
    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows cancelled message when user does not confirm", async () => {
    const shownInfos: string[] = [];
    let readCalled = false;

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () =>
        createTempWorkspaceUri("clear-src-cancelled"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
      showWarningMessage: async () => undefined,
      readDirectory: async () => {
        readCalled = true;
        return [];
      },
      delete: async () => undefined,
    };

    await runSnClearSrcCommand(runtime);

    assert.strictEqual(readCalled, false);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.CLEAR_SRC_CANCELLED]);
  });

  test("shows info when src folder does not exist", async () => {
    const shownInfos: string[] = [];

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri("clear-src-missing"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
      showWarningMessage: async () => SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
      readDirectory: async () => {
        throw new Error("FileNotFound");
      },
      delete: async () => undefined,
    };

    await runSnClearSrcCommand(runtime);

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.CLEAR_SRC_NOT_FOUND]);
  });

  test("deletes src contents and shows success message", async () => {
    const shownInfos: string[] = [];
    const deletedUris: string[] = [];
    const workspaceUri = createTempWorkspaceUri("clear-src-success");

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () => workspaceUri,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (message: string) => {
        shownInfos.push(message);
        return undefined;
      },
      showWarningMessage: async () => SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
      readDirectory: async () => [
        ["business_rules", vscode.FileType.Directory],
        ["security_rules", vscode.FileType.Directory],
        ["note.txt", vscode.FileType.File],
      ],
      delete: async (uri: vscode.Uri) => {
        deletedUris.push(uri.toString());
      },
    };

    await runSnClearSrcCommand(runtime);

    assert.strictEqual(deletedUris.length, 3);
    assert.ok(deletedUris[0].includes("/src/business_rules"));
    assert.ok(deletedUris[1].includes("/src/security_rules"));
    assert.ok(deletedUris[2].includes("/src/note.txt"));
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.CLEAR_SRC_SUCCESS]);
  });

  test("shows detailed error when deletion fails", async () => {
    const shownErrors: string[] = [];

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () => createTempWorkspaceUri("clear-src-failure"),
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
      readDirectory: async () => [["broken", vscode.FileType.Directory]],
      delete: async () => {
        throw new Error("cannot-delete");
      },
    };

    await runSnClearSrcCommand(runtime);

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.CLEAR_SRC_FAILED_PREFIX} cannot-delete`,
    ]);
  });

  test("shows detailed error when reading src fails for non-FileNotFound error", async () => {
    const shownErrors: string[] = [];

    const runtime: SnClearSrcRuntime = {
      getWorkspaceFolderUri: () =>
        createTempWorkspaceUri("clear-src-read-failure"),
      showErrorMessage: async (message: string) => {
        shownErrors.push(message);
        return undefined;
      },
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
      readDirectory: async () => {
        throw new Error("permission-denied");
      },
      delete: async () => undefined,
    };

    await runSnClearSrcCommand(runtime);

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.CLEAR_SRC_FAILED_PREFIX} permission-denied`,
    ]);
  });

  test("uses default runtime and clears src when workspace exists", async () => {
    await withTempDir("clear-src-default-runtime-", async (tempDir) => {
      const shownInfos: string[] = [];
      const shownWarnings: string[] = [];
      const workspaceUri = vscode.Uri.file(tempDir);
      const srcDir = path.join(tempDir, "src");

      await fs.mkdir(path.join(srcDir, "business_rules"), { recursive: true });
      await fs.writeFile(
        path.join(srcDir, "business_rules", "rule.js"),
        "content",
        "utf-8",
      );

      await withPatchedWorkspaceFolders(
        [{ uri: workspaceUri, name: "tmp", index: 0 }],
        async () => {
          await withPatchedWindowMessages(
            async (_message: string) => undefined,
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async (message: string) => {
              shownWarnings.push(message);
              return SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION;
            },
            async () => {
              await runSnClearSrcCommand();
            },
          );
        },
      );

      const remainingEntries = await fs.readdir(srcDir);
      assert.deepStrictEqual(remainingEntries, []);
      assert.deepStrictEqual(shownWarnings, [
        SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM,
      ]);
      assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.CLEAR_SRC_SUCCESS]);
    });
  });

  test("uses default runtime and shows no-workspace error when workspace is missing", async () => {
    const shownErrors: string[] = [];

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMessages(
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async (_message: string) => undefined,
        async () => undefined,
        async () => {
          await runSnClearSrcCommand();
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

async function withPatchedWindowMessages(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  showWarningMessage: (
    message: string,
    options: vscode.MessageOptions,
    ...items: string[]
  ) => Thenable<string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    showWarningMessage: (
      message: string,
      options: vscode.MessageOptions,
      ...items: string[]
    ) => Thenable<string | undefined>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalShowWarningMessage = windowObject.showWarningMessage;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showWarningMessage = showWarningMessage;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showWarningMessage = originalShowWarningMessage;
  }
}
