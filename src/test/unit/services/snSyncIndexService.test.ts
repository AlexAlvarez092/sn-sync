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

  test("replaces older entry when pull records same local path with different sys_id", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/shared.js",
          table: "sys_script",
          sysId: "old",
          fieldName: "script",
          baseHash: "sha256:old",
        },
      ]);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/shared.js",
          table: "sys_script",
          sysId: "new",
          fieldName: "script",
          baseHash: "sha256:new",
        },
      ]);

      const storageKey = `${SN_SYNC_STORAGE_KEYS.SYNC_INDEX_PREFIX}:${workspaceUri.toString()}`;
      const persisted = memento.store.get(storageKey) as
        | { entries?: Record<string, unknown> }
        | undefined;

      assert.ok(persisted?.entries);
      assert.strictEqual(Object.keys(persisted?.entries ?? {}).length, 1);

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/shared.js",
      );
      assert.ok(entry);
      assert.strictEqual(entry?.sysId, "new");
      assert.strictEqual(entry?.baseHash, "sha256:new");
    });
  });

  test("replacePullSnapshot clears previous entries and writes new snapshot", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/old.js",
          table: "sys_script",
          sysId: "old",
          fieldName: "script",
          baseHash: "sha256:old",
        },
      ]);

      await service.replacePullSnapshot(workspaceUri, [
        {
          localPath: "src/new.js",
          table: "sys_script",
          sysId: "new",
          fieldName: "script",
          baseHash: "sha256:new",
        },
      ]);

      const oldEntry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/old.js",
      );
      assert.strictEqual(oldEntry, undefined);

      const newEntry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/new.js",
      );
      assert.ok(newEntry);
      assert.strictEqual(newEntry?.sysId, "new");
    });
  });

  test("replacePullSnapshot with empty updates clears index", async () => {
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

      await service.replacePullSnapshot(workspaceUri, []);

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );
      assert.strictEqual(entry, undefined);
    });
  });

  test("clearIndex removes all entries", async () => {
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

      await service.clearIndex(workspaceUri);

      const entry = await service.findEntryByLocalPath(
        workspaceUri,
        "src/a.js",
      );
      assert.strictEqual(entry, undefined);
    });
  });

  test("handles path casing collisions consistently", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/Script_Includes/A.js",
          table: "sys_script_include",
          sysId: "old",
          fieldName: "script",
          baseHash: "sha256:old",
        },
      ]);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/script_includes/a.js",
          table: "sys_script_include",
          sysId: "new",
          fieldName: "script",
          baseHash: "sha256:new",
        },
      ]);

      const storageKey = `${SN_SYNC_STORAGE_KEYS.SYNC_INDEX_PREFIX}:${workspaceUri.toString()}`;
      const persisted = memento.store.get(storageKey) as
        | { entries?: Record<string, unknown> }
        | undefined;

      const expectedEntriesCount = process.platform === "linux" ? 2 : 1;
      assert.strictEqual(
        Object.keys(persisted?.entries ?? {}).length,
        expectedEntriesCount,
      );

      const found = await service.findEntryByLocalPath(
        workspaceUri,
        "src/script_includes/a.js",
      );
      assert.ok(found);
    });
  });

  test("keeps different casing as distinct paths in case-sensitive mode", async () => {
    const memento = createMemoryMemento();
    const service = new SnSyncIndexService(memento, undefined, false);

    await withTempDir("sn-sync-index-", async (tempDir) => {
      const workspaceUri = vscode.Uri.file(tempDir);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/Script_Includes/A.js",
          table: "sys_script_include",
          sysId: "old",
          fieldName: "script",
          baseHash: "sha256:old",
        },
      ]);

      await service.recordPullFiles(workspaceUri, [
        {
          localPath: "src/script_includes/a.js",
          table: "sys_script_include",
          sysId: "new",
          fieldName: "script",
          baseHash: "sha256:new",
        },
      ]);

      const storageKey = `${SN_SYNC_STORAGE_KEYS.SYNC_INDEX_PREFIX}:${workspaceUri.toString()}`;
      const persisted = memento.store.get(storageKey) as
        | { entries?: Record<string, unknown> }
        | undefined;

      assert.strictEqual(Object.keys(persisted?.entries ?? {}).length, 2);

      const upperCasePath = await service.findEntryByLocalPath(
        workspaceUri,
        "src/Script_Includes/A.js",
      );
      const lowerCasePath = await service.findEntryByLocalPath(
        workspaceUri,
        "src/script_includes/a.js",
      );

      assert.ok(upperCasePath);
      assert.ok(lowerCasePath);
      assert.notStrictEqual(upperCasePath?.sysId, lowerCasePath?.sysId);
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
