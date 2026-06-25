import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as vscode from "vscode";
import {
  formatConflictList,
  formatConflictSummary,
  resolvePushConflictInteractive,
} from "@shared/services/snPushConflictResolutionService.js";

suite("snPushConflictResolutionService", () => {
  test("formats conflict list with truncation above 5", () => {
    assert.strictEqual(formatConflictList(["a", "b"]), "a, b");
    assert.strictEqual(
      formatConflictList(["a", "b", "c", "d", "e", "f"]),
      "a, b, c, d, e (+1 more)",
    );
  });

  test("formats conflict summary — zero conflicts returns empty string", () => {
    assert.strictEqual(
      formatConflictSummary({ conflicts: 0, overwrite: 0, discarded: 0, skipped: 0 }),
      "",
    );
  });

  test("formats conflict summary — non-zero conflicts", () => {
    assert.strictEqual(
      formatConflictSummary({ conflicts: 3, overwrite: 1, discarded: 1, skipped: 1 }),
      " Conflicts: 3. Overwrite: 1. Discarded: 1. Skipped: 1.",
    );
  });

  test("returns skip when conflict picker is dismissed", async () => {
    await withPatchedConflictUi(
      { showQuickPick: async () => undefined },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "a.js", localContent: "local" },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
      },
    );
  });

  test("returns overwriteRemote when overwrite option is selected", async () => {
    await withPatchedConflictUi(
      { showQuickPick: async () => ({ value: "overwriteRemote" }) },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "a.js", localContent: "local" },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "overwriteRemote" });
      },
    );
  });

  test("returns discardLocal when discard is selected and confirmed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "discardLocal" }),
        showWarningMessage: async () => "Discard local",
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "a.js", localContent: "local" },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "discardLocal" });
      },
    );
  });

  test("returns skip when discard is selected but confirmation is dismissed", async () => {
    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "discardLocal" }),
        showWarningMessage: async () => undefined,
      },
      async ({ workspaceFolderUri }) => {
        const result = await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "a.js", localContent: "local" },
          remoteContent: "remote",
        });

        assert.deepStrictEqual(result, { kind: "skip" });
      },
    );
  });

  test("discard confirmation prompt includes the file path", async () => {
    const capturedMessages: string[] = [];

    await withPatchedConflictUi(
      {
        showQuickPick: async () => ({ value: "discardLocal" }),
        showWarningMessage: async (message: string) => {
          capturedMessages.push(message);
          return undefined;
        },
      },
      async ({ workspaceFolderUri }) => {
        await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "scripts/my-script.js", localContent: "local" },
          remoteContent: "remote",
        });
      },
    );

    assert.ok(
      capturedMessages.some((m) => m.includes("scripts/my-script.js")),
      "confirmation message must include the file path",
    );
  });

  test("quick pick title includes the file path", async () => {
    const capturedTitles: string[] = [];

    await withPatchedConflictUi(
      {
        showQuickPick: async (_items: unknown, options: { title?: string }) => {
          capturedTitles.push(options.title ?? "");
          return undefined;
        },
      },
      async ({ workspaceFolderUri }) => {
        await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "scripts/my-script.js", localContent: "local" },
          remoteContent: "remote",
        });
      },
    );

    assert.ok(
      capturedTitles.some((t) => t.includes("scripts/my-script.js")),
      "quick pick title must include the file path",
    );
  });

  test("quick pick offers exactly overwrite and discard options", async () => {
    let capturedLabels: string[] = [];

    await withPatchedConflictUi(
      {
        showQuickPick: async (items: Array<{ label: string }>) => {
          capturedLabels = items.map((i) => i.label);
          return undefined;
        },
      },
      async ({ workspaceFolderUri }) => {
        await resolvePushConflictInteractive({
          workspaceFolderUri,
          candidate: { localPath: "a.js", localContent: "local" },
          remoteContent: "remote",
        });
      },
    );

    assert.deepStrictEqual(capturedLabels, ["Overwrite remote", "Discard local"]);
  });
});

interface PatchedConflictUiOptions {
  showQuickPick?: (
    items: Array<{ label: string; value: string }>,
    options: { title?: string; placeHolder?: string },
  ) => Promise<{ value: string } | undefined>;
  showWarningMessage?: (
    message: string,
    ...items: string[]
  ) => Promise<string | undefined>;
}

interface PatchedConflictUiContext {
  workspaceFolderUri: vscode.Uri;
}

async function withPatchedConflictUi(
  options: PatchedConflictUiOptions,
  run: (ctx: PatchedConflictUiContext) => Promise<void>,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sn-conflict-ui-"));
  const workspaceFolderUri = vscode.Uri.file(tempDir);

  const windowObject = vscode.window as unknown as {
    showQuickPick: typeof vscode.window.showQuickPick;
    showWarningMessage: typeof vscode.window.showWarningMessage;
  };
  const originalShowQuickPick = windowObject.showQuickPick;
  const originalShowWarningMessage = windowObject.showWarningMessage;

  windowObject.showQuickPick = options.showQuickPick
    ? (options.showQuickPick as unknown as typeof vscode.window.showQuickPick)
    : async () => undefined;
  windowObject.showWarningMessage = options.showWarningMessage
    ? (options.showWarningMessage as unknown as typeof vscode.window.showWarningMessage)
    : async () => undefined;

  try {
    await run({ workspaceFolderUri });
  } finally {
    windowObject.showQuickPick = originalShowQuickPick;
    windowObject.showWarningMessage = originalShowWarningMessage;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
