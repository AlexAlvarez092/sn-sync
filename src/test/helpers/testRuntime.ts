import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

export async function withTempDir(
  prefix: string,
  run: (tempDir: string) => Promise<void>,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function createTempWorkspaceUri(name = "ws"): vscode.Uri {
  return vscode.Uri.file(path.join(os.tmpdir(), name));
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export async function assertJsonFileEquals<T>(
  filePath: string,
  expected: T,
): Promise<void> {
  const actual = await readJsonFile<T>(filePath);
  assert.deepStrictEqual(actual, expected);
}
