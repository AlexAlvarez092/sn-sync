import * as path from "node:path";
import * as vscode from "vscode";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export interface WorkspacePathFragmentInput {
  value: string;
  label: string;
  allowHierarchy?: boolean;
}

export function getWorkspacePathSegments(
  input: WorkspacePathFragmentInput,
): string[] {
  const trimmed = input.value.trim();

  if (
    !trimmed ||
    path.posix.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    trimmed.startsWith("~") ||
    CONTROL_CHAR_PATTERN.test(trimmed)
  ) {
    throw new Error(
      `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} ${input.label}.`,
    );
  }

  if (!input.allowHierarchy && /[\\/]/.test(trimmed)) {
    throw new Error(
      `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} ${input.label}.`,
    );
  }

  const rawSegments = input.allowHierarchy
    ? trimmed.split(/[\\/]+/)
    : [trimmed];
  const segments = rawSegments.map((segment) => segment.trim());

  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        CONTROL_CHAR_PATTERN.test(segment),
    )
  ) {
    throw new Error(
      `${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} ${input.label}.`,
    );
  }

  return segments;
}

export function assertUriWithinWorkspace(
  workspaceFolderUri: vscode.Uri,
  targetUri: vscode.Uri,
  label: string,
): void {
  const workspacePath = path.resolve(workspaceFolderUri.fsPath);
  const targetPath = path.resolve(targetUri.fsPath);
  const relativePath = path.relative(workspacePath, targetPath);

  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return;
  }

  throw new Error(
    `${SN_SYNC_MESSAGES.WORKSPACE_PATH_OUTSIDE_WORKSPACE_PREFIX} ${label}.`,
  );
}

export function resolveWorkspaceChildUri(
  workspaceFolderUri: vscode.Uri,
  fragments: WorkspacePathFragmentInput[],
): vscode.Uri {
  const segments = fragments.flatMap((fragment) =>
    getWorkspacePathSegments(fragment),
  );
  const targetUri = vscode.Uri.joinPath(workspaceFolderUri, ...segments);

  assertUriWithinWorkspace(
    workspaceFolderUri,
    targetUri,
    fragments[fragments.length - 1]?.label ?? "path",
  );

  return targetUri;
}
