import * as vscode from "vscode";
import {
  SnUpdateSetDataService,
  type SnUpdateSetDataServiceApi,
} from "@services/snUpdateSetDataService.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import type {
  SnScopedApplication,
  SnUpdateSet,
} from "@shared/models/updateSet.js";
import type { ScopeUpdateSetSelection } from "@shared/models/config.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

const GLOBAL_SCOPED_APP: SnScopedApplication = {
  sys_id: "global",
  name: "Global",
  scope: "global",
};

interface ScopeQuickPickItem extends vscode.QuickPickItem {
  app: SnScopedApplication;
}

interface UpdateSetQuickPickItem extends vscode.QuickPickItem {
  updateSet: SnUpdateSet;
}

export interface UpdateSetSelectorState {
  workspaceFolderUri: vscode.Uri;
  scopes: SnScopedApplication[];
  selections: Record<string, ScopeUpdateSetSelection>;
  selectedScope: string;
}

export interface SnUpdateSetSelectorsRuntime extends SnBaseCommandRuntime {
  showQuickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;
  createStatusBarItem(
    alignment?: vscode.StatusBarAlignment,
    priority?: number,
  ): vscode.StatusBarItem;
}

export const defaultRuntime: SnUpdateSetSelectorsRuntime = {
  ...defaultBaseRuntime,
  showQuickPick: <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  createStatusBarItem: (
    alignment?: vscode.StatusBarAlignment,
    priority?: number,
  ) => vscode.window.createStatusBarItem(alignment, priority),
};

export interface SnUpdateSetSelectorsUiController {
  updateState(state: UpdateSetSelectorState): Promise<void>;
  selectScope(): Promise<void>;
  selectUpdateSet(): Promise<void>;
  dispose(): void;
}

export class StatusBarUpdateSetSelectorsController implements SnUpdateSetSelectorsUiController {
  private state: UpdateSetSelectorState | undefined;

  private readonly scopeItem: vscode.StatusBarItem;

