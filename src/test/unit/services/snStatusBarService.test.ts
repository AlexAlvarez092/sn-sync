import * as assert from "assert";
import * as vscode from "vscode";
import {
  registerSnStatusBar,
  SnStatusBarService,
  STATUS_BAR_MENU_COMMAND_ID,
  type SnStatusBarRuntime,
} from "@services/snStatusBarService.js";
import { SN_SYNC_COMMANDS } from "@shared/constants/snSyncConstants.js";

class FakeStatusBarItem {
  public readonly id = `fake-${Math.random().toString(36).slice(2)}`;
  public alignment = vscode.StatusBarAlignment.Left;
  public priority = 0;
  public text = "";
  public tooltip?: string;
  public command?: string | vscode.Command;
  public name?: string;
  public accessibilityInformation?: vscode.AccessibilityInformation;
  public backgroundColor?: vscode.ThemeColor;
  public color?: string | vscode.ThemeColor;
  public visible = false;
  public disposed = false;

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public dispose(): void {
    this.disposed = true;
  }
}

type Listener<T> = (event: T) => void;

class FakeStatusBarRuntime implements SnStatusBarRuntime {
  public workspaceOpen = true;
  public activeEditor = false;
  public config: {
    enabled: boolean;
    mode: "minimal" | "expanded";
    visibleCommands?: string[];
  } = {
    enabled: true,
    mode: "minimal",
    visibleCommands: undefined,
  };
  public readonly items: FakeStatusBarItem[] = [];
  public readonly registeredCommands = new Map<
    string,
    (...args: unknown[]) => unknown
  >();
  public readonly executedCommands: string[] = [];

  private readonly configListeners: Array<
    Listener<vscode.ConfigurationChangeEvent>
  > = [];
  private readonly workspaceListeners: Array<Listener<void>> = [];
  private readonly activeEditorListeners: Array<Listener<void>> = [];
  private quickPickResult: vscode.QuickPickItem | undefined;

  public createStatusBarItem(): vscode.StatusBarItem {
    const item = new FakeStatusBarItem();
    this.items.push(item);
    return item as unknown as vscode.StatusBarItem;
  }

  public registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown,
  ): vscode.Disposable {
    this.registeredCommands.set(command, callback);

    return new vscode.Disposable(() => {
      this.registeredCommands.delete(command);
    });
  }

  public executeCommand(command: string): Thenable<unknown> {
    this.executedCommands.push(command);
    return Promise.resolve(undefined);
  }

  public showQuickPick(): Thenable<vscode.QuickPickItem | undefined> {
    return Promise.resolve(this.quickPickResult);
  }

  public onDidChangeConfiguration(
    listener: (event: vscode.ConfigurationChangeEvent) => void,
  ): vscode.Disposable {
    this.configListeners.push(listener);
    return new vscode.Disposable(() => undefined);
  }

  public onDidChangeWorkspaceFolders(listener: () => void): vscode.Disposable {
    this.workspaceListeners.push(listener);
    return new vscode.Disposable(() => undefined);
  }

  public onDidChangeActiveTextEditor(listener: () => void): vscode.Disposable {
    this.activeEditorListeners.push(listener);
    return new vscode.Disposable(() => undefined);
  }

  public getConfiguration(): vscode.WorkspaceConfiguration {
    const current = this.config;

    return {
      get: <T>(section: string, defaultValue?: T): T => {
        if (section === "statusBar.enabled") {
          return current.enabled as T;
        }

        if (section === "statusBar.mode") {
          return current.mode as T;
        }

        if (section === "statusBar.visibleCommands") {
          return (current.visibleCommands as T) ?? (defaultValue as T);
        }

        return defaultValue as T;
      },
    } as vscode.WorkspaceConfiguration;
  }

  public hasWorkspaceFolder(): boolean {
    return this.workspaceOpen;
  }

  public hasActiveEditor(): boolean {
    return this.activeEditor;
  }

  public setQuickPickResult(item: vscode.QuickPickItem | undefined): void {
    this.quickPickResult = item;
  }

  public triggerConfigChanged(affected = true): void {
    const event = {
      affectsConfiguration: (section: string) =>
        affected && section === "sn-sync.statusBar",
    } as vscode.ConfigurationChangeEvent;

    for (const listener of this.configListeners) {
      listener(event);
    }
  }

  public triggerWorkspaceChanged(): void {
    for (const listener of this.workspaceListeners) {
      listener();
    }
  }

  public triggerActiveEditorChanged(): void {
    for (const listener of this.activeEditorListeners) {
      listener();
    }
  }
}

