import * as path from "node:path";
import * as vscode from "vscode";
import { ensureJsonFile } from "@shared/services/jsonFileService.js";
import {
  assertJsonFileEquals,
  withTempDir,
  writeJsonFile,
} from "@test/helpers/testRuntime.js";

suite("jsonFileService", () => {
  test("creates the json file when it does not exist", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const filePath = path.join(tempDir, "file.json");
      const fileUri = vscode.Uri.file(filePath);

      await ensureJsonFile(fileUri, { a: 1 });

      await assertJsonFileEquals(filePath, { a: 1 });
    });
  });

  test("does not overwrite existing json file", async () => {
    await withTempDir("sn-sync-test-", async (tempDir) => {
      const filePath = path.join(tempDir, "file.json");
      const fileUri = vscode.Uri.file(filePath);

      await writeJsonFile(filePath, { a: 1 });
      await ensureJsonFile(fileUri, { a: 2 });

      await assertJsonFileEquals(filePath, { a: 1 });
    });
  });
});