  private readonly updateSetItem: vscode.StatusBarItem;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly activationDataService: SnUpdateSetDataServiceApi,
    private readonly configService: SnSyncConfigService,
    private readonly runtime: SnUpdateSetSelectorsRuntime,
  ) {
    this.scopeItem = runtime.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.scopeItem.command = SN_SYNC_COMMANDS.UPDATE_SET_SELECT_SCOPE;

    this.updateSetItem = runtime.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99,
    );
    this.updateSetItem.command = SN_SYNC_COMMANDS.UPDATE_SET_SELECT_UPDATE_SET;

    this.context.subscriptions.push(this.scopeItem, this.updateSetItem);
  }

  public async updateState(state: UpdateSetSelectorState): Promise<void> {
    if (!state.scopes.some((app) => app.scope === state.selectedScope)) {
      state.selectedScope = state.scopes[0].scope;
    }

    this.state = state;
    this.renderStatusBar();
    this.scopeItem.show();
    this.updateSetItem.show();

    await this.persistCurrentSelection();
  }

  public async selectScope(): Promise<void> {
    if (!this.state) {
      void this.runtime.showErrorMessage(
        SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY,
      );
      return;
    }

    const items: ScopeQuickPickItem[] = this.state.scopes.map((app) => ({
      label: app.name,
      description: this.describeScopeSelection(app.scope),
      app,
    }));

    const selected = await this.runtime.showQuickPick(items, {
      placeHolder: SN_SYNC_MESSAGES.UPDATE_SET_SCOPE_PROMPT,
      ignoreFocusOut: true,
    });

    if (!selected) {
      return;
    }

    this.state.selectedScope = selected.app.scope;
    this.renderStatusBar();
    await this.persistCurrentSelection();
  }

  public async selectUpdateSet(): Promise<void> {
    if (!this.state) {
      void this.runtime.showErrorMessage(
        SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_NOT_READY,
      );
      return;
    }

    const currentScopeApp = this.findAppByScope(
      this.state.selectedScope,
    ) as SnScopedApplication;

    const updateSets =
      await this.activationDataService.listInProgressUpdateSets(
        this.context,
        this.state.workspaceFolderUri,
        currentScopeApp.sys_id,
      );

    if (updateSets.length === 0) {
      void this.runtime.showInformationMessage(
        SN_SYNC_MESSAGES.UPDATE_SET_NO_IN_PROGRESS_FOUND,
      );
      return;
    }

    const currentSelection = this.state.selections[currentScopeApp.scope];
    const items: UpdateSetQuickPickItem[] = updateSets.map((updateSet) => ({
      label: updateSet.name,
      description:
        currentSelection?.update_set === updateSet.sys_id
          ? "selected"
          : updateSet.sys_id,
      updateSet,
    }));

    const selected = await this.runtime.showQuickPick(items, {
      placeHolder: `${SN_SYNC_MESSAGES.UPDATE_SET_PROMPT}: ${currentScopeApp.scope}`,
      ignoreFocusOut: true,
    });

    if (!selected) {
      return;
    }

    this.state.selections[currentScopeApp.scope] = {
      application: currentScopeApp.sys_id,
      application_name: currentScopeApp.name,
      update_set: selected.updateSet.sys_id,
      update_set_name: selected.updateSet.name,
    };

    await this.configService.setScopeUpdateSetSelection(
      this.state.workspaceFolderUri,
      currentScopeApp.scope,
      this.state.selections[currentScopeApp.scope],
    );

    this.renderStatusBar();
    await this.persistCurrentSelection();
  }

  public dispose(): void {
    this.scopeItem.dispose();
    this.updateSetItem.dispose();
  }

  private renderStatusBar(): void {
    const state = this.state as UpdateSetSelectorState;

    const selectedApp = this.findAppByScope(
      state.selectedScope,
    ) as SnScopedApplication;
    const selectedScopeLabel = `${selectedApp.name} (${selectedApp.scope})`;
    const selectedScopeSelection = state.selections[state.selectedScope];

    this.scopeItem.text = `$(package) ${SN_SYNC_MESSAGES.UPDATE_SET_SCOPE_SELECTOR_LABEL}: ${selectedScopeLabel}`;

    const updateSetLabel = selectedScopeSelection?.update_set
      ? selectedScopeSelection.update_set_name ||
        selectedScopeSelection.update_set
      : SN_SYNC_MESSAGES.UPDATE_SET_NOT_SELECTED_LABEL;

    this.updateSetItem.text = `$(versions) ${SN_SYNC_MESSAGES.UPDATE_SET_SELECTOR_LABEL}: ${updateSetLabel}`;
  }

  private describeScopeSelection(scope: string): string {
    const state = this.state as UpdateSetSelectorState;

    const selection = state.selections[scope];
    if (!selection || !selection.update_set) {
      return SN_SYNC_MESSAGES.UPDATE_SET_NOT_SELECTED_LABEL;
    }

    return selection.update_set_name || selection.update_set;
  }

  private findAppByScope(scope: string): SnScopedApplication | undefined {
    return this.state?.scopes.find((app) => app.scope === scope);
  }

  private async persistCurrentSelection(): Promise<void> {
    const state = this.state as UpdateSetSelectorState;

    const selectedApp = this.findAppByScope(
      state.selectedScope,
    ) as SnScopedApplication;

    const selectedScopeSelection = state.selections[state.selectedScope];
    await this.configService.setActivationSelection(
      state.workspaceFolderUri,
      selectedApp.sys_id,
      selectedScopeSelection?.update_set ?? "",
      selectedApp.name,
      selectedScopeSelection?.update_set_name ?? "",
    );
  }
}

