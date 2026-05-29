import * as assert from "assert";
import * as vscode from "vscode";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  assertUriWithinWorkspace,
  getWorkspacePathSegments,
  resolveWorkspaceChildUri,
} from "@shared/services/snWorkspacePathService.js";

suite("snWorkspacePathService", () => {
  test("getWorkspacePathSegments allows safe nested fragments", () => {
    assert.deepStrictEqual(
      getWorkspacePathSegments({
        value: "src/app",
        label: "rootDir",
        allowHierarchy: true,
      }),
      ["src", "app"],
    );
  });

  test("getWorkspacePathSegments rejects traversal and absolute paths", () => {
    assert.throws(
      () =>
        getWorkspacePathSegments({
          value: "../outside",
          label: "rootDir",
          allowHierarchy: true,
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} rootDir.`,
    );

    assert.throws(
      () =>
        getWorkspacePathSegments({
          value: "/tmp/outside",
          label: "rootDir",
          allowHierarchy: true,
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} rootDir.`,
    );

    assert.throws(
      () =>
        getWorkspacePathSegments({
          value: "..\\outside",
          label: "folder",
          allowHierarchy: true,
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} folder.`,
    );
  });

  test("resolveWorkspaceChildUri returns a descendant uri", () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/ws");

    const targetUri = resolveWorkspaceChildUri(workspaceFolderUri, [
      {
        value: "src/app",
        label: "rootDir",
        allowHierarchy: true,
      },
      {
        value: "file.js",
        label: "file name",
      },
    ]);

    assert.strictEqual(targetUri.fsPath, "/tmp/ws/src/app/file.js");
  });

  test("resolveWorkspaceChildUri allows empty fragment list and returns workspace root", () => {
    const workspaceFolderUri = vscode.Uri.file("/tmp/ws");
    const targetUri = resolveWorkspaceChildUri(workspaceFolderUri, []);

    assert.strictEqual(targetUri.fsPath, "/tmp/ws");
  });

  test("assertUriWithinWorkspace rejects paths outside the workspace", () => {
    assert.throws(
      () =>
        assertUriWithinWorkspace(
          vscode.Uri.file("/tmp/ws"),
          vscode.Uri.file("/tmp/elsewhere/file.js"),
          "rootDir",
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          `${SN_SYNC_MESSAGES.WORKSPACE_PATH_OUTSIDE_WORKSPACE_PREFIX} rootDir.`,
    );
  });
});
