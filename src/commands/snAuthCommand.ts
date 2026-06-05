import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
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
  runWithCommandStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import type { SnAuthInput } from "@shared/models/auth.js";

export interface SnAuthRuntime extends SnBaseCommandRuntime {
  askInput(options: vscode.InputBoxOptions): Thenable<string | undefined>;
}

const defaultRuntime: SnAuthRuntime = {
  ...defaultBaseRuntime,
  askInput: (options: vscode.InputBoxOptions) =>
    vscode.window.showInputBox(options),
};

export async function runSnAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthService,
  runtime: SnAuthRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const authInput = await collectAuthInput(runtime);
  if (!authInput) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_CANCELLED);
    return;
  }

  try {
    await authService.saveAuth(context, workspaceFolderUri, authInput);
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.AUTH_FAILED,
        command: SN_SYNC_COMMANDS.AUTH,
      },
    );
  }
}

export function registerSnAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthService = new SnAuthService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.AUTH,
    () =>
      runWithCommandStatus(() => runSnAuthCommand(context, authService), {
        message: "sn-sync: saving auth...",
      }),
  );

  context.subscriptions.push(disposable);
}

async function collectAuthInput(
  runtime: SnAuthRuntime,
): Promise<SnAuthInput | undefined> {
  const instanceName = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_INSTANCE_NAME_PROMPT,
    placeHolder: SN_SYNC_INPUTS.AUTH_INSTANCE_NAME_PLACEHOLDER,
    ignoreFocusOut: true,
  });
  if (!instanceName) {
    return undefined;
  }

  const instanceUrl = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_INSTANCE_URL_PROMPT,
    placeHolder: SN_SYNC_INPUTS.AUTH_INSTANCE_URL_PLACEHOLDER,
    ignoreFocusOut: true,
  });
  if (!instanceUrl) {
    return undefined;
  }

  const username = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_USERNAME_PROMPT,
    placeHolder: SN_SYNC_INPUTS.AUTH_USERNAME_PLACEHOLDER,
    ignoreFocusOut: true,
  });
  if (!username) {
    return undefined;
  }

  const password = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_PASSWORD_PROMPT,
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) {
    return undefined;
  }

  return {
    instanceName,
    instanceUrl,
    username,
    password,
  };
}

async function askRequiredInput(
  runtime: SnAuthRuntime,
  options: vscode.InputBoxOptions,
): Promise<string | undefined> {
  const value = await runtime.askInput(options);
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}