export async function initializeUpdateSetSelectors(
  context: vscode.ExtensionContext,
  activationDataService: SnUpdateSetDataServiceApi,
  configService: SnSyncConfigService,
  uiController: SnUpdateSetSelectorsUiController,
  runtime: SnUpdateSetSelectorsRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    return;
  }

  try {
    const scopedApps = await activationDataService.listScopedApplications(
      context,
      workspaceFolderUri,
    );
    const availableScopes = [GLOBAL_SCOPED_APP, ...scopedApps];

    const cleanedSelections = await cleanUnavailableScopeSelections(
      context,
      workspaceFolderUri,
      activationDataService,
      configService,
      availableScopes,
    );

    const selectedScope =
      findFirstConfiguredScope(cleanedSelections, availableScopes) ??
      GLOBAL_SCOPED_APP.scope;

    await uiController.updateState({
      workspaceFolderUri,
      scopes: availableScopes,
      selections: cleanedSelections,
      selectedScope,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    const fallbackSelections =
      await configService.getScopeUpdateSetSelections(workspaceFolderUri);
    await uiController.updateState({
      workspaceFolderUri,
      scopes: [GLOBAL_SCOPED_APP],
      selections: {
        global: {
          application: "global",
          application_name: "Global",
          update_set: fallbackSelections.global?.update_set ?? "",
          update_set_name: fallbackSelections.global?.update_set_name ?? "",
        },
      },
      selectedScope: GLOBAL_SCOPED_APP.scope,
    });

    if (errorMessage !== SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED) {
      void runtime.showInformationMessage(
        `${SN_SYNC_MESSAGES.UPDATE_SET_SELECTORS_INIT_FAILED_PREFIX} ${errorMessage}`,
      );
    }
  }
}

export function registerUpdateSetSelectors(
  context: vscode.ExtensionContext,
  activationDataService: SnUpdateSetDataServiceApi = new SnUpdateSetDataService(),
  configService: SnSyncConfigService = new SnSyncConfigService(),
  runtime: SnUpdateSetSelectorsRuntime = defaultRuntime,
): void {
  const uiController = new StatusBarUpdateSetSelectorsController(
    context,
    activationDataService,
    configService,
    runtime,
  );

  const selectScopeDisposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.UPDATE_SET_SELECT_SCOPE,
    () => uiController.selectScope(),
  );

  const selectUpdateSetDisposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.UPDATE_SET_SELECT_UPDATE_SET,
    () => uiController.selectUpdateSet(),
  );

  void initializeUpdateSetSelectors(
    context,
    activationDataService,
    configService,
    uiController,
    runtime,
  );

  context.subscriptions.push(
    selectScopeDisposable,
    selectUpdateSetDisposable,
    new vscode.Disposable(() => uiController.dispose()),
  );
}

async function cleanUnavailableScopeSelections(
  context: vscode.ExtensionContext,
  workspaceFolderUri: vscode.Uri,
  activationDataService: SnUpdateSetDataServiceApi,
  configService: SnSyncConfigService,
  availableScopes: SnScopedApplication[],
): Promise<Record<string, ScopeUpdateSetSelection>> {
  const previousSelections =
    await configService.getScopeUpdateSetSelections(workspaceFolderUri);
  const availableByScope = new Map(
    availableScopes.map((app) => [app.scope, app] as const),
  );
  const cleaned: Record<string, ScopeUpdateSetSelection> = {};

  for (const [scope, selection] of Object.entries(previousSelections)) {
    const app = availableByScope.get(scope);
    if (!app) {
      continue;
    }

    const updateSets = await activationDataService.listInProgressUpdateSets(
      context,
      workspaceFolderUri,
      app.sys_id,
    );
    const isUpdateSetAvailable = updateSets.some(
      (updateSet) => updateSet.sys_id === selection.update_set,
    );

    const selectedUpdateSet = updateSets.find(
      (updateSet) => updateSet.sys_id === selection.update_set,
    );

    cleaned[scope] = {
      application: app.sys_id,
      application_name: app.name,
      update_set: isUpdateSetAvailable ? selection.update_set : "",
      update_set_name:
        isUpdateSetAvailable && selectedUpdateSet ? selectedUpdateSet.name : "",
    };
  }

  await configService.replaceScopeUpdateSetSelections(
    workspaceFolderUri,
    cleaned,
  );
  return cleaned;
}

function findFirstConfiguredScope(
  selections: Record<string, ScopeUpdateSetSelection>,
  availableScopes: SnScopedApplication[],
): string | undefined {
  for (const app of availableScopes) {
    if (selections[app.scope]?.update_set) {
      return app.scope;
    }
  }

  return undefined;
}
