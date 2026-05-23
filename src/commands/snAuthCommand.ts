import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import type { SnAuthInput } from "@shared/models/auth.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

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
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
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
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.AUTH_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthService = new SnAuthService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.AUTH,
    () => runSnAuthCommand(context, authService),
  );

  context.subscriptions.push(disposable);
}

async function collectAuthInput(
  runtime: SnAuthRuntime,
): Promise<SnAuthInput | undefined> {
  const instanceName = await askRequiredInput(runtime, {
    prompt: "Instance name",
    placeHolder: "my-dev-instance",
    ignoreFocusOut: true,
  });
  if (!instanceName) {
    return undefined;
  }

  const instanceUrl = await askRequiredInput(runtime, {
    prompt: "Instance URL",
    placeHolder: "https://my-dev-instance.service-now.com",
    ignoreFocusOut: true,
  });
  if (!instanceUrl) {
    return undefined;
  }

  const username = await askRequiredInput(runtime, {
    prompt: "Username",
    placeHolder: "admin",
    ignoreFocusOut: true,
  });
  if (!username) {
    return undefined;
  }

  const password = await askRequiredInput(runtime, {
    prompt: "Password",
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
