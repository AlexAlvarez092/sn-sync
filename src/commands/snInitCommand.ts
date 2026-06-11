import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_INPUTS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";

export interface SnSyncInitializer {
  initialize(workspaceFolderUri: vscode.Uri): Promise<void>;
  setInstanceName(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): Promise<void>;
}

export interface SnInitCommandRuntime extends SnBaseCommandRuntime {
  askInput(options: vscode.InputBoxOptions): Thenable<string | undefined>;
}

const defaultRuntime: SnInitCommandRuntime = {
  ...defaultBaseRuntime,
  askInput: (options: vscode.InputBoxOptions) =>
    vscode.window.showInputBox(options),
};

export async function runSnInitCommand(
  configService: SnSyncInitializer,
  runtime: SnInitCommandRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    await configService.initialize(workspaceFolderUri);

    const instanceName = await askRequiredInput(runtime, {
      prompt: SN_SYNC_INPUTS.AUTH_INSTANCE_NAME_PROMPT,
      placeHolder: SN_SYNC_INPUTS.AUTH_INSTANCE_NAME_PLACEHOLDER,
      ignoreFocusOut: true,
    });

    if (!instanceName) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.INIT_INSTANCE_SKIPPED,
      );
      return;
    }

    await configService.setInstanceName(workspaceFolderUri, instanceName);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.INIT_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.INIT_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.INIT_FAILED,
        command: SN_SYNC_COMMANDS.INIT,
      },
    );
  }
}

export function registerSnInitCommand(
  context: vscode.ExtensionContext,
  configService: SnSyncInitializer = new SnSyncConfigService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.INIT,
    task: () => runSnInitCommand(configService),
    message: "sn-sync: initializing workspace...",
  });
}

async function askRequiredInput(
  runtime: SnInitCommandRuntime,
  options: vscode.InputBoxOptions,
): Promise<string | undefined> {
  const value = await runtime.askInput(options);
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}
