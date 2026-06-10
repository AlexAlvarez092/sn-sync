import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  registerSnRunBackgroundScriptCommand,
  runSnRunBackgroundScriptCommand,
} from "@commands/snRunBackgroundScriptCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

class FakeOutputChannel implements Pick<vscode.OutputChannel, "appendLine" | "show"> {
  public readonly lines: string[] = [];
  public shown = false;

  public appendLine(value: string): void {
    this.lines.push(value);
  }

  public show(): void {
    this.shown = true;
  }
}

suite("snRunBackgroundScriptCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnRunBackgroundScriptCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes command with default runtime", async () => {
    const shownInfos: string[] = [];
    const shownErrors: string[] = [];
    const output = new FakeOutputChannel();
    const workspaceUri = createTempWorkspaceUri("bg-register-default-runtime");
    const selectedUri = vscode.Uri.file(path.join(workspaceUri.fsPath, "run.js"));

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      const windowObject = vscode.window as unknown as {
        showOpenDialog: (
          options?: vscode.OpenDialogOptions,
        ) => Thenable<vscode.Uri[] | undefined>;
        showWarningMessage: (
          message: string,
          options: vscode.MessageOptions,
          ...items: string[]
        ) => Thenable<string | undefined>;
        createOutputChannel: (name: string) => vscode.OutputChannel;
        showInformationMessage: (
          message: string,
        ) => Thenable<string | undefined>;
        showErrorMessage: (message: string) => Thenable<string | undefined>;
      };
      const workspaceObject = vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      };

      const originalShowOpenDialog = windowObject.showOpenDialog;
      const originalShowWarningMessage = windowObject.showWarningMessage;
      const originalCreateOutputChannel = windowObject.createOutputChannel;
      const originalShowInformationMessage = windowObject.showInformationMessage;
      const originalShowErrorMessage = windowObject.showErrorMessage;
      const workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(
        vscode.workspace,
        "workspaceFolders",
      );
      const activeEditorDescriptor = Object.getOwnPropertyDescriptor(
        vscode.window,
        "activeTextEditor",
      );

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        configurable: true,
        value: [{ uri: workspaceUri, name: "tmp", index: 0 }],
      });
      Object.defineProperty(vscode.window, "activeTextEditor", {
        configurable: true,
        value: undefined,
      });

      windowObject.showOpenDialog = async () => [selectedUri];
      windowObject.showWarningMessage = async (_message, _options, ...items) =>
        items[0];
      windowObject.createOutputChannel =
        () => output as unknown as vscode.OutputChannel;
      windowObject.showInformationMessage = async (message: string) => {
        shownInfos.push(message);
        return undefined;
      };
      windowObject.showErrorMessage = async (message: string) => {
        shownErrors.push(message);
        return undefined;
      };
      try {
        await fs.mkdir(workspaceUri.fsPath, { recursive: true });
        await fs.writeFile(selectedUri.fsPath, "gs.info('register')", "utf-8");

        const context = {
          subscriptions: [] as vscode.Disposable[],
        } as unknown as vscode.ExtensionContext;

        registerSnRunBackgroundScriptCommand(context, {
          resolveExecutionContext: async () => ({
            instanceUrl: "https://dev.service-now.com",
            username: "admin",
          }),
          runBackgroundScript: async () => ({
            output: "register-ok",
            rawResponse: "<pre>register-ok</pre>",
          }),
        });

        await invokeRegistered();
      } finally {
        windowObject.showOpenDialog = originalShowOpenDialog;
        windowObject.showWarningMessage = originalShowWarningMessage;
        windowObject.createOutputChannel = originalCreateOutputChannel;
        windowObject.showInformationMessage = originalShowInformationMessage;
        windowObject.showErrorMessage = originalShowErrorMessage;

        if (workspaceFoldersDescriptor) {
          Object.defineProperty(
            vscode.workspace,
            "workspaceFolders",
            workspaceFoldersDescriptor,
          );
        }

        if (activeEditorDescriptor) {
          Object.defineProperty(
            vscode.window,
            "activeTextEditor",
            activeEditorDescriptor,
          );
        }
      }
    });

    assert.deepStrictEqual(shownErrors, []);
    assert.strictEqual(output.shown, true);
    assert.ok(output.lines.some((line) => line.includes("register-ok")));
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_SUCCESS,
    ]);
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => {
          throw new Error("must-not-be-called");
        },
        runBackgroundScript: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => undefined,
        getActiveTextEditor: () => undefined,
        showOpenDialog: async () => undefined,
        readFile: async () => new Uint8Array(),
        askConfirmation: async () => true,
        getOutputChannel: () => {
          throw new Error("must-not-be-called");
        },
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("cancels when no file is selected", async () => {
    const shownInfos: string[] = [];

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => {
          throw new Error("must-not-be-called");
        },
        runBackgroundScript: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("bg-command-cancel"),
        getActiveTextEditor: () => undefined,
        showOpenDialog: async () => undefined,
        readFile: async () => {
          throw new Error("must-not-be-called");
        },
        askConfirmation: async () => true,
        getOutputChannel: () => {
          throw new Error("must-not-be-called");
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED]);
  });

  test("shows error for empty script content", async () => {
    const shownErrors: string[] = [];

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => {
          throw new Error("must-not-be-called");
        },
        runBackgroundScript: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("bg-command-empty"),
        getActiveTextEditor: () => ({
          document: {
            uri: vscode.Uri.file(path.join("/tmp", "empty.js")),
          },
        }) as vscode.TextEditor,
        showOpenDialog: async () => undefined,
        readFile: async () => new TextEncoder().encode("\n\t   "),
        askConfirmation: async () => true,
        getOutputChannel: () => {
          throw new Error("must-not-be-called");
        },
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_EMPTY_FILE]);
  });

  test("runs script and writes output channel", async () => {
    const shownInfos: string[] = [];
    const output = new FakeOutputChannel();
    const scriptUri = vscode.Uri.file(path.join("/tmp", "fix.js"));
    let runCalls = 0;

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => ({
          instanceUrl: "https://dev.service-now.com",
          username: "admin",
        }),
        runBackgroundScript: async (_context, _workspace, content) => {
          runCalls += 1;
          assert.strictEqual(content, "gs.info('ok')");
          return {
            output: "done",
            rawResponse: "<pre>done</pre>",
          };
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("bg-command-success"),
        getActiveTextEditor: () => ({
          document: { uri: scriptUri },
        }) as vscode.TextEditor,
        showOpenDialog: async () => undefined,
        readFile: async () => new TextEncoder().encode("gs.info('ok')"),
        askConfirmation: async (message: string, actionLabel: string) => {
          assert.strictEqual(
            message,
            "Execute script on https://dev.service-now.com as admin?",
          );
          assert.strictEqual(
            actionLabel,
            SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CONFIRM_ACTION,
          );
          return true;
        },
        getOutputChannel: () => output as unknown as vscode.OutputChannel,
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(runCalls, 1);
    assert.strictEqual(output.shown, true);
    assert.ok(output.lines.some((line) => line.includes("/tmp/fix.js -> https://dev.service-now.com")));
    assert.ok(output.lines.includes("done"));
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_SUCCESS]);
  });

  test("cancels when confirmation is declined", async () => {
    const shownInfos: string[] = [];
    let runCalls = 0;

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => ({
          instanceUrl: "https://dev.service-now.com",
        }),
        runBackgroundScript: async () => {
          runCalls += 1;
          return {
            output: "must-not-run",
            rawResponse: "",
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("bg-command-confirm-declined"),
        getActiveTextEditor: () => ({
          document: {
            uri: vscode.Uri.file(path.join("/tmp", "decline.js")),
          },
        }) as vscode.TextEditor,
        showOpenDialog: async () => undefined,
        readFile: async () => new TextEncoder().encode("gs.info('ok')"),
        askConfirmation: async () => false,
        getOutputChannel: () => {
          throw new Error("must-not-be-called");
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(runCalls, 0);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
    ]);
  });

  test("shows prefixed error when execution fails", async () => {
    const shownErrors: string[] = [];

    await runSnRunBackgroundScriptCommand(
      {} as vscode.ExtensionContext,
      {
        resolveExecutionContext: async () => ({
          instanceUrl: "https://dev.service-now.com",
        }),
        runBackgroundScript: async () => {
          throw new Error("boom");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("bg-command-failure"),
        getActiveTextEditor: () => ({
          document: {
            uri: vscode.Uri.file(path.join("/tmp", "fix.js")),
          },
        }) as vscode.TextEditor,
        showOpenDialog: async () => undefined,
        readFile: async () => new TextEncoder().encode("gs.info('ok')"),
        askConfirmation: async () => true,
        getOutputChannel: () => {
          throw new Error("must-not-be-called");
        },
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_FAILED_PREFIX} (SN_RUN_BACKGROUND_SCRIPT_FAILED) boom`,
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
