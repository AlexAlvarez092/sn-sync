import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { SnSyncIndexService } from "@services/snSyncIndexService.js";
import { SN_SYNC_STORAGE_KEYS } from "@shared/constants/snSyncConstants.js";
import { hashText } from "@shared/services/hashService.js";
import { withTempDir } from "@test/helpers/testRuntime.js";

interface MemoryMemento extends vscode.Memento {
  store: Map<string, unknown>;
}

suite("snSyncIndexService", () => {
  test("records pull files and finds by local path", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: "sha256:1",
        },
      ]);

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );

      assert.ok(entry);
      assert.strictEqual(entry?.table, "sys_script");
      assert.strictEqual(entry?.sysId, "abc");
      assert.strictEqual(entry?.fieldName, "script");
      assert.strictEqual(entry?.baseHash, "sha256:1");
    });
  });

  test("detects modified candidates and updates base hashes", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const filePath = path.join(tempDir, "src", "a.js");

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "initial", "utf8");

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("initial"),
        },
      ]);

      const initialCandidates =
        await service.getModifiedCandidates(workspaceUri);
      assert.strictEqual(initialCandidates.length, 0);

      await fs.writeFile(filePath, "changed", "utf8");

      const changedCandidates =
        await service.getModifiedCandidates(workspaceUri);
      assert.strictEqual(changedCandidates.length, 1);
      assert.strictEqual(changedCandidates[0].entry.localPath, "src/a.js");
      assert.strictEqual(changedCandidates[0].localHash, hashText("changed"));

      await service.updateBaseHashes(workspaceUri, [
        {
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: hashText("changed"),
        },
      ]);

      const afterUpdateCandidates =
        await service.getModifiedCandidates(workspaceUri);
      assert.strictEqual(afterUpdateCandidates.length, 0);
    });
  });

  test("builds workspace-relative path", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const fileUri = vscode.Uri.file(
        path.join(tempDir, "src", "nested", "a.js"),
      );

      const relative = service.toWorkspaceRelativePath(workspaceUri, fileUri);
      assert.strictEqual(relative, "src/nested/a.js");
    });
  });

  test("falls back when persisted index state is invalid", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);
      const storageKey = `${SN_SYNC_STORAGE_KEYS.SYNC_INDEX_PREFIX}:${workspaceUri.toString()}`;

      memento.store.set(storageKey, {
        version: 2,
        entries: {
          broken: true,
        },
      });

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );
      assert.strictEqual(entry, undefined);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: "sha256:1",
        },
      ]);

      const recovered = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );
      assert.ok(recovered);
      assert.strictEqual(recovered?.sysId, "abc");
    });
  });

  test("skips missing files when listing modified candidates", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/missing.js",
          table: "sys_script",
          sysId: "missing",
          fieldName: "script",
          baseHash: "sha256:base",
        },
      ]);

      const candidates = await service.getModifiedCandidates(workspaceUri);
      assert.strictEqual(candidates.length, 0);
    });
  });

  test("ignores empty and unknown updates when updating base hashes", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/a.js",
          table: "sys_script",
          sysId: "abc",
          fieldName: "script",
          baseHash: "sha256:old",
        },
      ]);

      await service.updateBaseHashes(workspaceUri, []);

      await service.updateBaseHashes(workspaceUri, [
        {
          localPath: "src/unknown.js",
          table: "sys_script",
          sysId: "unknown",
          fieldName: "script",
          baseHash: "sha256:new",
        },
      ]);

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );
      assert.ok(entry);
      assert.strictEqual(entry?.baseHash, "sha256:old");
    });
  });
});

function createMemoryMemento(): MemoryMemento {
  const store = new Map<string, unknown>();

  return {
    store,
    get: <T>(key: string, defaultValue?: T): T =>
      store.has(key) ? (store.get(key) as T) : (defaultValue as T),
    update: async (key: string, value: unknown) => {
      if (value === undefined) {
        store.delete(key);
        return;
      }

      store.set(key, value);
    },
    keys: () => Array.from(store.keys()),
  } as unknown as MemoryMemento;
}
