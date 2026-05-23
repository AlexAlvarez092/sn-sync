import * as vscode from "vscode";

export async function ensureJsonFile(
  fileUri: vscode.Uri,
  defaultContent: unknown,
): Promise<void> {
  try {
    await vscode.workspace.fs.stat(fileUri);
    return;
  } catch {
    const jsonContent = JSON.stringify(defaultContent, null, 2);
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode(jsonContent),
    );
  }
}