function getMenuItem(runtime: FakeStatusBarRuntime): FakeStatusBarItem {
  const item = runtime.items.find(
    (candidate) => candidate.command === STATUS_BAR_MENU_COMMAND_ID,
  );
  assert.ok(item);
  return item;
}

function getCommandItem(
  runtime: FakeStatusBarRuntime,
  commandId: string,
): FakeStatusBarItem {
  const item = runtime.items.find(
    (candidate) => candidate.command === commandId,
  );
  assert.ok(item);
  return item;
}

suite("snStatusBarService", () => {
  test("registerSnStatusBar registers disposable and disposes all items", () => {
    const runtime = new FakeStatusBarRuntime();
    const context = {
      subscriptions: [] as vscode.Disposable[],
    } as unknown as vscode.ExtensionContext;

    registerSnStatusBar(context, runtime);

    assert.strictEqual(context.subscriptions.length, 1);
    assert.strictEqual(runtime.items.length, 13);

    context.subscriptions[0].dispose();

    assert.ok(runtime.items.every((item) => item.disposed));
  });

  test("minimal mode shows only menu item", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "minimal";
    runtime.workspaceOpen = true;

    const service = new SnStatusBarService(runtime);

    try {
      assert.strictEqual(getMenuItem(runtime).visible, true);
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_ACTIVE).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_MODIFIED).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.AUTH).visible,
        false,
      );
    } finally {
      service.dispose();
    }
  });

  test("expanded mode hides active-editor action when no active editor exists", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = true;
    runtime.activeEditor = false;

    const service = new SnStatusBarService(runtime);

    try {
      assert.strictEqual(getMenuItem(runtime).visible, false);
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_MODIFIED).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_ACTIVE).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.AUTH).visible,
        false,
      );
    } finally {
      service.dispose();
    }
  });

  test("hides all items when no workspace is open", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = false;

    const service = new SnStatusBarService(runtime);

    try {
      assert.ok(runtime.items.every((item) => item.visible === false));
    } finally {
      service.dispose();
    }
  });

  test("hides all items when status bar is disabled", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.enabled = false;
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;

    const service = new SnStatusBarService(runtime);

    try {
      assert.ok(runtime.items.every((item) => item.visible === false));
    } finally {
      service.dispose();
    }
  });

  test("applies visible command subset from configuration", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;
    runtime.config.visibleCommands = [SN_SYNC_COMMANDS.PULL];

    const service = new SnStatusBarService(runtime);

    try {
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_ACTIVE).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_MODIFIED).visible,
        false,
      );
    } finally {
      service.dispose();
    }
  });

  test("shows non-default command when configured in expanded mode", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;
    runtime.config.visibleCommands = [SN_SYNC_COMMANDS.AUTH];

    const service = new SnStatusBarService(runtime);

    try {
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.AUTH).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        false,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_MODIFIED).visible,
        false,
      );
    } finally {
      service.dispose();
    }
  });

  test("updates items when mode changes through configuration event", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "minimal";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;

    const service = new SnStatusBarService(runtime);

    try {
      assert.strictEqual(getMenuItem(runtime).visible, true);
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        false,
      );

      runtime.config.mode = "expanded";
      runtime.triggerConfigChanged(true);

      assert.strictEqual(getMenuItem(runtime).visible, false);
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PULL).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_ACTIVE).visible,
        true,
      );
      assert.strictEqual(
        getCommandItem(runtime, SN_SYNC_COMMANDS.PUSH_MODIFIED).visible,
        true,
      );
    } finally {
      service.dispose();
    }
  });

  test("menu command executes selected configured command", async () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "minimal";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;
    runtime.setQuickPickResult({
      label: "sn: push active",
    });

    const service = new SnStatusBarService(runtime);

    try {
      const menuCommand = runtime.registeredCommands.get(
        STATUS_BAR_MENU_COMMAND_ID,
      );
      assert.ok(menuCommand);

      await menuCommand!();

      assert.deepStrictEqual(runtime.executedCommands, [
        SN_SYNC_COMMANDS.PUSH_ACTIVE,
      ]);
    } finally {
      service.dispose();
    }
  });

  test("menu command does nothing when no commands are available", async () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.workspaceOpen = false;
    runtime.activeEditor = false;

    const service = new SnStatusBarService(runtime);

    try {
      const menuCommand = runtime.registeredCommands.get(
        STATUS_BAR_MENU_COMMAND_ID,
      );
      assert.ok(menuCommand);

      await menuCommand!();

      assert.deepStrictEqual(runtime.executedCommands, []);
    } finally {
      service.dispose();
    }
  });

  test("menu command does nothing when quick-pick is cancelled", async () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;
    runtime.setQuickPickResult(undefined);

    const service = new SnStatusBarService(runtime);

    try {
      const menuCommand = runtime.registeredCommands.get(
        STATUS_BAR_MENU_COMMAND_ID,
      );
      assert.ok(menuCommand);

      await menuCommand!();

      assert.deepStrictEqual(runtime.executedCommands, []);
    } finally {
      service.dispose();
    }
  });

  test("menu command does nothing when quick-pick selection is unknown", async () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;
    runtime.setQuickPickResult({
      label: "sn: not-supported",
    });

    const service = new SnStatusBarService(runtime);

    try {
      const menuCommand = runtime.registeredCommands.get(
        STATUS_BAR_MENU_COMMAND_ID,
      );
      assert.ok(menuCommand);

      await menuCommand!();

      assert.deepStrictEqual(runtime.executedCommands, []);
    } finally {
      service.dispose();
    }
  });

  test("refresh tolerates missing command item entries", () => {
    const runtime = new FakeStatusBarRuntime();
    runtime.config.mode = "expanded";
    runtime.workspaceOpen = true;
    runtime.activeEditor = true;

    const service = new SnStatusBarService(runtime);

    try {
      (
        service as unknown as {
          commandItems: Map<string, vscode.StatusBarItem>;
        }
      ).commandItems.delete(SN_SYNC_COMMANDS.PULL);

      assert.doesNotThrow(() => service.refresh());
    } finally {
      service.dispose();
    }
  });

  test("default runtime wiring works with patched vscode APIs", async () => {
    const createdItems: FakeStatusBarItem[] = [];
    const registeredCommands = new Map<
      string,
      (...args: unknown[]) => unknown
    >();
    const executedCommands: string[] = [];

    const windowObject = vscode.window as unknown as {
      createStatusBarItem: (...args: unknown[]) => vscode.StatusBarItem;
      showQuickPick: (...args: unknown[]) => Thenable<unknown>;
      onDidChangeActiveTextEditor: (...args: unknown[]) => vscode.Disposable;
      activeTextEditor: vscode.TextEditor | undefined;
    };
    const workspaceObject = vscode.workspace as unknown as {
      getConfiguration: typeof vscode.workspace.getConfiguration;
      onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration;
      onDidChangeWorkspaceFolders: typeof vscode.workspace.onDidChangeWorkspaceFolders;
      workspaceFolders: vscode.WorkspaceFolder[] | undefined;
    };
    const commandsObject = vscode.commands as unknown as {
      registerCommand: typeof vscode.commands.registerCommand;
      executeCommand: (...args: unknown[]) => Thenable<unknown>;
    };

    const originalCreateStatusBarItem = windowObject.createStatusBarItem;
    const originalShowQuickPick = windowObject.showQuickPick;
    const originalOnDidChangeActiveTextEditor =
      windowObject.onDidChangeActiveTextEditor;
    const originalGetConfiguration = workspaceObject.getConfiguration;
    const originalOnDidChangeConfiguration =
      workspaceObject.onDidChangeConfiguration;
    const originalOnDidChangeWorkspaceFolders =
      workspaceObject.onDidChangeWorkspaceFolders;
    const originalRegisterCommand = commandsObject.registerCommand;
    const originalExecuteCommand = commandsObject.executeCommand;
    const workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(
      vscode.workspace,
      "workspaceFolders",
    );
    const activeEditorDescriptor = Object.getOwnPropertyDescriptor(
      vscode.window,
      "activeTextEditor",
    );

    windowObject.createStatusBarItem = ((
      _alignment?: vscode.StatusBarAlignment,
      _priority?: number,
    ) => {
      const item = new FakeStatusBarItem();
      createdItems.push(item);
      return item as unknown as vscode.StatusBarItem;
    }) as unknown as (...args: unknown[]) => vscode.StatusBarItem;
    windowObject.showQuickPick = (async (
      items:
        | readonly vscode.QuickPickItem[]
        | Thenable<readonly vscode.QuickPickItem[]>,
    ) => {
      const resolvedItems = await Promise.resolve(items);
      return resolvedItems[0];
    }) as unknown as (...args: unknown[]) => Thenable<unknown>;
    windowObject.onDidChangeActiveTextEditor = ((
      _listener: (e: vscode.TextEditor | undefined) => unknown,
    ) => new vscode.Disposable(() => undefined)) as unknown as (
      ...args: unknown[]
    ) => vscode.Disposable;

    workspaceObject.getConfiguration = (_section?: string) =>
      ({
        get: <T>(key: string, defaultValue?: T): T => {
          if (key === "statusBar.enabled") {
            return true as T;
          }

          if (key === "statusBar.mode") {
            return "minimal" as T;
          }

          if (key === "statusBar.visibleCommands") {
            return defaultValue as T;
          }

          return defaultValue as T;
        },
      }) as unknown as vscode.WorkspaceConfiguration;
    workspaceObject.onDidChangeConfiguration = (
      _listener: (event: vscode.ConfigurationChangeEvent) => unknown,
    ) => new vscode.Disposable(() => undefined);
    workspaceObject.onDidChangeWorkspaceFolders = (
      _listener: (e: vscode.WorkspaceFoldersChangeEvent) => unknown,
    ) => new vscode.Disposable(() => undefined);

    commandsObject.registerCommand = (
      command: string,
      callback: (...args: unknown[]) => unknown,
    ) => {
      registeredCommands.set(command, callback);
      return new vscode.Disposable(() => registeredCommands.delete(command));
    };
    commandsObject.executeCommand = (async (command: string) => {
      executedCommands.push(command);
      return undefined;
    }) as unknown as (...args: unknown[]) => Thenable<unknown>;

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      configurable: true,
      value: [{ uri: vscode.Uri.file("/tmp/ws"), name: "ws", index: 0 }],
    });
    Object.defineProperty(vscode.window, "activeTextEditor", {
      configurable: true,
      value: {
        document: {
          uri: vscode.Uri.file("/tmp/ws/src/a.js"),
        },
      } as unknown as vscode.TextEditor,
    });

    try {
      const context = {
        subscriptions: [] as vscode.Disposable[],
      } as unknown as vscode.ExtensionContext;

      registerSnStatusBar(context);

      assert.strictEqual(context.subscriptions.length, 1);
      assert.strictEqual(createdItems.length, 13);

      const menuCommand = registeredCommands.get(STATUS_BAR_MENU_COMMAND_ID);
      assert.ok(menuCommand);

      await menuCommand!();

      assert.deepStrictEqual(executedCommands, [SN_SYNC_COMMANDS.PULL]);

      context.subscriptions[0].dispose();
      assert.ok(createdItems.every((item) => item.disposed));
    } finally {
      windowObject.createStatusBarItem = originalCreateStatusBarItem;
      windowObject.showQuickPick = originalShowQuickPick;
      windowObject.onDidChangeActiveTextEditor =
        originalOnDidChangeActiveTextEditor;
      workspaceObject.getConfiguration = originalGetConfiguration;
      workspaceObject.onDidChangeConfiguration =
        originalOnDidChangeConfiguration;
      workspaceObject.onDidChangeWorkspaceFolders =
        originalOnDidChangeWorkspaceFolders;
      commandsObject.registerCommand = originalRegisterCommand;
      commandsObject.executeCommand = originalExecuteCommand;

      if (workspaceFoldersDescriptor) {
        Object.defineProperty(
          vscode.workspace,
          "workspaceFolders",
          workspaceFoldersDescriptor,
        );
      }

      if (activeEditorDescriptor) {
        Object.defineProperty(
          vscode.window,
          "activeTextEditor",
          activeEditorDescriptor,
        );
      }
    }
  });

  test("default runtime hides status bar when workspace folders are undefined", () => {
    const createdItems: FakeStatusBarItem[] = [];

    const windowObject = vscode.window as unknown as {
      createStatusBarItem: (...args: unknown[]) => vscode.StatusBarItem;
      onDidChangeActiveTextEditor: (...args: unknown[]) => vscode.Disposable;
      activeTextEditor: vscode.TextEditor | undefined;
    };
    const workspaceObject = vscode.workspace as unknown as {
      getConfiguration: typeof vscode.workspace.getConfiguration;
      onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration;
      onDidChangeWorkspaceFolders: typeof vscode.workspace.onDidChangeWorkspaceFolders;
      workspaceFolders: vscode.WorkspaceFolder[] | undefined;
    };
    const commandsObject = vscode.commands as unknown as {
      registerCommand: typeof vscode.commands.registerCommand;
    };

    const originalCreateStatusBarItem = windowObject.createStatusBarItem;
    const originalOnDidChangeActiveTextEditor =
      windowObject.onDidChangeActiveTextEditor;
    const originalGetConfiguration = workspaceObject.getConfiguration;
    const originalOnDidChangeConfiguration =
      workspaceObject.onDidChangeConfiguration;
    const originalOnDidChangeWorkspaceFolders =
      workspaceObject.onDidChangeWorkspaceFolders;
    const originalRegisterCommand = commandsObject.registerCommand;
    const workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(
      vscode.workspace,
      "workspaceFolders",
    );

    windowObject.createStatusBarItem = ((
      _alignment?: vscode.StatusBarAlignment,
      _priority?: number,
    ) => {
      const item = new FakeStatusBarItem();
      createdItems.push(item);
      return item as unknown as vscode.StatusBarItem;
    }) as unknown as (...args: unknown[]) => vscode.StatusBarItem;
    windowObject.onDidChangeActiveTextEditor = ((
      _listener: (e: vscode.TextEditor | undefined) => unknown,
    ) => new vscode.Disposable(() => undefined)) as unknown as (
      ...args: unknown[]
    ) => vscode.Disposable;
    workspaceObject.getConfiguration = (_section?: string) =>
      ({
        get: <T>(key: string, defaultValue?: T): T => {
          if (key === "statusBar.enabled") {
            return true as T;
          }

          if (key === "statusBar.mode") {
            return "minimal" as T;
          }

          return defaultValue as T;
        },
      }) as unknown as vscode.WorkspaceConfiguration;
    workspaceObject.onDidChangeConfiguration = (
      _listener: (event: vscode.ConfigurationChangeEvent) => unknown,
    ) => new vscode.Disposable(() => undefined);
    workspaceObject.onDidChangeWorkspaceFolders = (
      _listener: (e: vscode.WorkspaceFoldersChangeEvent) => unknown,
    ) => new vscode.Disposable(() => undefined);
    commandsObject.registerCommand = (
      _command: string,
      _callback: (...args: unknown[]) => unknown,
    ) => new vscode.Disposable(() => undefined);

    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      configurable: true,
      value: undefined,
    });

    try {
      const context = {
        subscriptions: [] as vscode.Disposable[],
      } as unknown as vscode.ExtensionContext;

      registerSnStatusBar(context);

      assert.strictEqual(createdItems.length, 13);
      assert.ok(createdItems.every((item) => item.visible === false));

      context.subscriptions[0].dispose();
    } finally {
      windowObject.createStatusBarItem = originalCreateStatusBarItem;
      windowObject.onDidChangeActiveTextEditor =
        originalOnDidChangeActiveTextEditor;
      workspaceObject.getConfiguration = originalGetConfiguration;
      workspaceObject.onDidChangeConfiguration =
        originalOnDidChangeConfiguration;
      workspaceObject.onDidChangeWorkspaceFolders =
        originalOnDidChangeWorkspaceFolders;
      commandsObject.registerCommand = originalRegisterCommand;

      if (workspaceFoldersDescriptor) {
        Object.defineProperty(
          vscode.workspace,
          "workspaceFolders",
          workspaceFoldersDescriptor,
        );
      }
    }
  });
});
