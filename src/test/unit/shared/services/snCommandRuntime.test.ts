import * as assert from "assert";
import * as vscode from "vscode";
import {
  defaultBaseRuntime,
  runWithCommandStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

suite("snCommandRuntime", () => {
  test("resolves workspace from active editor when available", () => {
    const workspaceUri = vscode.Uri.file("/tmp/runtime-active-workspace");
    const activeFileUri = vscode.Uri.file(
      "/tmp/runtime-active-workspace/src/a.ts",
    );

    const windowObject = vscode.window as unknown as {
      activeTextEditor: vscode.TextEditor | undefined;
    };
    const workspaceObject = vscode.workspace as unknown as {
      getWorkspaceFolder: (
        uri: vscode.Uri,
      ) => vscode.WorkspaceFolder | undefined;
    };

    const originalEditorDescriptor = Object.getOwnPropertyDescriptor(
      vscode.window,
      "activeTextEditor",
    );
    const originalGetWorkspaceFolder = workspaceObject.getWorkspaceFolder;

    Object.defineProperty(vscode.window, "activeTextEditor", {
      configurable: true,
      value: {
        document: {
          uri: activeFileUri,
        },
      } as unknown as vscode.TextEditor,
    });

    workspaceObject.getWorkspaceFolder = (_uri: vscode.Uri) => ({
      uri: workspaceUri,
      name: "runtime-active-workspace",
      index: 0,
    });

    try {
      const resolved = defaultBaseRuntime.getWorkspaceFolderUri();
      assert.strictEqual(resolved?.toString(), workspaceUri.toString());
    } finally {
      workspaceObject.getWorkspaceFolder = originalGetWorkspaceFolder;

      if (originalEditorDescriptor) {
        Object.defineProperty(
          vscode.window,
          "activeTextEditor",
          originalEditorDescriptor,
        );
      } else {
        windowObject.activeTextEditor = undefined;
      }
    }
  });

  test("shows Unknown error for non-Error values in prefixed fallback mode", async () => {
    const shownErrors: string[] = [];

    showPrefixedCommandError(
      {
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
      "Prefix:",
      "plain-text-error",
    );

    await Promise.resolve();
    assert.deepStrictEqual(shownErrors, ["Prefix: Unknown error"]);
  });

  test("shows Error message for Error instances in prefixed fallback mode", async () => {
    const shownErrors: string[] = [];

    showPrefixedCommandError(
      {
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
      },
      "Prefix:",
      new Error("boom"),
    );

    await Promise.resolve();
    assert.deepStrictEqual(shownErrors, ["Prefix: boom"]);
  });

  test("runWithCommandStatus shows custom status for long-running task", async () => {
    const windowObject = vscode.window as unknown as {
      setStatusBarMessage: (text: string) => vscode.Disposable;
    };
    const originalSetStatusBarMessage = windowObject.setStatusBarMessage;
    const shownMessages: string[] = [];
    let disposedCount = 0;

    windowObject.setStatusBarMessage = ((text: string) => {
      shownMessages.push(text);
      return {
        dispose: () => {
          disposedCount += 1;
        },
      };
    }) as typeof windowObject.setStatusBarMessage;

    try {
      await runWithCommandStatus(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return undefined;
        },
        {
          message: "sn-sync: custom message...",
          debounceMs: 5,
        },
      );
    } finally {
      windowObject.setStatusBarMessage = originalSetStatusBarMessage;
    }

    assert.deepStrictEqual(shownMessages, [
      "$(sync~spin) sn-sync: custom message...",
    ]);
    assert.strictEqual(disposedCount, 1);
  });

  test("runWithCommandStatus skips status for very fast task due to debounce", async () => {
    const windowObject = vscode.window as unknown as {
      setStatusBarMessage: (text: string) => vscode.Disposable;
    };
    const originalSetStatusBarMessage = windowObject.setStatusBarMessage;
    const shownMessages: string[] = [];

    windowObject.setStatusBarMessage = ((text: string) => {
      shownMessages.push(text);
      return {
        dispose: () => undefined,
      };
    }) as typeof windowObject.setStatusBarMessage;

    try {
      await runWithCommandStatus(async () => undefined, {
        message: "sn-sync: should-not-render...",
        debounceMs: 30,
      });
    } finally {
      windowObject.setStatusBarMessage = originalSetStatusBarMessage;
    }

    assert.deepStrictEqual(shownMessages, []);
  });

  test("runWithCommandStatus uses default status message when options message is omitted", async () => {
    const windowObject = vscode.window as unknown as {
      setStatusBarMessage: (text: string) => vscode.Disposable;
    };
    const originalSetStatusBarMessage = windowObject.setStatusBarMessage;
    const shownMessages: string[] = [];

    windowObject.setStatusBarMessage = ((text: string) => {
      shownMessages.push(text);
      return {
        dispose: () => undefined,
      };
    }) as typeof windowObject.setStatusBarMessage;

    try {
      await runWithCommandStatus(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return undefined;
        },
        {
          debounceMs: 0,
        },
      );
    } finally {
      windowObject.setStatusBarMessage = originalSetStatusBarMessage;
    }

    assert.deepStrictEqual(shownMessages, [
      "$(sync~spin) sn-sync: running command...",
    ]);
  });
});
