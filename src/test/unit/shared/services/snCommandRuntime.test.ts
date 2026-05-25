import * as assert from "assert";
import * as vscode from "vscode";
import { defaultBaseRuntime } from "@shared/services/snCommandRuntime.js";

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
});
