import * as vscode from "vscode";
import { SN_SYNC_COMMANDS } from "@shared/constants/snSyncConstants.js";

type SnStatusBarMode = "minimal" | "expanded";

interface SnStatusBarCommandDescriptor {
  id: string;
  label: string;
  text: string;
  requiresActiveEditor: boolean;
  priority: number;
}

export const STATUS_BAR_MENU_COMMAND_ID = "sn-sync.status-bar-menu";

const STATUS_BAR_COMMANDS: SnStatusBarCommandDescriptor[] = [
  {
    id: SN_SYNC_COMMANDS.INIT,
    label: "sn: init",
    text: "sn init",
    requiresActiveEditor: false,
    priority: 99,
  },
  {
    id: SN_SYNC_COMMANDS.AUTH,
    label: "sn: auth",
    text: "sn auth",
    requiresActiveEditor: false,
    priority: 98,
  },
  {
    id: SN_SYNC_COMMANDS.AUTH_CONFIG,
    label: "sn: auth config",
    text: "sn auth config",
    requiresActiveEditor: false,
    priority: 97,
  },
  {
    id: SN_SYNC_COMMANDS.AUTH_VALIDATE,
    label: "sn: auth validate",
    text: "sn validate",
    requiresActiveEditor: false,
    priority: 96,
  },
  {
    id: SN_SYNC_COMMANDS.RESET,
    label: "sn: reset",
    text: "sn reset",
    requiresActiveEditor: false,
    priority: 95,
  },
  {
    id: SN_SYNC_COMMANDS.RESET_AUTH,
    label: "sn: reset auth",
    text: "sn reset auth",
    requiresActiveEditor: false,
    priority: 94,
  },
  {
    id: SN_SYNC_COMMANDS.RUN_BACKGROUND_SCRIPT,
    label: "sn: run background script",
    text: "sn run bg",
    requiresActiveEditor: false,
    priority: 93,
  },
  {
    id: SN_SYNC_COMMANDS.OPEN_ACTIVE_IN_INSTANCE,
    label: "sn: open active in instance",
    text: "sn open active",
    requiresActiveEditor: true,
    priority: 92,
  },
  {
    id: SN_SYNC_COMMANDS.PULL,
    label: "sn: pull",
    text: "sn pull",
    requiresActiveEditor: false,
    priority: 91,
  },
  {
    id: SN_SYNC_COMMANDS.PULL_TABLE,
    label: "sn: pull table",
    text: "sn pull table",
    requiresActiveEditor: false,
    priority: 90,
  },
  {
    id: SN_SYNC_COMMANDS.PULL_BY_SYS_ID,
    label: "sn: pull by sys_id",
    text: "sn pull by sys_id",
    requiresActiveEditor: false,
    priority: 89,
  },
  {
    id: SN_SYNC_COMMANDS.RESET_INDEX,
    label: "sn: reset index",
    text: "sn reset index",
    requiresActiveEditor: false,
    priority: 88,
  },
  {
    id: SN_SYNC_COMMANDS.PUSH,
    label: "sn: push",
    text: "sn push",
    requiresActiveEditor: false,
    priority: 87,
  },
  {
    id: SN_SYNC_COMMANDS.PUSH_CURRENT,
    label: "sn: push current",
    text: "sn push current",
    requiresActiveEditor: true,
    priority: 86,
  },
  {
    id: SN_SYNC_COMMANDS.PUSH_MODIFIED,
    label: "sn: push modified",
    text: "sn push modified",
    requiresActiveEditor: false,
    priority: 85,
  },
  {
    id: SN_SYNC_COMMANDS.PUSH_REPORT,
    label: "sn: push report",
    text: "sn push report",
    requiresActiveEditor: false,
    priority: 84,
  },
];

const DEFAULT_VISIBLE_COMMANDS = [
  SN_SYNC_COMMANDS.PULL,
  SN_SYNC_COMMANDS.PUSH,
  SN_SYNC_COMMANDS.PUSH_REPORT,
];

interface SnStatusBarConfig {
  enabled: boolean;
  mode: SnStatusBarMode;
  visibleCommands: string[] | undefined;
}

export interface SnStatusBarRuntime {
  createStatusBarItem(
    alignment?: vscode.StatusBarAlignment,
    priority?: number,
  ): vscode.StatusBarItem;
  registerCommand(
    command: string,
    callback: (...args: unknown[]) => unknown,
  ): vscode.Disposable;
  executeCommand(command: string): Thenable<unknown>;
  showQuickPick(
    items: vscode.QuickPickItem[],
    options?: vscode.QuickPickOptions,
  ): Thenable<vscode.QuickPickItem | undefined>;
  onDidChangeConfiguration(
    listener: (event: vscode.ConfigurationChangeEvent) => void,
  ): vscode.Disposable;
  onDidChangeWorkspaceFolders(listener: () => void): vscode.Disposable;
  onDidChangeActiveTextEditor(listener: () => void): vscode.Disposable;
  getConfiguration(): vscode.WorkspaceConfiguration;
  hasWorkspaceFolder(): boolean;
  hasActiveEditor(): boolean;
}

