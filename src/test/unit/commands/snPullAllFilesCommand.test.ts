import * as assert from "assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  registerSnPullAllFilesCommand,
  runSnPullAllFilesCommand,
} from "@commands/snPullAllFilesCommand.js";
import { SN_SYNC_MESSAGES } from "@shared/constants/snSyncConstants.js";
import {
  createTempWorkspaceUri,
  withTempDir,
} from "@test/helpers/testRuntime.js";

suite("snPullAllFilesCommand", () => {
  test("registers command and stores disposable in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    withPatchedRegisterCommand(() => {
      registerSnPullAllFilesCommand(context);

      assert.strictEqual(context.subscriptions.length, 1);
      context.subscriptions[0].dispose();
    });
  });

  test("register callback executes pull command", async () => {
    const shownErrors: string[] = [];
    const context = {
      subscriptions: [] as vscode.Disposable[],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;

    await withCapturedRegisterCommand(async (invokeRegistered) => {
      registerSnPullAllFilesCommand(
        context,
        {
          getSyncSettings: async () => {
            throw new Error("must-not-be-called");
          },
        } as unknown as never,
        {
          pullConfiguredScripts: async () => ({
            settings: 0,
            records: 0,
            files: 0,
          }),
        },
      );

      await withPatchedWorkspaceFolders(undefined, async () => {
        await withPatchedWindowMessages(
          async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
          async (_message: string) => undefined,
          async () => undefined,
          async (_options, task) =>
            task({
              report: () => undefined,
            }),
          async () => {
            await invokeRegistered();
          },
        );
      });
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows error when no workspace folder is open", async () => {
    const shownErrors: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => {
          throw new Error("must-not-be-called");
        },
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("shows info when no settings are configured", async () => {
    const shownInfos: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-no-settings"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => {
          throw new Error("must-not-be-called");
        },
        delete: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownInfos, [SN_SYNC_MESSAGES.PULL_NO_SETTINGS]);
  });

  test("pull deletes configured root dir without prompting when preference is delete", async () => {
    const shownInfos: string[] = [];
    const deletedEntries: string[] = [];
    const pulledSettingFolders: string[] = [];
    const usedRootDirs: string[] = [];
    const progressMessages: string[] = [];
    const progressIncrements: number[] = [];
    const progressTitles: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "business_rules",
            table: "sys_script",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "app",
          pull: { clearBeforePull: "delete" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          settings,
          options,
        ) => {
          pulledSettingFolders.push(settings[0].folder);
          usedRootDirs.push(options?.rootDir ?? "missing");

          if (settings[0].folder === "business_rules") {
            options?.onFileWritten?.({
              settingFolder: "business_rules",
              fileName: "rule1.js",
            });
            options?.onFileWritten?.({
              settingFolder: "business_rules",
              fileName: "rule2.js",
            });

            return {
              settings: 1,
              records: 2,
              files: 2,
            };
          }

          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl1.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl2.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl3.js",
          });
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl4.js",
          });

          return {
            settings: 1,
            records: 3,
            files: 4,
          };
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-success"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => [
          ["business_rules", vscode.FileType.Directory],
          ["old-file.js", vscode.FileType.File],
        ],
        delete: async (uri: vscode.Uri) => {
          deletedEntries.push(uri.toString());
        },
        withProgress: async (title, task) => {
          progressTitles.push(title);
          return task({
            report: ({ message, increment }) => {
              progressMessages.push(message ?? "");
              if (typeof increment === "number") {
                progressIncrements.push(increment);
              }
            },
          });
        },
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
        clearIndex: async () => undefined,
        replacePullSnapshot: async () => undefined,
      },
    );

    assert.strictEqual(deletedEntries.length, 2);
    assert.ok(deletedEntries[0].includes("/app/business_rules"));
    assert.ok(deletedEntries[1].includes("/app/old-file.js"));
    assert.deepStrictEqual(pulledSettingFolders, [
      "business_rules",
      "security_rules",
    ]);
    assert.deepStrictEqual(usedRootDirs, ["app", "app"]);
    assert.deepStrictEqual(progressTitles, [
      "Pulling scripts from ServiceNow...",
    ]);
    assert.deepStrictEqual(progressMessages, [
      "Writing 1 files... (business_rules/rule1.js)",
      "Writing 2 files... (business_rules/rule2.js)",
      "business_rules complete (2 files)",
      "Writing 3 files... (security_rules/acl1.js)",
      "Writing 4 files... (security_rules/acl2.js)",
      "Writing 5 files... (security_rules/acl3.js)",
      "Writing 6 files... (security_rules/acl4.js)",
      "security_rules complete (4 files)",
    ]);
    assert.deepStrictEqual(progressIncrements, [50, 50]);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 6 files from 5 records (2 settings).`,
    ]);
  });

  test("pull keeps files without prompting when preference is keep", async () => {
    let deleteCalled = false;
    const shownInfos: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "src",
          pull: { clearBeforePull: "keep" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async () => ({
          settings: 1,
          records: 1,
          files: 1,
        }),
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-keep-src"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => {
          throw new Error("must-not-be-called");
        },
        delete: async () => {
          deleteCalled = true;
        },
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
        clearIndex: async () => undefined,
        replacePullSnapshot: async () => undefined,
      },
    );

    assert.strictEqual(deleteCalled, false);
    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
    ]);
  });

  test("pull clear-src selection ignores missing src folder", async () => {
    const shownInfos: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => ({
          settings: 1,
          records: 1,
          files: 1,
        }),
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-src-missing"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
        readDirectory: async () => {
          throw new Error("FileNotFound");
        },
        delete: async () => {
          throw new Error("must-not-be-called");
        },
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        recordPullFiles: async () => undefined,
        updateBaseHashes: async () => undefined,
        clearIndex: async () => undefined,
        replacePullSnapshot: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
    ]);
  });

  test("records index updates when pull provides file metadata", async () => {
    const snapshotUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullAllFilesCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          _settings,
          options,
        ) => {
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl.js",
            localPath: "src/security_rules/acl.js",
            table: "sys_security_acl",
            sysId: "acl-1",
            fieldName: "script",
            baseHash: "sha256:abc",
          });

          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-index-updates"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async () => {
          throw new Error("must-not-be-called");
        },
        replacePullSnapshot: async (_workspaceUri, updates) => {
          snapshotUpdates.push(...updates);
        },
      },
    );

    assert.deepStrictEqual(snapshotUpdates, [
      {
        localPath: "src/security_rules/acl.js",
        table: "sys_security_acl",
        sysId: "acl-1",
        fieldName: "script",
        baseHash: "sha256:abc",
      },
    ]);
  });

  test("replaces snapshot with empty updates when pull writes no metadata", async () => {
    let snapshotCalled = false;
    const snapshotUpdates: Array<{
      localPath: string;
      table: string;
      sysId: string;
      fieldName: string;
      baseHash: string;
    }> = [];

    await runSnPullAllFilesCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          _settings,
          options,
        ) => {
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl.js",
          });

          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-index-empty-snapshot"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async () => {
          throw new Error("must-not-be-called");
        },
        replacePullSnapshot: async (_workspaceUri, updates) => {
          snapshotCalled = true;
          snapshotUpdates.push(...updates);
        },
      },
    );

    assert.strictEqual(snapshotCalled, true);
    assert.deepStrictEqual(snapshotUpdates, []);
  });

  test("shows error when snapshot persistence fails with index updates", async () => {
    const shownErrors: string[] = [];

    await runSnPullAllFilesCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async (
          _context,
          _workspaceUri,
          _settings,
          options,
        ) => {
          options?.onFileWritten?.({
            settingFolder: "security_rules",
            fileName: "acl.js",
            localPath: "src/security_rules/acl.js",
            table: "sys_security_acl",
            sysId: "acl-1",
            fieldName: "script",
            baseHash: "sha256:abc",
          });

          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-snapshot-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async () => {
          throw new Error("must-not-be-called");
        },
        replacePullSnapshot: async () => {
          throw new Error("snapshot-fail");
        },
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX} (SN_PULL_ALL_FILES_FAILED) snapshot-fail`,
    ]);
  });

  test("shows error when index service does not support replacePullSnapshot", async () => {
    const shownErrors: string[] = [];

    await runSnPullAllFilesCommand(
      {
        workspaceState: {
          get: () => undefined,
          update: async () => undefined,
        },
      } as unknown as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => ({
          settings: 1,
          records: 1,
          files: 1,
        }),
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-missing-replace-snapshot"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
      {
        findEntryByLocalPath: async () => undefined,
        toWorkspaceRelativePath: () => "",
        getModifiedCandidates: async () => [],
        updateBaseHashes: async () => undefined,
        recordPullFiles: async () => undefined,
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX} (SN_PULL_ALL_FILES_FAILED) Index service does not support replacePullSnapshot`,
    ]);
  });

  test("shows detailed error when pull fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("pull-fail");
        },
      },
      {
        getWorkspaceFolderUri: () => createTempWorkspaceUri("pull-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
        readDirectory: async () => [],
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX} (SN_PULL_ALL_FILES_FAILED) pull-fail`,
    ]);
  });

  test("shows detailed error when clearing src fails", async () => {
    const shownErrors: string[] = [];

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          throw new Error("must-not-be-called");
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-clear-src-failure"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () =>
          SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
        readDirectory: async () => {
          throw new Error("permission-denied");
        },
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX} (SN_PULL_ALL_FILES_FAILED) permission-denied`,
    ]);
  });

  test("shows detailed error when rootDir escapes workspace before clear-before-pull", async () => {
    const shownErrors: string[] = [];
    let readDirectoryCalled = false;
    let pullCalled = false;

    await runSnPullAllFilesCommand(
      {} as vscode.ExtensionContext,
      {
        getSyncSettings: async () => [
          {
            folder: "security_rules",
            table: "sys_security_acl",
            query: "active=true",
            key: "name",
            fields: [{ extension: "js", field_name: "script" }],
          },
        ],
        getPreferences: async () => ({
          rootDir: "../outside",
          pull: { clearBeforePull: "delete" },
        }),
      } as unknown as never,
      {
        pullConfiguredScripts: async () => {
          pullCalled = true;
          return {
            settings: 1,
            records: 1,
            files: 1,
          };
        },
      },
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("pull-invalid-rootdir"),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => {
          throw new Error("must-not-be-called");
        },
        readDirectory: async () => {
          readDirectoryCalled = true;
          return [];
        },
        delete: async () => undefined,
        withProgress: async (_title, task) =>
          task({
            report: () => undefined,
          }),
      },
    );

    assert.strictEqual(readDirectoryCalled, false);
    assert.strictEqual(pullCalled, false);
    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_FAILED_PREFIX} (SN_PULL_ALL_FILES_FAILED) ${SN_SYNC_MESSAGES.WORKSPACE_PATH_INVALID_PREFIX} rootDir.`,
    ]);
  });

  test("uses default runtime and shows success when workspace exists", async () => {
    const workspaceUri = createTempWorkspaceUri("pull-default-runtime-success");
    const shownInfos: string[] = [];

    await withPatchedWorkspaceFolders(
      [{ uri: workspaceUri, name: "tmp", index: 0 }],
      async () => {
        await withPatchedWindowMessages(
          async (_message: string) => undefined,
          async (message: string) => {
            shownInfos.push(message);
            return undefined;
          },
          async () => SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
          async (_options, task) =>
            task({
              report: () => undefined,
            }),
          async () => {
            await runSnPullAllFilesCommand(
              {} as vscode.ExtensionContext,
              {
                getSyncSettings: async () => [
                  {
                    folder: "security_rules",
                    table: "sys_security_acl",
                    query: "active=true",
                    key: "name",
                    fields: [{ extension: "js", field_name: "script" }],
                  },
                ],
              } as unknown as never,
              {
                pullConfiguredScripts: async () => ({
                  settings: 1,
                  records: 1,
                  files: 1,
                }),
              },
              undefined,
              {
                findEntryByLocalPath: async () => undefined,
                toWorkspaceRelativePath: () => "",
                getModifiedCandidates: async () => [],
                recordPullFiles: async () => undefined,
                updateBaseHashes: async () => undefined,
                clearIndex: async () => undefined,
                replacePullSnapshot: async () => undefined,
              },
            );
          },
        );
      },
    );

    assert.deepStrictEqual(shownInfos, [
      `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
    ]);
  });

  test("uses default runtime and clears src when selected", async () => {
    await withTempDir("pull-default-runtime-clear-src-", async (tempDir) => {
      const shownInfos: string[] = [];
      const workspaceUri = vscode.Uri.file(tempDir);
      const srcDir = path.join(tempDir, "src");

      await fs.mkdir(path.join(srcDir, "old_folder"), { recursive: true });
      await fs.writeFile(
        path.join(srcDir, "old_folder", "old.js"),
        "old",
        "utf-8",
      );

      await withPatchedWorkspaceFolders(
        [{ uri: workspaceUri, name: "tmp", index: 0 }],
        async () => {
          await withPatchedWindowMessages(
            async (_message: string) => undefined,
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async () => SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
            async (_options, task) =>
              task({
                report: () => undefined,
              }),
            async () => {
              await runSnPullAllFilesCommand(
                {} as vscode.ExtensionContext,
                {
                  getSyncSettings: async () => [
                    {
                      folder: "security_rules",
                      table: "sys_security_acl",
                      query: "active=true",
                      key: "name",
                      fields: [{ extension: "js", field_name: "script" }],
                    },
                  ],
                } as unknown as never,
                {
                  pullConfiguredScripts: async () => ({
                    settings: 1,
                    records: 1,
                    files: 1,
                  }),
                },
                undefined,
                {
                  findEntryByLocalPath: async () => undefined,
                  toWorkspaceRelativePath: () => "",
                  getModifiedCandidates: async () => [],
                  recordPullFiles: async () => undefined,
                  updateBaseHashes: async () => undefined,
                  clearIndex: async () => undefined,
                  replacePullSnapshot: async () => undefined,
                },
              );
            },
          );
        },
      );

      const remainingEntries = await fs.readdir(srcDir);
      assert.deepStrictEqual(remainingEntries, []);
      assert.deepStrictEqual(shownInfos, [
        `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
      ]);
    });
  });

  test("uses default runtime and creates src when it does not exist", async () => {
    await withTempDir("pull-default-runtime-create-src-", async (tempDir) => {
      const shownInfos: string[] = [];
      const workspaceUri = vscode.Uri.file(tempDir);
      const srcDir = path.join(tempDir, "src");

      await withPatchedWorkspaceFolders(
        [{ uri: workspaceUri, name: "tmp", index: 0 }],
        async () => {
          await withPatchedWindowMessages(
            async (_message: string) => undefined,
            async (message: string) => {
              shownInfos.push(message);
              return undefined;
            },
            async () => SN_SYNC_MESSAGES.PULL_ALL_FILES_CLEAR_SRC_SKIP_ACTION,
            async (_options, task) =>
              task({
                report: () => undefined,
              }),
            async () => {
              await runSnPullAllFilesCommand(
                {} as vscode.ExtensionContext,
                {
                  getSyncSettings: async () => [
                    {
                      folder: "security_rules",
                      table: "sys_security_acl",
                      query: "active=true",
                      key: "name",
                      fields: [{ extension: "js", field_name: "script" }],
                    },
                  ],
                } as unknown as never,
                {
                  pullConfiguredScripts: async () => ({
                    settings: 1,
                    records: 1,
                    files: 1,
                  }),
                },
                undefined,
                {
                  findEntryByLocalPath: async () => undefined,
                  toWorkspaceRelativePath: () => "",
                  getModifiedCandidates: async () => [],
                  recordPullFiles: async () => undefined,
                  updateBaseHashes: async () => undefined,
                  clearIndex: async () => undefined,
                  replacePullSnapshot: async () => undefined,
                },
              );
            },
          );
        },
      );

      const srcStats = await fs.stat(srcDir);
      assert.strictEqual(srcStats.isDirectory(), true);
      assert.deepStrictEqual(shownInfos, [
        `${SN_SYNC_MESSAGES.PULL_ALL_FILES_SUCCESS_PREFIX} 1 files from 1 records (1 settings).`,
      ]);
    });
  });

  test("uses default runtime and shows no-workspace error when workspace is missing", async () => {
    const shownErrors: string[] = [];

    await withPatchedWorkspaceFolders(undefined, async () => {
      await withPatchedWindowMessages(
        async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
        async (_message: string) => undefined,
        async () => undefined,
        async (_options, task) =>
          task({
            report: () => undefined,
          }),
        async () => {
          await runSnPullAllFilesCommand(
            {} as vscode.ExtensionContext,
            {
              getSyncSettings: async () => {
                throw new Error("must-not-be-called");
              },
            } as unknown as never,
            {
              pullConfiguredScripts: async () => {
                throw new Error("must-not-be-called");
              },
            },
          );
        },
      );
    });

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });
});

