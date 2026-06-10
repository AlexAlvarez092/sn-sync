import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnRunBackgroundScriptCommand,
  runSnRunBackgroundScriptCommand,
} from "@commands/snRunBackgroundScriptCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

function createEditorStub(
  content: string,
  languageId = "javascript",
  selection?: vscode.Selection,
): vscode.TextEditor {
  const fullSelection =
    selection ??
    new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));

  return {
    document: {
      languageId,
      getText: (range?: vscode.Range) => {
        if (!range) {
          return content;
        }

        const startOffset = range.start.character;
        const endOffset = range.end.character;
        return content.slice(startOffset, endOffset);
      },
    },
    selection: fullSelection,
  } as unknown as vscode.TextEditor;
}

async function withPatchedWindowForScopePrompt<T>(
  options: {
    quickPick?: { label: string; value: string } | undefined;
    inputBox?: string | undefined;
    panelCollector?: { html?: string; options?: vscode.WebviewOptions };
    onInputBoxOptions?: (input: vscode.InputBoxOptions) => void;
    onDisposeRegistered?: (disposeCallback: () => void) => void;
  },
  run: () => Promise<T>,
): Promise<T> {
  const windowObject = vscode.window as unknown as {
    showQuickPick: typeof vscode.window.showQuickPick;
    showInputBox: typeof vscode.window.showInputBox;
    createWebviewPanel: typeof vscode.window.createWebviewPanel;
  };

  const originalShowQuickPick = windowObject.showQuickPick;
  const originalShowInputBox = windowObject.showInputBox;
  const originalCreateWebviewPanel = windowObject.createWebviewPanel;

  windowObject.showQuickPick = async () => options.quickPick as never;
  windowObject.showInputBox = async (inputOptions) => {
    if (inputOptions) {
      options.onInputBoxOptions?.(inputOptions);
    }
    return options.inputBox;
  };
  windowObject.createWebviewPanel = (
    _viewType,
    _title,
    _showOptions,
    webviewOptions,
  ) => {
    const webview: vscode.Webview = {
      html: "",
      options: webviewOptions ?? {},
      asWebviewUri: (uri: vscode.Uri) => uri,
      cspSource: "",
      postMessage: async () => true,
      onDidReceiveMessage: () => new vscode.Disposable(() => undefined),
    };

    let disposeListener: (() => void) | undefined;
    const panel: vscode.WebviewPanel = {
      webview,
      viewType: "sn-sync.backgroundScriptResult",
      title: "",
      iconPath: undefined,
      options: { enableFindWidget: false, retainContextWhenHidden: false },
      active: true,
      visible: true,
      viewColumn: vscode.ViewColumn.Two,
      reveal: () => undefined,
      dispose: () => undefined,
      onDidDispose: (listener) => {
        disposeListener = listener;
        options.onDisposeRegistered?.(() => disposeListener?.());
        return new vscode.Disposable(() => {
          disposeListener = undefined;
        });
      },
      onDidChangeViewState: () => new vscode.Disposable(() => undefined),
    };

    if (options.panelCollector) {
      options.panelCollector.options = webviewOptions;
      Object.defineProperty(webview, "html", {
        configurable: true,
        get: () => options.panelCollector?.html ?? "",
        set: (value: string) => {
          if (options.panelCollector) {
            options.panelCollector.html = value;
          }
        },
      });
    }

    return panel;
  };

  try {
    return await run();
  } finally {
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showInputBox = originalShowInputBox;
    windowObject.createWebviewPanel = originalCreateWebviewPanel;
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
    const workspaceUri = createTempWorkspaceUri("bg-register-default-runtime");
    const editor = createEditorStub("gs.print('register')");

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      const windowObject = vscode.window as unknown as {
        showQuickPick: typeof vscode.window.showQuickPick;
        showInputBox: typeof vscode.window.showInputBox;
        createWebviewPanel: typeof vscode.window.createWebviewPanel;
        showInformationMessage: (
          message: string,
        ) => Thenable<string | undefined>;
        showErrorMessage: (message: string) => Thenable<string | undefined>;
      };
      const workspaceObject = vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
      };

      const activeEditorDescriptor = Object.getOwnPropertyDescriptor(
        vscode.window,
        "activeTextEditor",
      );

      const originalShowQuickPick = windowObject.showQuickPick;
      const originalShowInputBox = windowObject.showInputBox;
      const originalCreateWebviewPanel = windowObject.createWebviewPanel;
      const originalShowInformationMessage =
        windowObject.showInformationMessage;
      const originalShowErrorMessage = windowObject.showErrorMessage;
      const workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(
        vscode.workspace,
        "workspaceFolders",
      );

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        configurable: true,
        value: [{ uri: workspaceUri, name: "tmp", index: 0 }],
      });
      Object.defineProperty(vscode.window, "activeTextEditor", {
        configurable: true,
        value: editor,
      });

      windowObject.showQuickPick = (async () =>
        ({
          label: "Global",
          value: "global",
        }) as unknown as never) as typeof windowObject.showQuickPick;
      windowObject.showInputBox = async () => "";
      windowObject.createWebviewPanel = (
        _viewType,
        _title,
        _showOptions,
        webviewOptions,
      ) => {
        const webview = {
          html: "",
          options: webviewOptions ?? {},
          asWebviewUri: (uri: vscode.Uri) => uri,
          cspSource: "",
          postMessage: async () => true,
          onDidReceiveMessage: () => new vscode.Disposable(() => undefined),
        } as unknown as vscode.Webview;

        return {
          webview,
          viewType: "sn-sync.backgroundScriptResult",
          title: "",
          iconPath: undefined,
          options: { enableFindWidget: false, retainContextWhenHidden: false },
          active: true,
          visible: true,
          viewColumn: vscode.ViewColumn.Two,
          reveal: () => undefined,
          dispose: () => undefined,
          onDidDispose: () => new vscode.Disposable(() => undefined),
          onDidChangeViewState: () => new vscode.Disposable(() => undefined),
        } as unknown as vscode.WebviewPanel;
      };
      windowObject.showInformationMessage = async (message: string) => {
        shownInfos.push(message);
        return undefined;
      };
      windowObject.showErrorMessage = async (message: string) => {
        shownErrors.push(message);
        return undefined;
      };
      try {
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
        windowObject.showQuickPick = originalShowQuickPick;
        windowObject.showInputBox = originalShowInputBox;
        windowObject.createWebviewPanel = originalCreateWebviewPanel;
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
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("register callback with default runtime shows no-workspace error", async () => {
    const shownErrors: string[] = [];

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      const windowObject = vscode.window as unknown as {
        showErrorMessage: (message: string) => Thenable<string | undefined>;
      };
      const workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(
        vscode.workspace,
        "workspaceFolders",
      );
      const activeEditorDescriptor = Object.getOwnPropertyDescriptor(
        vscode.window,
        "activeTextEditor",
      );
      const originalShowErrorMessage = windowObject.showErrorMessage;

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(vscode.window, "activeTextEditor", {
        configurable: true,
        value: undefined,
      });
      windowObject.showErrorMessage = async (message: string) => {
        shownErrors.push(message);
        return undefined;
      };

      try {
        const context = {
          subscriptions: [] as vscode.Disposable[],
        } as unknown as vscode.ExtensionContext;

        registerSnRunBackgroundScriptCommand(context, {
          resolveExecutionContext: async () => {
            throw new Error("must-not-be-called");
          },
          runBackgroundScript: async () => {
            throw new Error("must-not-be-called");
          },
        });

        await invokeRegistered();
      } finally {
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

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows error when no active editor", async () => {
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
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("bg-command-no-editor"),
        getActiveTextEditor: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      SN_SYNC_MESSAGES.OPEN_ACTIVE_NO_EDITOR,
    ]);
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
        getActiveTextEditor: () => createEditorStub("\n\t   ", "javascript"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_EMPTY_FILE,
    ]);
  });

  test("shows invalid language error when active editor is not JS/TS", async () => {
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
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("bg-command-invalid-language"),
        getActiveTextEditor: () => createEditorStub("print('x')", "python"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_INVALID_LANGUAGE,
    ]);
  });

  test("runs script and passes selected scope", async () => {
    const shownInfos: string[] = [];
    let runCalls = 0;
    let observedScopeId: string | undefined;
    const panelCollector: { html?: string; options?: vscode.WebviewOptions } =
      {};

    await withPatchedWindowForScopePrompt(
      {
        quickPick: { label: "Custom", value: "custom" },
        inputBox: "sn_library_intent",
        panelCollector,
      },
      async () => {
        await runSnRunBackgroundScriptCommand(
          {} as vscode.ExtensionContext,
          {
            resolveExecutionContext: async () => ({
              instanceUrl: "https://dev.service-now.com",
              username: "admin",
            }),
            runBackgroundScript: async (
              _context,
              _workspace,
              content,
              scopeId,
            ) => {
              runCalls += 1;
              observedScopeId = scopeId;
              assert.strictEqual(content, "gs.info('ok')");
              return {
                output: "done",
                rawResponse:
                  "<html><body><a href='/x'>go</a><script>alert(1)</script></body></html>",
              };
            },
          },
          {
            getWorkspaceFolderUri: () =>
              createTempWorkspaceUri("bg-command-success"),
            getActiveTextEditor: () => createEditorStub("gs.info('ok')"),
            showErrorMessage: async () => undefined,
            showInformationMessage: async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
          },
        );
      },
    );

    assert.strictEqual(runCalls, 1);
    assert.strictEqual(observedScopeId, "sn_library_intent");
    assert.strictEqual(panelCollector.options?.enableScripts, false);
    assert.ok(
      (panelCollector.html ?? "").includes("https://dev.service-now.com/x"),
    );
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_SUCCESS,
    ]);
  });

  test("cancels when scope prompt is cancelled", async () => {
    const shownInfos: string[] = [];
    let runCalls = 0;

    await withPatchedWindowForScopePrompt(
      {
        quickPick: undefined,
      },
      async () => {
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
              createTempWorkspaceUri("bg-command-scope-cancel"),
            getActiveTextEditor: () => createEditorStub("gs.info('ok')"),
            showErrorMessage: async () => undefined,
            showInformationMessage: async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
          },
        );
      },
    );

    assert.strictEqual(runCalls, 0);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
    ]);
  });

  test("shows prefixed error when execution fails", async () => {
    const shownErrors: string[] = [];

    await withPatchedWindowForScopePrompt(
      {
        quickPick: { label: "Global", value: "global" },
      },
      async () => {
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
            getWorkspaceFolderUri: () =>
              createTempWorkspaceUri("bg-command-failure"),
            getActiveTextEditor: () => createEditorStub("gs.info('ok')"),
            showErrorMessage: async (message: string) => {
              shownErrors.push(message);
              return undefined;
            },
            showInformationMessage: async () => undefined,
          },
        );
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_FAILED_PREFIX} (SN_RUN_BACKGROUND_SCRIPT_FAILED) boom`,
    ]);
  });

  test("clears cached panel reference on dispose callback", async () => {
    let triggerDispose: (() => void) | undefined;

    await withPatchedWindowForScopePrompt(
      {
        quickPick: { label: "Global", value: "global" },
        onDisposeRegistered: (disposeCallback) => {
          triggerDispose = disposeCallback;
        },
      },
      async () => {
        await runSnRunBackgroundScriptCommand(
          {} as vscode.ExtensionContext,
          {
            resolveExecutionContext: async () => ({
              instanceUrl: "https://dev.service-now.com",
            }),
            runBackgroundScript: async () => ({
              output: "ok",
              rawResponse: "<html><body>ok</body></html>",
            }),
          },
          {
            getWorkspaceFolderUri: () =>
              createTempWorkspaceUri("bg-command-dispose"),
            getActiveTextEditor: () => createEditorStub("gs.info('ok')"),
            showErrorMessage: async () => undefined,
            showInformationMessage: async () => undefined,
          },
        );
      },
    );

    assert.ok(triggerDispose);
    triggerDispose?.();
  });

  test("validates custom scope input and returns cancelled when empty custom scope", async () => {
    let validateInput: vscode.InputBoxOptions["validateInput"];
    const shownInfos: string[] = [];

    await withPatchedWindowForScopePrompt(
      {
        quickPick: { label: "Custom", value: "custom" },
        inputBox: "   ",
        onInputBoxOptions: (inputOptions) => {
          validateInput = inputOptions.validateInput;
        },
      },
      async () => {
        await runSnRunBackgroundScriptCommand(
          {} as vscode.ExtensionContext,
          {
            resolveExecutionContext: async () => ({
              instanceUrl: "https://dev.service-now.com",
            }),
            runBackgroundScript: async () => {
              throw new Error("must-not-be-called");
            },
          },
          {
            getWorkspaceFolderUri: () =>
              createTempWorkspaceUri("bg-command-custom-scope-empty"),
            getActiveTextEditor: () => createEditorStub("gs.info('ok')"),
            showErrorMessage: async () => undefined,
            showInformationMessage: async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
          },
        );
      },
    );

    assert.strictEqual(validateInput?.("   "), "Scope id is required");
    assert.strictEqual(validateInput?.("x_scope"), undefined);
    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
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
