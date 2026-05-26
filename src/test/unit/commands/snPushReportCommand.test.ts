import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnPushReportCommand,
  runSnPushReportCommand,
} from "@commands/snPushReportCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

suite("snPushReportCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPushReportCommand(context);

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
      registerSnPushReportCommand(
        context,
        {
          getModifiedCandidates: async () => [],
          findEntryByLocalPath: async () => undefined,
          toWorkspaceRelativePath: () => "",
          recordPullFiles: async () => undefined,
          updateBaseHashes: async () => undefined,
        },
        {
          buildPushReport: async () => ({ files: [], scopes: [] }),
        },
      );

      await withPatchedWorkspaceFolders(undefined, async () => {
        await withPatchedWindowMethods(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async () => undefined,
          async (_options, task) => task({ report: () => undefined }),
          async () => {
            throw new Error("must-not-be-called");
          },
          async (_doc, _options) => {
            throw new Error("must-not-be-called");
          },
          async () => {
            await invokeRegistered();
          },
        );
      });
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => {
          throw new Error("must-not-be-called");
        },
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async () => ({ files: [], scopes: [] }),
      },
      {
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
        openMarkdownReport: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no modified files are found", async () => {
    const shownInfos: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => [],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        withProgress: async (_title, task) => task({ report: () => undefined }),
        openMarkdownReport: async () => {
          throw new Error("must-not-be-called");
        },
      },
    );

    assert.deepStrictEqual(shownInfos, [
      SN_SYNC_MESSAGES.PUSH_REPORT_NO_LOCAL_CHANGES,
    ]);
  });

  test("builds report and shows success", async () => {
    const shownInfos: string[] = [];
    const reportContents: string[] = [];
    const progressTitles: string[] = [];
    const progressMessages: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              sysId: "abc",
              fieldName: "script",
              baseHash: "sha256:base",
              updatedAt: "now",
            },
            localContent: "x",
            localHash: "sha256:x",
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async (
          _context,
          _workspaceUri,
          _candidates,
          options,
        ) => {
          options?.onProgress?.({
            processed: 1,
            total: 1,
            localPath: "src/script_includes/x.js",
          });

          return {
            files: [
              {
                localPath: "src/script_includes/x.js",
                table: "sys_script_include",
                fieldName: "script",
                scopeId: "x_app_one",
                scopeName: "App One",
                updateSetId: "us-1",
                updateSetName: "US One",
              },
            ],
            scopes: [
              {
                scopeId: "x_app_one",
                scopeName: "App One",
                files: 1,
                updateSetId: "us-1",
                updateSetName: "US One",
              },
            ],
          };
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        withProgress: async (title, task) => {
          progressTitles.push(title);
          return task({
            report: ({ message }) => {
              if (message) {
                progressMessages.push(message);
              }
            },
          });
        },
        openMarkdownReport: async (content: string) => {
          reportContents.push(content);
        },
      },
    );

    assert.deepStrictEqual(progressTitles, [
      SN_SYNC_MESSAGES.PUSH_REPORT_TITLE,
    ]);
    assert.strictEqual(reportContents.length, 1);
    assert.ok(reportContents[0].includes("# sn-sync push report"));
    assert.ok(reportContents[0].includes("src/script_includes/x.js"));
    assert.ok(reportContents[0].includes("App One"));
    assert.ok(reportContents[0].includes("US One"));
    assert.ok(
      progressMessages.some((message) => message.includes("Analyzing")),
    );
    assert.ok(
      progressMessages.some((message) => message.includes("Resolving 1/1")),
    );
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PUSH_REPORT_SUCCESS]);
  });

  test("formats update set as sys_id when name is missing", async () => {
    const reportContents: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              sysId: "abc",
              fieldName: "script",
              baseHash: "sha256:base",
              updatedAt: "now",
            },
            localContent: "x",
            localHash: "sha256:x",
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async () => ({
          files: [
            {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              fieldName: "script",
              scopeId: "x_app_one",
              scopeName: "App One",
              updateSetId: "us-only-id",
              updateSetName: undefined,
            },
          ],
          scopes: [
            {
              scopeId: "x_app_one",
              scopeName: "App One",
              files: 1,
              updateSetId: "us-only-id",
              updateSetName: undefined,
            },
          ],
        }),
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
        openMarkdownReport: async (content: string) => {
          reportContents.push(content);
        },
      },
    );

    assert.strictEqual(reportContents.length, 1);
    assert.ok(reportContents[0].includes("us-only-id"));
    assert.ok(!reportContents[0].includes("(us-only-id)"));
  });

  test("renders resolution note in files table", async () => {
    const reportContents: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              sysId: "abc",
              fieldName: "script",
              baseHash: "sha256:base",
              updatedAt: "now",
            },
            localContent: "x",
            localHash: "sha256:x",
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async () => ({
          files: [
            {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              fieldName: "script",
              scopeId: "x_app_one",
              scopeName: "App One",
              updateSetId: "us-1",
              updateSetName: "US One",
              resolutionNote: "Update set table is not available (404).",
            },
          ],
          scopes: [
            {
              scopeId: "x_app_one",
              scopeName: "App One",
              files: 1,
              updateSetId: "us-1",
              updateSetName: "US One",
            },
          ],
        }),
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
        openMarkdownReport: async (content: string) => {
          reportContents.push(content);
        },
      },
    );

    assert.strictEqual(reportContents.length, 1);
    assert.ok(
      reportContents[0].includes("Update set table is not available (404)."),
    );
  });

  test("shows detailed error when report generation fails", async () => {
    const shownErrors: string[] = [];

    await runSnPushReportCommand(
      {} as vscode.ExtensionContext,
      {
        getModifiedCandidates: async () => [
          {
            entry: {
              localPath: "src/script_includes/x.js",
              table: "sys_script_include",
              sysId: "abc",
              fieldName: "script",
              baseHash: "sha256:base",
              updatedAt: "now",
            },
            localContent: "x",
            localHash: "sha256:x",
          },
        ],
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
      },
      {
        buildPushReport: async () => {
          throw new Error("report-fail");
        },
      },
      {
        getWorkspaceFolderUri: () => vscode.Uri.file("/tmp/ws"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        withProgress: async (_title, task) => task({ report: () => undefined }),
        openMarkdownReport: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PUSH_REPORT_FAILED_PREFIX} (SN_PUSH_REPORT_FAILED) report-fail`,
    ]);
  });

  test("uses default runtime and opens markdown report", async () => {
    const shownInfos: string[] = [];
    const progressTitles: string[] = [];
    const openedDocs: Array<{ language: string; content: string }> = [];
    const shownDocs: vscode.TextDocument[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: vscode.Uri.file("/tmp/ws"), name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMethods(
          async () => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async (options, task) => {
            progressTitles.push(options.title ?? "");
            return task({ report: () => undefined });
          },
          async (options) => {
            openedDocs.push({
              language: options.language ?? "",
              content: options.content ?? "",
            });
            return {
              uri: vscode.Uri.file("/tmp/report.md"),
              fileName: "/tmp/report.md",
              isUntitled: true,
              languageId: "markdown",
              version: 1,
              isDirty: false,
              isClosed: false,
              save: async () => true,
              eol: vscode.EndOfLine.LF,
              lineCount: 1,
              lineAt: () => ({
                lineNumber: 0,
                text: "",
                range: new vscode.Range(0, 0, 0, 0),
                rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: true,
              }),
              offsetAt: () => 0,
              positionAt: () => new vscode.Position(0, 0),
              getText: () => options.content ?? "",
              getWordRangeAtPosition: () => undefined,
              validateRange: (range: vscode.Range) => range,
              validatePosition: (position: vscode.Position) => position,
            } as unknown as vscode.TextDocument;
          },
          async (doc) => {
            shownDocs.push(doc);
            return {
              document: doc,
              selection: new vscode.Selection(0, 0, 0, 0),
              selections: [new vscode.Selection(0, 0, 0, 0)],
              visibleRanges: [],
              options: {
                tabSize: 2,
                indentSize: 2,
                insertSpaces: true,
                cursorStyle: vscode.TextEditorCursorStyle.Line,
                lineNumbers: vscode.TextEditorLineNumbersStyle.On,
              },
              viewColumn: vscode.ViewColumn.One,
              edit: async () => true,
              insertSnippet: async () => true,
              setDecorations: () => undefined,
              revealRange: () => undefined,
              show: () => undefined,
              hide: () => undefined,
            } as unknown as vscode.TextEditor;
          },
          async () => {
            await runSnPushReportCommand(
              {} as vscode.ExtensionContext,
              {
                getModifiedCandidates: async () => [
                  {
                    entry: {
                      localPath: "src/a.js",
                      table: "sys_script",
                      sysId: "abc",
                      fieldName: "script",
                      baseHash: "sha256:base",
                      updatedAt: "now",
                    },
                    localContent: "x",
                    localHash: "sha256:x",
                  },
                ],
                findEntryByLocalPath: async () => undefined,
                toWorkspaceRelativePath: () => "",
                recordPullFiles: async () => undefined,
                updateBaseHashes: async () => undefined,
              },
              {
                buildPushReport: async () => ({
                  files: [
                    {
                      localPath: "src/a.js",
                      table: "sys_script",
                      fieldName: "script",
                      scopeId: "global",
                      scopeName: "global",
                      updateSetId: undefined,
                      updateSetName: undefined,
                    },
                  ],
                  scopes: [
                    {
                      scopeId: "global",
                      scopeName: "global",
                      files: 1,
                      updateSetId: undefined,
                      updateSetName: undefined,
                    },
                  ],
                }),
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(progressTitles, [
      SN_SYNC_MESSAGES.PUSH_REPORT_TITLE,
    ]);
    assert.strictEqual(openedDocs.length, 1);
    assert.strictEqual(openedDocs[0].language, "markdown");
    assert.ok(openedDocs[0].content.includes("# sn-sync push report"));
    assert.strictEqual(shownDocs.length, 1);
    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PUSH_REPORT_SUCCESS]);
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

async function withPatchedWindowMethods(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  withProgress: <T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ) => Thenable<T>,
  openTextDocument: (options: {
    language?: string;
    content?: string;
  }) => Thenable<vscode.TextDocument>,
  showTextDocument: (
    document: vscode.TextDocument,
    options: vscode.TextDocumentShowOptions,
  ) => Thenable<vscode.TextEditor>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    withProgress: <T>(
      options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
      ) => Thenable<T>,
    ) => Thenable<T>;
    showTextDocument: (
      document: vscode.TextDocument,
      options: vscode.TextDocumentShowOptions,
    ) => Thenable<vscode.TextEditor>;
  };

  const workspaceObject = vscode.workspace as unknown as {
    openTextDocument: (options: {
      language?: string;
      content?: string;
    }) => Thenable<vscode.TextDocument>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalWithProgress = windowObject.withProgress;
  const originalShowTextDocument = windowObject.showTextDocument;
  const originalOpenTextDocument = workspaceObject.openTextDocument;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.withProgress = withProgress;
  windowObject.showTextDocument = showTextDocument;
  workspaceObject.openTextDocument = openTextDocument;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.withProgress = originalWithProgress;
    windowObject.showTextDocument = originalShowTextDocument;
    workspaceObject.openTextDocument = originalOpenTextDocument;
  }
}