function withPatchedRegisterCommand(run: () => void): void {
  const commandsObject = vscode.commands as unknown as {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };
  const originalRegisterCommand = commandsObject.registerCommand;

  commandsObject.registerCommand = (
    _command: string,
    _callback: (...args: unknown[]) => unknown,
  ) => new vscode.Disposable(() => undefined);

  try {
    run();
  } finally {
    commandsObject.registerCommand = originalRegisterCommand;
  }
}

async function withCapturedRegisterCommand(
  run: (invokeRegistered: () => Promise<unknown>) => Promise<void>,
): Promise<void> {
  const commandsObject = vscode.commands as unknown as {
    registerCommand: (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => vscode.Disposable;
  };
  const originalRegisterCommand = commandsObject.registerCommand;
  let callback: ((...args: unknown[]) => unknown) | undefined;

  commandsObject.registerCommand = (
    _command: string,
    commandCallback: (...args: unknown[]) => unknown,
  ) => {
    callback = commandCallback;
    return new vscode.Disposable(() => undefined);
  };

  try {
    await run(async () => {
      assert.ok(callback);
      return callback!();
    });
  } finally {
    commandsObject.registerCommand = originalRegisterCommand;
  }
}

async function withPatchedWorkspaceFolders(
  folders: vscode.WorkspaceFolder[] | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    vscode.workspace,
    "workspaceFolders",
  );

  Object.defineProperty(vscode.workspace, "workspaceFolders", {
    configurable: true,
    value: folders,
  });

  try {
    await run();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(
        vscode.workspace,
        "workspaceFolders",
        originalDescriptor,
      );
    }
  }
}