const defaultRuntime: SnStatusBarRuntime = {
  createStatusBarItem: (alignment, priority) =>
    vscode.window.createStatusBarItem(alignment, priority),
  registerCommand: (command, callback) =>
    vscode.commands.registerCommand(command, callback),
  executeCommand: (command) => vscode.commands.executeCommand(command),
  showQuickPick: (items, options) =>
    vscode.window.showQuickPick(items, options),
  onDidChangeConfiguration: (listener) =>
    vscode.workspace.onDidChangeConfiguration(listener),
  onDidChangeWorkspaceFolders: (listener) =>
    vscode.workspace.onDidChangeWorkspaceFolders(() => listener()),
  onDidChangeActiveTextEditor: (listener) =>
    vscode.window.onDidChangeActiveTextEditor(() => listener()),
  getConfiguration: () => vscode.workspace.getConfiguration("sn-sync"),
  hasWorkspaceFolder: () =>
    (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
  hasActiveEditor: () => vscode.window.activeTextEditor !== undefined,
};

export class SnStatusBarService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly commandItems = new Map<string, vscode.StatusBarItem>();
  private readonly menuItem: vscode.StatusBarItem;

  public constructor(
    private readonly runtime: SnStatusBarRuntime = defaultRuntime,
  ) {
    this.menuItem = this.runtime.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.menuItem.text = "sn-sync";
    this.menuItem.tooltip = "Run sn-sync commands";
    this.menuItem.command = STATUS_BAR_MENU_COMMAND_ID;
    this.disposables.push(this.menuItem);

    for (const command of STATUS_BAR_COMMANDS) {
      const item = this.runtime.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        command.priority,
      );
      item.text = command.text;
      item.tooltip = command.label;
      item.command = command.id;
      this.commandItems.set(command.id, item);
      this.disposables.push(item);
    }

    this.disposables.push(
      this.runtime.registerCommand(STATUS_BAR_MENU_COMMAND_ID, async () => {
        await this.showMenu();
      }),
    );

    this.disposables.push(
      this.runtime.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("sn-sync.statusBar")) {
          this.refresh();
        }
      }),
    );
    this.disposables.push(
      this.runtime.onDidChangeWorkspaceFolders(() => this.refresh()),
    );
    this.disposables.push(
      this.runtime.onDidChangeActiveTextEditor(() => this.refresh()),
    );

    this.refresh();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public refresh(): void {
    const config = this.getConfig();
    const visibleCommands = this.getConfiguredCommands(config.visibleCommands);
    const availableCommands = this.getAvailableCommands(visibleCommands);

    if (!config.enabled) {
      this.hideAll();
      return;
    }

    if (config.mode === "minimal") {
      if (availableCommands.length > 0) {
        this.menuItem.show();
      } else {
        this.menuItem.hide();
      }

      for (const item of this.commandItems.values()) {
        item.hide();
      }

      return;
    }

    this.menuItem.hide();

    for (const command of STATUS_BAR_COMMANDS) {
      const item = this.commandItems.get(command.id);
      if (!item) {
        continue;
      }

      if (availableCommands.some((available) => available.id === command.id)) {
        item.show();
      } else {
        item.hide();
      }
    }
  }

  private getConfig(): SnStatusBarConfig {
    const config = this.runtime.getConfiguration();
    const mode = config.get<SnStatusBarMode>("statusBar.mode", "minimal");

    return {
      enabled: config.get<boolean>("statusBar.enabled", true),
      mode: mode === "expanded" ? "expanded" : "minimal",
      visibleCommands: config.get<string[] | undefined>(
        "statusBar.visibleCommands",
        undefined,
      ),
    };
  }

  private getConfiguredCommands(
    visibleCommands: string[] | undefined,
  ): SnStatusBarCommandDescriptor[] {
    const normalizedVisibleCommands =
      Array.isArray(visibleCommands) && visibleCommands.length > 0
        ? visibleCommands
        : DEFAULT_VISIBLE_COMMANDS;
    const configuredSet = new Set(normalizedVisibleCommands);

    return STATUS_BAR_COMMANDS.filter((command) =>
      configuredSet.has(command.id),
    );
  }

  private getAvailableCommands(
    configuredCommands: SnStatusBarCommandDescriptor[],
  ): SnStatusBarCommandDescriptor[] {
    if (!this.runtime.hasWorkspaceFolder()) {
      return [];
    }

    const hasActiveEditor = this.runtime.hasActiveEditor();

    return configuredCommands.filter(
      (command) => !command.requiresActiveEditor || hasActiveEditor,
    );
  }

  private async showMenu(): Promise<void> {
    const config = this.getConfig();
    const configuredCommands = this.getConfiguredCommands(
      config.visibleCommands,
    );
    const availableCommands = this.getAvailableCommands(configuredCommands);

    if (availableCommands.length === 0) {
      return;
    }

    const picked = await this.runtime.showQuickPick(
      availableCommands.map((command) => ({
        label: command.label,
        description: command.text,
      })),
      {
        placeHolder: "Select an sn-sync command",
      },
    );

    if (!picked) {
      return;
    }

    const selected = availableCommands.find(
      (command) => command.label === picked.label,
    );

    if (!selected) {
      return;
    }

    await this.runtime.executeCommand(selected.id);
  }

  private hideAll(): void {
    this.menuItem.hide();

    for (const item of this.commandItems.values()) {
      item.hide();
    }
  }
}

export function registerSnStatusBar(
  context: vscode.ExtensionContext,
  runtime: SnStatusBarRuntime = defaultRuntime,
): void {
  context.subscriptions.push(new SnStatusBarService(runtime));
}
