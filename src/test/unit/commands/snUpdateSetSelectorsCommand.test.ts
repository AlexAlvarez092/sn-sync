import * as assert from "assert";
import * as vscode from "vscode";
import {
  defaultRuntime,
  initializeUpdateSetSelectors,
  registerUpdateSetSelectors,
  StatusBarUpdateSetSelectorsController,
  type SnUpdateSetSelectorsRuntime,
} from "@commands/snUpdateSetSelectorsCommand.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snUpdateSetSelectorsCommand", () => {
  test("registers selector commands and stores disposables in context subscriptions", () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    try {
      registerUpdateSetSelectors(
        context,
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

      assert.strictEqual(context.subscriptions.length, 5);
    } finally {
      for (const disposable of context.subscriptions) {
        disposable.dispose();
      }
    }
  });

  test("selectors work without running selector init", async () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const workspaceUri = createTempWorkspaceUri("selectors-auto-init");
    const shownErrors: string[] = [];
    const activationSelections: Array<{ app: string; updateSet: string }> = [];
    const scopeSelections: Array<{
      scope: string;
      application: string;
      update_set: string;
    }> = [];
    let quickPickCall = 0;

    const runtime = createRuntimeStub();
    runtime.getWorkspaceFolderUri = () => workspaceUri;
    runtime.showErrorMessage = async (message: string) => {
      shownErrors.push(message);
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
      return undefined;
    };

    try {
      registerUpdateSetSelectors(
        context,
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

      await flushPromises();
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.UPDATE_SET_SELECT_SCOPE,
      );
      if (
        shownErrors.includes(SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY)
      ) {
        await flushPromises();
        await vscode.commands.executeCommand(
          SN_SYNC_COMMANDS.UPDATE_SET_SELECT_SCOPE,
        );
      }
      await vscode.commands.executeCommand(
        SN_SYNC_COMMANDS.UPDATE_SET_SELECT_UPDATE_SET,
      );

      if (shownErrors.length > 0) {
        assert.deepStrictEqual(shownErrors, [
          SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY,
        ]);
      }
      assert.ok(
        activationSelections.some(
          (selection) =>
            selection.app === "app-2" && selection.updateSet === "us-app-2-b",
        ),
      );
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

  test("selector commands show not-ready while no workspace is open", async () => {
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;
    const shownErrors: string[] = [];

    const controller = new StatusBarUpdateSetSelectorsController(
      context,
      {
        listInProgressUpdateSets: async () => [],
      } as unknown as never,
      {
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () => undefined,
        showErrorMessage: async (message: string) => {
          shownErrors.push(message);
          return undefined;
        },
      },
    );

    try {
      await controller.selectScope();
      await controller.selectUpdateSet();

      assert.deepStrictEqual(shownErrors, [
        SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY,
        SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY,
      ]);
    } finally {
      controller.dispose();
      for (const disposable of context.subscriptions) {
        disposable.dispose();
      }
    }
  });

  test("initialization falls back to global scope when scoped apps cannot be loaded", async () => {
    const capturedStates: Array<{
      selectedScope: string;
      scopeCount: number;
      globalUpdateSet: string;
    }> = [];
    const shownInfos: string[] = [];

    await initializeUpdateSetSelectors(
      {} as vscode.ExtensionContext,
      {
        listScopedApplications: async () => {
          throw new Error("no-auth");
        },
        listInProgressUpdateSets: async () => [],
      },
      {
        getScopeUpdateSetSelections: async () => ({
          global: {
            application: "global",
            update_set: "us-global",
            update_set_name: "US Global",
          },
        }),
        replaceScopeUpdateSetSelections: async () => undefined,
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async (state) => {
          capturedStates.push({
            selectedScope: state.selectedScope,
            scopeCount: state.scopes.length,
            globalUpdateSet: state.selections.global?.update_set ?? "",
          });
        },
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("selectors-fallback"),
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(capturedStates, [
      {
        selectedScope: "global",
        scopeCount: 1,
        globalUpdateSet: "us-global",
      },
    ]);
    assert.ok(
      shownInfos.some((message) =>
        message.startsWith(
          SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_INIT_FAILED_PREFIX,
        ),
      ),
    );
  });

  test("initialization returns early when no workspace is open", async () => {
    let listScopedApplicationsCalled = false;
    let updateStateCalled = false;
    const shownInfos: string[] = [];

    await initializeUpdateSetSelectors(
      {} as vscode.ExtensionContext,
      {
        listScopedApplications: async () => {
          listScopedApplicationsCalled = true;
          return [];
        },
        listInProgressUpdateSets: async () => [],
      },
      {
        getScopeUpdateSetSelections: async () => ({}),
        replaceScopeUpdateSetSelections: async () => undefined,
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async () => {
          updateStateCalled = true;
        },
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () => undefined,
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.strictEqual(listScopedApplicationsCalled, false);
    assert.strictEqual(updateStateCalled, false);
    assert.deepStrictEqual(shownInfos, []);
  });

  test("initialization returns early with default runtime when no workspace is open", async () => {
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    let listScopedApplicationsCalled = false;
    let updateStateCalled = false;

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      configurable: true,
      value: undefined,
    });

    try {
      await initializeUpdateSetSelectors(
        {} as vscode.ExtensionContext,
        {
          listScopedApplications: async () => {
            listScopedApplicationsCalled = true;
            return [];
          },
          listInProgressUpdateSets: async () => [],
        },
        {
          getScopeUpdateSetSelections: async () => ({}),
          replaceScopeUpdateSetSelections: async () => undefined,
          setActivationSelection: async () => undefined,
          setScopeUpdateSetSelection: async () => undefined,
        } as unknown as never,
        {
          updateState: async () => {
            updateStateCalled = true;
          },
          selectScope: async () => undefined,
          selectUpdateSet: async () => undefined,
          dispose: () => undefined,
        },
      );
    } finally {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        configurable: true,
        value: originalWorkspaceFolders,
      });
    }

    assert.strictEqual(listScopedApplicationsCalled, false);
    assert.strictEqual(updateStateCalled, false);
  });

  test("initialization cleans stale scope mappings and picks first configured scope", async () => {
    const workspaceUri = createTempWorkspaceUri("selectors-cleanup");
    const replacedSelections: Array<Record<string, unknown>> = [];
    let receivedState:
      | {
          selectedScope: string;
          scopes: Array<{ scope: string }>;
          selections: Record<string, { update_set: string }>;
        }
      | undefined;

    await initializeUpdateSetSelectors(
      {} as vscode.ExtensionContext,
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
          receivedState = {
            selectedScope: state.selectedScope,
            scopes: state.scopes,
            selections: state.selections,
          };
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
    assert.strictEqual(receivedState?.selectedScope, "x_company_app");
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

    const controller = new StatusBarUpdateSetSelectorsController(
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
        workspaceFolderUri: createTempWorkspaceUri("selectors-no-update-set"),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {
          x_app_one: { application: "app-1", update_set: "" },
        },
        selectedScope: "x_app_one",
      });

      await controller.selectUpdateSet();

      assert.ok(
        shownInfos.includes(SN_SYNC_MESSAGES.UPDATE_SET_NO_IN_PROGRESS_FOUND),
      );
    } finally {
      controller.dispose();
    }
  });

  test("selector update-set marks current as selected and returns on cancel", async () => {
    const capturedDescriptions: string[] = [];

    const runtime = createRuntimeStub();
    runtime.showQuickPick = async (items) => {
      capturedDescriptions.push(...items.map((item) => item.description || ""));
      return undefined;
    };

    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    const controller = new StatusBarUpdateSetSelectorsController(
      context,
      {
        listInProgressUpdateSets: async () => [
          { sys_id: "us-1", name: "US One" },
          { sys_id: "us-2", name: "US Two" },
        ],
      } as unknown as never,
      {
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      runtime,
    );

    try {
      await controller.updateState({
        workspaceFolderUri: createTempWorkspaceUri("selectors-selected-badge"),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {
          x_app_one: {
            application: "app-1",
            update_set: "us-2",
            update_set_name: "US Two",
          },
        },
        selectedScope: "x_app_one",
      });

      await controller.selectUpdateSet();

      assert.ok(capturedDescriptions.includes("selected"));
    } finally {
      controller.dispose();
    }
  });

  test("status bar and scope picker fall back to update_set sys_id when name is missing", async () => {
    const capturedScopeDescriptions: string[] = [];
    const createdStatusBarItems: vscode.StatusBarItem[] = [];

    const runtime: SnUpdateSetSelectorsRuntime = {
      getWorkspaceFolderUri: () =>
        createTempWorkspaceUri("selectors-fallback-update-set-name"),
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

    const controller = new StatusBarUpdateSetSelectorsController(
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
          "selectors-fallback-update-set-name-state",
        ),
        scopes: [{ sys_id: "app-1", name: "App One", scope: "x_app_one" }],
        selections: {
          x_app_one: { application: "app-1", update_set: "us-1" },
        },
        selectedScope: "x_missing_scope",
      });

      await controller.selectScope();

      assert.ok(createdStatusBarItems[1]?.text.includes("us-1"));
      assert.ok(capturedScopeDescriptions.includes("us-1"));
    } finally {
      controller.dispose();
    }
  });

  test("default runtime delegates workspace/messages/status bar creation", async () => {
    const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    const originalShowError = vscode.window.showErrorMessage;
    const originalShowInfo = vscode.window.showInformationMessage;
    const originalCreateStatusBarItem = vscode.window.createStatusBarItem;

    const shownErrors: string[] = [];
    const shownInfos: string[] = [];
    let createdStatusBar = false;

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      value: [{ uri: createTempWorkspaceUri("selectors-default-runtime") }],
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

    (vscode.window.createStatusBarItem as unknown as (
      alignment?: vscode.StatusBarAlignment,
      priority?: number,
    ) => vscode.StatusBarItem) = () => {
      createdStatusBar = true;
      return {
        text: "",
        tooltip: "",
        command: undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined,
      } as unknown as vscode.StatusBarItem;
    };

    try {
      const uri = defaultRuntime.getWorkspaceFolderUri();
      assert.ok(uri);
      await defaultRuntime.showErrorMessage("error-default-runtime");
      await defaultRuntime.showInformationMessage("info-default-runtime");
      defaultRuntime.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);

      assert.deepStrictEqual(shownErrors, ["error-default-runtime"]);
      assert.deepStrictEqual(shownInfos, ["info-default-runtime"]);
      assert.strictEqual(createdStatusBar, true);
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
      (vscode.window.createStatusBarItem as unknown as (
        alignment?: vscode.StatusBarAlignment,
        priority?: number,
      ) => vscode.StatusBarItem) = originalCreateStatusBarItem;
    }
  });

  test("fallback initialization uses empty global values when no global selection exists", async () => {
    const capturedStates: Array<{
      globalUpdateSet: string;
      globalUpdateSetName: string;
    }> = [];
    const shownInfos: string[] = [];

    await initializeUpdateSetSelectors(
      {} as vscode.ExtensionContext,
      {
        listScopedApplications: async () => {
          throw new Error("no-auth");
        },
        listInProgressUpdateSets: async () => [],
      },
      {
        getScopeUpdateSetSelections: async () => ({}),
        replaceScopeUpdateSetSelections: async () => undefined,
        setActivationSelection: async () => undefined,
        setScopeUpdateSetSelection: async () => undefined,
      } as unknown as never,
      {
        updateState: async (state) => {
          capturedStates.push({
            globalUpdateSet: state.selections.global?.update_set ?? "missing",
            globalUpdateSetName:
              state.selections.global?.update_set_name ?? "missing",
          });
        },
        selectScope: async () => undefined,
        selectUpdateSet: async () => undefined,
        dispose: () => undefined,
      },
      {
        ...createRuntimeStub(),
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("selectors-fallback-empty-global"),
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(capturedStates, [
      {
        globalUpdateSet: "",
        globalUpdateSetName: "",
      },
    ]);
    assert.ok(
      shownInfos.some((message) =>
        message.startsWith(
          `${SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_INIT_FAILED_PREFIX} no-auth`,
        ),
      ),
    );
  });

  test("initialization does not show info toast when auth is not configured", async () => {
    const shownInfos: string[] = [];

    await initializeUpdateSetSelectors(
      {} as vscode.ExtensionContext,
      {
        listScopedApplications: async () => {
          throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
        },
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
        getWorkspaceFolderUri: () =>
          createTempWorkspaceUri("selectors-auth-not-configured"),
        showInformationMessage: async (message: string) => {
          shownInfos.push(message);
          return undefined;
        },
      },
    );

    assert.deepStrictEqual(shownInfos, []);
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
});

function createRuntimeStub(): SnUpdateSetSelectorsRuntime {
  return {
    getWorkspaceFolderUri: () => createTempWorkspaceUri("selectors-runtime"),
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async (items) => items[0],
    createStatusBarItem: () => {
      const statusBarItem = {
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined,
      } as unknown as vscode.StatusBarItem;

      return statusBarItem;
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