async function withPatchedWindowMessages(
  showErrorMessage: (message: string) => Thenable<string | undefined>,
  showInformationMessage: (message: string) => Thenable<string | undefined>,
  showWarningMessage: (
    message: string,
    ...items: string[]
  ) => Thenable<string | undefined>,
  withProgress: <T>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ) => Thenable<T>,
  run: () => Promise<void>,
): Promise<void> {
  const windowObject = vscode.window as unknown as {
    showErrorMessage: (message: string) => Thenable<string | undefined>;
    showInformationMessage: (message: string) => Thenable<string | undefined>;
    showWarningMessage: (
      message: string,
      ...items: string[]
    ) => Thenable<string | undefined>;
    withProgress: <T>(
      options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
      ) => Thenable<T>,
    ) => Thenable<T>;
  };

  const originalShowErrorMessage = windowObject.showErrorMessage;
  const originalShowInformationMessage = windowObject.showInformationMessage;
  const originalShowWarningMessage = windowObject.showWarningMessage;
  const originalWithProgress = windowObject.withProgress;

  windowObject.showErrorMessage = showErrorMessage;
  windowObject.showInformationMessage = showInformationMessage;
  windowObject.showWarningMessage = showWarningMessage;
  windowObject.withProgress = withProgress;

  try {
    await run();
  } finally {
    windowObject.showErrorMessage = originalShowErrorMessage;
    windowObject.showInformationMessage = originalShowInformationMessage;
    windowObject.showWarningMessage = originalShowWarningMessage;
    windowObject.withProgress = originalWithProgress;
  }
}
