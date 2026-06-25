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

      // The "sha256:" prefix must be stripped from the filename so the path
      // is valid on Windows (where ":" is the ADS separator).
      const hashWithPrefix = `sha256:${hash}`;
      await store.writeSnapshot(workspaceUri, hashWithPrefix, "other");

      const expectedPath = path.join(
        tempDir,
        SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
        hash,
      );
      await assert.doesNotReject(
        () => fs.access(expectedPath),
        "snapshot file should exist at expected path",
      );

      const prefixedPath = path.join(
        tempDir,
        SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
        hash, // prefix stripped → same filename portion
      );
      // Both hashes differ only in prefix; they resolve to different safe names
      const strippedPath = path.join(
        tempDir,
        SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
        hash, // "sha256:" prefix stripped leaves the raw hex
      );
      await assert.doesNotReject(
        () => fs.access(strippedPath),
        "sha256:-prefixed hash must also be accessible without the prefix",
      );

      // Ensure no file named "sha256:..." exists (colon in filename)
      const colonPath = path.join(
        tempDir,
        SN_SYNC_PATHS.BASE_SNAPSHOT_DIR,
        hashWithPrefix,
      );
      await assert.rejects(
        () => fs.access(colonPath),
        "file with colon in name must NOT exist",
      );
    });
  });

  test("writeSnapshot re-throws non-FileNotFound stat errors", async () => {
    await withTempDir("sn-snapshot-stat-error-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      const permissionError = vscode.FileSystemError.NoPermissions(
        vscode.Uri.file(path.join(tempDir, ".snsync/base/somehash")),
      );

      const fakeFs = {
        stat: async () => {
          throw permissionError;
        },
        writeFile: async () => {
          throw new Error("writeFile must not be called when stat throws a non-FileNotFound error");
        },
        readFile: async () => new Uint8Array(),
        delete: async () => undefined,
      } as unknown as typeof vscode.workspace.fs;

      const store = new SnBaseSnapshotStore(fakeFs);
      await assert.rejects(
        () => store.writeSnapshot(workspaceUri, "sha256:somehash", "content"),
        (err: Error) => err === permissionError,
        "non-FileNotFound error from stat must be rethrown",
      );
    });
  });
});
