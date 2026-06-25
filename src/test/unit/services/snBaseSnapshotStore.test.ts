import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { SnBaseSnapshotStore } from "@services/snBaseSnapshotStore.js";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";
import { withTempDir } from "@test/helpers/testRuntime.js";

suite("snBaseSnapshotStore", () => {
  test("writes and reads a snapshot", async () => {
    await withTempDir("sn-snapshot-store-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      const content = "function hello() { return 42; }";
      const hash = "abc123";

      await store.writeSnapshot(workspaceUri, hash, content);
      const result = await store.readSnapshot(workspaceUri, hash);

      assert.strictEqual(result, content);
    });
  });

  test("returns null when snapshot does not exist", async () => {
    await withTempDir("sn-snapshot-missing-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      const result = await store.readSnapshot(workspaceUri, "nonexistent-hash");

      assert.strictEqual(result, null);
    });
  });

  test("does not overwrite existing snapshot (deduplication)", async () => {
    await withTempDir("sn-snapshot-dedup-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      const hash = "dedup-hash";
      const original = "original content";
      const modified = "modified content";

      await store.writeSnapshot(workspaceUri, hash, original);
      await store.writeSnapshot(workspaceUri, hash, modified);

      const result = await store.readSnapshot(workspaceUri, hash);
      assert.strictEqual(result, original, "second write must not overwrite");
    });
  });

  test("clears all snapshots", async () => {
    await withTempDir("sn-snapshot-clear-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      await store.writeSnapshot(workspaceUri, "hash1", "content1");
      await store.writeSnapshot(workspaceUri, "hash2", "content2");

      await store.clearAll(workspaceUri);

      const afterClear1 = await store.readSnapshot(workspaceUri, "hash1");
      const afterClear2 = await store.readSnapshot(workspaceUri, "hash2");

      assert.strictEqual(afterClear1, null);
      assert.strictEqual(afterClear2, null);

      const baseDir = path.join(tempDir, SN_SYNC_PATHS.BASE_SNAPSHOT_DIR);
      await assert.rejects(
        () => fs.access(baseDir),
        "base snapshot directory should not exist after clearAll",
      );
    });
  });

  test("clearAll does not throw when store directory does not exist", async () => {
    await withTempDir("sn-snapshot-clear-empty-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      await assert.doesNotReject(() => store.clearAll(workspaceUri));
    });
  });

  test("snapshot files are stored under .snsync/base/", async () => {
    await withTempDir("sn-snapshot-path-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const store = new SnBaseSnapshotStore();

      const hash = "path-check-hash";
      await store.writeSnapshot(workspaceUri, hash, "content");

      const expectedPath = path.join(
        tempDir,
        SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
        hash,
      );
      await assert.doesNotReject(
        () => fs.access(expectedPath),
        "snapshot file should exist at expected path",
      );
    });
  });
});
