import * as assert from "assert";
import * as vscode from "vscode";
import {
  defaultRuntime,
  registerSnActivateCommand,
  runSnActivateCommand,
  StatusBarActivateUiController,
  type SnActivateRuntime,
} from "@commands/snActivateCommand.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snActivateCommand", () => {
  test("registers command and stores disposables in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    try {
      registerSnActivateCommand(
        context,
        {
          validateLogin: async () => undefined,
        },
        {
          listScopedApplications: async () => [],
          listInProgressUpdateSets: async () => [],
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async () => undefined,
          setScopeUpdateSetSelection: async () => undefined,
        } as unknown as never,
        createRuntimeStub(),
      );

      assert.strictEqual(context.subscriptions.length, 6);
    } finally {
      for (const disposable of context.subscriptions) {
        disposable.dispose();
      }
    }
  });

  test("shows error when no workspace is open", async () => {
    const shownErrors: string[] = [];

    await runSnActivateCommand(
      {} as vscode.ExtensionContext,
      {
        validateLogin: async (): Promise<void> => {
          throw new Error("must not be called");
        },
      },
      {
        listScopedApplications: async () => [],
        listInProgressUpdateSets: async () => [],
      },
      {
        getScopeUpdateSetSelections: async () => ({}),
        replaceScopeUpdateSetSelections: async () => undefined,
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async () => undefined,
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownErrors, [SN_SYNC_MESSAGES.NO_WORKSPACE]);
  });

  test("cleans stale scope mappings and initializes status bar state", async () => {
    const workspaceUri = createTempWorkspaceUri("activate-cleanup");
    const replacedSelections: Array<Record<string, unknown>> = [];
    let receivedState: unknown;

    await runSnActivateCommand(
      {} as vscode.ExtensionContext,
      {
        validateLogin: async (): Promise<void> => undefined,
      },
      {
        listScopedApplications: async () => [
          { sys_id: "app-1", name: "My App", scope: "x_company_app" },
        ],
        listInProgressUpdateSets: async (
          _context: vscode.ExtensionContext,
          _workspace: vscode.Uri,
          applicationSysId: string,
        ) => {
          if (applicationSysId === "app-1") {
            return [{ sys_id: "us-valid", name: "Valid Update Set" }];
          }

          return [{ sys_id: "global-valid", name: "Global Update Set" }];
        },
      },
      {
        getScopeUpdateSetSelections: async () => ({
          x_company_app: {
            application: "old-app-id",
            update_set: "us-valid",
          },
          removed_scope: {
            application: "removed-app",
            update_set: "removed-us",
          },
          global: {
            application: "global",
            update_set: "missing-global-us",
          },
        }),
        replaceScopeUpdateSetSelections: async (
          _workspace: vscode.Uri,
          selections: Record<string, unknown>,
        ) => {
          replacedSelections.push(selections);
        },
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async (state) => {
          receivedState = state;
        },
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () => workspaceUri,
      },
    );

    assert.deepStrictEqual(replacedSelections, [
      {
        x_company_app: {
          application: "app-1",
          application_name: "My App",
          update_set: "us-valid",
          update_set_name: "Valid Update Set",
        },
        global: {
          application: "global",
          application_name: "Global",
          update_set: "",
          update_set_name: "",
        },
      },
    ]);

    assert.ok(receivedState);
    assert.strictEqual(
      (receivedState as { selectedScope: string }).selectedScope,
      "x_company_app",
    );
  });

  test("selector commands require activate first", async () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const shownErrors: string[] = [];

    try {
      registerSnActivateCommand(
        context,
        {
          validateLogin: async () => undefined,
        },
        {
          listScopedApplications: async () => [],
          listInProgressUpdateSets: async () => [],
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async () => undefined,
          setScopeUpdateSetSelection: async () => undefined,
        } as unknown as never,
        {
          ...createRuntimeStub(),
          showErrorMessage: async (message: string) => {
            shownErrors.push(message);
            return undefined;
          },
        },
      );

      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_SCOPE,
      );
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_UPDATE_SET,
      );

      assert.deepStrictEqual(shownErrors, [
        SN_SYNC_MESSAGES.ACTIVATE_NOT_READY,
        SN_SYNC_MESSAGES.ACTIVATE_NOT_READY,
      ]);
    } finally {
      for (const disposable of context.subscriptions) {
        disposable.dispose();
      }
    }
  });

  test("shows detailed error when credential validation fails", async () => {
    const shownErrors: string[] = [];

    await runSnActivateCommand(
      {} as vscode.ExtensionContext,
      {
        validateLogin: async (): Promise<void> => {
          throw new Error("invalid-credentials");
        },
      },
      {
        listScopedApplications: async () => [],
        listInProgressUpdateSets: async () => [],
      },
      {
        getScopeUpdateSetSelections: async () => ({}),
        replaceScopeUpdateSetSelections: async () => undefined,
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async () => undefined,
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownErrors, [
      `${SN_SYNC_MESSAGES.ACTIVATE_FAILED_PREFIX} invalid-credentials`,
    ]);
  });

  test("selectors update current scope and update set after activate", async () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const workspaceUri = createTempWorkspaceUri("activate-selectors");
    const shownErrors: string[] = [];
    const shownInfos: string[] = [];
    const activationSelections: Array<{ app: string; updateSet: string }> = [];
    const scopeSelections: Array<{
      scope: string;
      application: string;
      update_set: string;
    }> = [];
    let selectedBadgeSeen = false;
    let quickPickCall = 0;

    const runtime = createRuntimeStub();
    runtime.getWorkspaceFolderUri = () => workspaceUri;
    runtime.showErrorMessage = async (message: string) => {
      shownErrors.push(message);
      return undefined;
    };
    runtime.showInformationMessage = async (message: string) => {
      shownInfos.push(message);
      return undefined;
    };
    runtime.showQuickPick = async (items) => {
      quickPickCall += 1;

      if (quickPickCall === 1) {
        return items[2];
      }

      if (quickPickCall === 2) {
        return items[1];
      }

      if (quickPickCall === 3) {
        selectedBadgeSeen = items.some(
          (item) => item.description === "selected",
        );
        return undefined;
      }

      if (quickPickCall === 4) {
        return undefined;
      }

      return items[0];
    };

    try {
      registerSnActivateCommand(
        context,
        {
          validateLogin: async () => undefined,
        },
        {
          listScopedApplications: async () => [
            { sys_id: "app-1", name: "App One", scope: "x_app_one" },
            { sys_id: "app-2", name: "App Two", scope: "x_app_two" },
          ],
          listInProgressUpdateSets: async (
            _ctx: vscode.ExtensionContext,
            _workspace: vscode.Uri,
            app: string,
          ) => {
            if (app === "app-2") {
              return [
                { sys_id: "us-app-2-a", name: "US App 2 A" },
                { sys_id: "us-app-2-b", name: "US App 2 B" },
              ];
            }

            return [{ sys_id: "us-default", name: "US Default" }];
          },
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async (
            _workspace: vscode.Uri,
            app: string,
            updateSet: string,
          ) => {
            activationSelections.push({ app, updateSet });
          },
          setScopeUpdateSetSelection: async (
            _workspace: vscode.Uri,
            scope: string,
            selection: { application: string; update_set: string },
          ) => {
            scopeSelections.push({
              scope,
              application: selection.application,
              update_set: selection.update_set,
            });
          },
        } as unknown as never,
        runtime,
      );

      await vscode.commands.executeCommand(SN_SYNC_COMMANDS.ACTIVATE);
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_SCOPE,
      );
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_UPDATE_SET,
      );
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_UPDATE_SET,
      );
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.ACTIVATE_SELECT_SCOPE,
      );

      assert.deepStrictEqual(shownErrors, []);
      assert.ok(shownInfos.includes(SN_SYNC_MESSAGES.ACTIVATE_READY));
      assert.ok(
        activationSelections.some(
          (selection) =>
            selection.app === "app-2" && selection.updateSet === "us-app-2-b",
        ),
      );
      assert.strictEqual(selectedBadgeSeen, true);
      assert.deepStrictEqual(scopeSelections, [
        {
          scope: "x_app_two",
          application: "app-2",
          update_set: "us-app-2-b",
        },
      ]);
    } finally {
      for (const disposable of context.subscriptions) {
        disposable.dispose();
      }
    }
  });

  test("selector update-set shows info when no in-progress update sets are available", async () => {
    const shownInfos: string[] = [];

    const runtime = createRuntimeStub();
    runtime.showInformationMessage = async (message: string) => {
      shownInfos.push(message);
      return undefined;
    };

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    const controller = new StatusBarActivateUiController(
      context,
      {
        listInProgressUpdateSets: async () => [],
      } as unknown as never,
      {
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      runtime,
    );

    try {
      await controller.updateState({
        workspaceFolderUri: createTempWorkspaceUri("activate-no-update-set"),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {
          x_app_one: { application: "app-1", update_set: "" },
        },
        selectedScope: "x_app_one",
      });

      await controller.selectUpdateSet();

      assert.ok(
        shownInfos.includes(SN_SYNC_MESSAGES.ACTIVATE_NO_UPDATE_SET_FOUND),
      );
    } finally {
      controller.dispose();
    }
  });

  test("default runtime handles workspace and message paths", async () => {
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    const originalShowError = vscode.window.showErrorMessage;
    const originalShowInfo = vscode.window.showInformationMessage;

    const shownErrors: string[] = [];
    const shownInfos: string[] = [];

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: undefined,
      configurable: true,
    });

    (vscode.window.showErrorMessage as unknown as (
      message: string,
    ) => Thenable<string | undefined>) = async (message: string) => {
      shownErrors.push(message);
      return undefined;
    };

    (vscode.window.showInformationMessage as unknown as (
      message: string,
    ) => Thenable<string | undefined>) = async (message: string) => {
      shownInfos.push(message);
      return undefined;
    };

    try {
      await runSnActivateCommand(
        {} as vscode.ExtensionContext,
        {
          validateLogin: async () => undefined,
        },
        {
          listScopedApplications: async () => [],
          listInProgressUpdateSets: async () => [],
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async () => undefined,
          setScopeUpdateSetSelection: async () => undefined,
        } as unknown as never,
        {
          updateState: async () => undefined,
          selectScope: async () => undefined,
          selectUpdateSet: async () => undefined,
          dispose: () => undefined,
        },
      );

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [{ uri: createTempWorkspaceUri("activate-default-runtime") }],
        configurable: true,
      });

      await runSnActivateCommand(
        {} as vscode.ExtensionContext,
        {
          validateLogin: async () => undefined,
        },
        {
          listScopedApplications: async () => [
            { sys_id: "app-1", name: "App One", scope: "x_app_one" },
          ],
          listInProgressUpdateSets: async () => [
            { sys_id: "us-1", name: "US One" },
          ],
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async () => undefined,
          setScopeUpdateSetSelection: async () => undefined,
        } as unknown as never,
        {
          updateState: async () => undefined,
          selectScope: async () => undefined,
          selectUpdateSet: async () => undefined,
          dispose: () => undefined,
        },
      );
    } finally {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: originalWorkspaceFolders,
        configurable: true,
      });
      (vscode.window.showErrorMessage as unknown as (
        message: string,
      ) => Thenable<string | undefined>) = originalShowError;
      (vscode.window.showInformationMessage as unknown as (
        message: string,
      ) => Thenable<string | undefined>) = originalShowInfo;
    }

    assert.ok(shownErrors.includes(SN_SYNC_MESSAGES.NO_WORKSPACE));
    assert.ok(shownInfos.includes(SN_SYNC_MESSAGES.ACTIVATE_READY));
  });

  test("default runtime quick-pick path delegates to vscode window API", async () => {
    const originalShowQuickPick = vscode.window.showQuickPick;
    let showQuickPickCalled = false;

    (vscode.window.showQuickPick as unknown as (
      items: readonly vscode.QuickPickItem[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<vscode.QuickPickItem | undefined>) = async (items) => {
      showQuickPickCalled = true;
      return items[0];
    };

    try {
      await defaultRuntime.showQuickPick([{ label: "Choice A" }], {
        placeHolder: "Pick one",
        ignoreFocusOut: true,
      });

      assert.strictEqual(showQuickPickCalled, true);
    } finally {
      (vscode.window.showQuickPick as unknown as (
        items: readonly vscode.QuickPickItem[],
        options?: vscode.QuickPickOptions,
      ) => Thenable<vscode.QuickPickItem | undefined>) = originalShowQuickPick;
    }
  });

  test("status bar and scope picker fall back to update_set sys_id when name is missing", async () => {
    const capturedScopeDescriptions: string[] = [];
    const createdStatusBarItems: vscode.StatusBarItem[] = [];

    const runtime: SnActivateRuntime = {
      getWorkspaceFolderUri: () =>
        createTempWorkspaceUri("activate-fallback-update-set-name"),
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: async (items) => {
        capturedScopeDescriptions.push(
          ...items.map((item) => item.description || ""),
        );
        return undefined;
      },
      createStatusBarItem: () => {
        const item = {
          text: "",
          tooltip: "",
          command: undefined as string | undefined,
          show: () => undefined,
          hide: () => undefined,
          dispose: () => undefined,
        } as unknown as vscode.StatusBarItem;

        createdStatusBarItems.push(item);
        return item;
      },
    };

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    const controller = new StatusBarActivateUiController(
      context,
      {
        listInProgressUpdateSets: async () => [],
      } as unknown as never,
      {
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      runtime,
    );

    try {
      await controller.updateState({
        workspaceFolderUri: createTempWorkspaceUri(
          "activate-fallback-update-set-name-state",
        ),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {
          x_app_one: { application: "app-1", update_set: "us-1" },
        },
        selectedScope: "x_app_one",
      });

      await controller.selectScope();

      assert.ok(createdStatusBarItems[1]?.text.includes("us-1"));
      assert.ok(capturedScopeDescriptions.includes("us-1"));
    } finally {
      controller.dispose();
    }
  });

  test("controller falls back to first scope when selected scope is stale", async () => {
    const originalShowQuickPick = vscode.window.showQuickPick;
    const originalCreateStatusBarItem = vscode.window.createStatusBarItem;
    const createdStatusBarItems: vscode.StatusBarItem[] = [];

    const activationSelections: Array<{ app: string; updateSet: string }> = [];
    const scopeSelections: Array<{
      scope: string;
      application: string;
      update_set: string;
    }> = [];

    (vscode.window.showQuickPick as unknown as (
      items: readonly vscode.QuickPickItem[],
      options?: vscode.QuickPickOptions,
    ) => Thenable<vscode.QuickPickItem | undefined>) = async (items) =>
      items[0];

    (vscode.window.createStatusBarItem as unknown as (
      alignment?: vscode.StatusBarAlignment,
      priority?: number,
    ) => vscode.StatusBarItem) = () => {
      const item = {
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined,
      };

      const statusBarItem = item as unknown as vscode.StatusBarItem;
      createdStatusBarItems.push(statusBarItem);
      return statusBarItem;
    };

    const controller = new StatusBarActivateUiController(
      {
        subscriptions: [] as vscode.Disposable[],
      } as unknown as vscode.ExtensionContext,
      {
        listInProgressUpdateSets: async () => [
          { sys_id: "us-1", name: "US One" },
        ],
      } as unknown as never,
      {
        setActivationSelection: async (
          _workspace: vscode.Uri,
          application: string,
          updateSet: string,
        ) => {
          activationSelections.push({ app: application, updateSet });
        },
        setScopeUpdateSetSelection: async (
          _workspace: vscode.Uri,
          scope: string,
          selection: { application: string; update_set: string },
        ) => {
          scopeSelections.push({
            scope,
            application: selection.application,
            update_set: selection.update_set,
          });
        },
      } as unknown as never,
      {
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("activate-stale-runtime"),
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        showQuickPick: <T extends vscode.QuickPickItem>(
          items: readonly T[],
          options: vscode.QuickPickOptions,
        ) => vscode.window.showQuickPick(items, options),
        createStatusBarItem: (
          alignment?: vscode.StatusBarAlignment,
          priority?: number,
        ) => vscode.window.createStatusBarItem(alignment, priority),
      },
    );

    try {
      await controller.updateState({
        workspaceFolderUri: createTempWorkspaceUri("activate-stale-scope"),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {},
        selectedScope: "x_missing_scope",
      });

      await controller.selectUpdateSet();
    } finally {
      controller.dispose();
      (vscode.window.showQuickPick as unknown as (
        items: readonly vscode.QuickPickItem[],
        options?: vscode.QuickPickOptions,
      ) => Thenable<vscode.QuickPickItem | undefined>) = originalShowQuickPick;
      (vscode.window.createStatusBarItem as unknown as (
        alignment?: vscode.StatusBarAlignment,
        priority?: number,
      ) => vscode.StatusBarItem) = originalCreateStatusBarItem;
    }

    assert.ok(
      activationSelections.some(
        (selection) => selection.app === "app-1" && selection.updateSet === "",
      ),
    );
    assert.deepStrictEqual(scopeSelections, [
      {
        scope: "x_app_one",
        application: "app-1",
        update_set: "us-1",
      },
    ]);
    assert.ok(createdStatusBarItems[0]?.text.includes("App One (x_app_one)"));
    assert.ok(createdStatusBarItems[1]?.text.includes("US One"));
  });
});

function createRuntimeStub(): SnActivateRuntime {
  return {
    getWorkspaceFolderUri: () => createTempWorkspaceUri("activate-runtime"),
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async (items) => items[0],
    createStatusBarItem: () => {
      const item = {
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined,
      };

      return item as unknown as vscode.StatusBarItem;
    },
  };
}
