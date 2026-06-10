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
import type {
  SnAuthInput,
  SnAuthType,
  SnBasicAuthInput,
  SnOAuthAuthInput,
} from "@shared/models/auth.js";

interface SnAuthMethodChoice extends vscode.QuickPickItem {
  authType: SnAuthType;
}

export interface SnOAuthStartResult {
  authorizationUrl: string;
  codeVerifier: string;
}

export interface SnAuthCommandServiceApi {
  saveAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    authInput: SnAuthInput,
  ): Promise<void>;
  beginOAuthSignIn(
    workspaceFolderUri: vscode.Uri,
    instanceUrl: string,
    clientId: string,
  ): Promise<SnOAuthStartResult>;
}

export interface SnAuthRuntime extends SnBaseCommandRuntime {
  askInput(options: vscode.InputBoxOptions): Thenable<string | undefined>;
  askChoice(
    items: readonly SnAuthMethodChoice[],
    options: vscode.QuickPickOptions,
  ): Thenable<SnAuthMethodChoice | undefined>;
  openExternal(uri: vscode.Uri): Thenable<boolean>;
}

const defaultRuntime: SnAuthRuntime = {
  ...defaultBaseRuntime,
  askInput: (options: vscode.InputBoxOptions) =>
    vscode.window.showInputBox(options),
  askChoice: (
    items: readonly SnAuthMethodChoice[],
    options: vscode.QuickPickOptions,
  ) => vscode.window.showQuickPick(items, options),
  openExternal: (uri: vscode.Uri) => vscode.env.openExternal(uri),
};

export async function runSnAuthCommand(
  context: vscode.ExtensionContext,
  authService: SnAuthCommandServiceApi,
  runtime: SnAuthRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const authInput = await collectAuthInput(
    authService,
    runtime,
    workspaceFolderUri,
  );
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
  authService: SnAuthCommandServiceApi = new SnAuthService(),
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
  authService: SnAuthCommandServiceApi,
  runtime: SnAuthRuntime,
  workspaceFolderUri: vscode.Uri,
): Promise<SnAuthInput | undefined> {
  const authMethod = await askAuthMethod(runtime);
  if (!authMethod) {
    return undefined;
  }

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

  if (authMethod.authType === "oauth") {
    return collectOAuthAuthInput(
      authService,
      runtime,
      workspaceFolderUri,
      instanceName,
      instanceUrl,
    );
  }

  return collectBasicAuthInput(runtime, instanceName, instanceUrl);
}

async function collectBasicAuthInput(
  runtime: SnAuthRuntime,
  instanceName: string,
  instanceUrl: string,
): Promise<SnBasicAuthInput | undefined> {
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
    authType: "basic",
    instanceName,
    instanceUrl,
    username,
    password,
  };
}

async function collectOAuthAuthInput(
  authService: SnAuthCommandServiceApi,
  runtime: SnAuthRuntime,
  workspaceFolderUri: vscode.Uri,
  instanceName: string,
  instanceUrl: string,
): Promise<SnOAuthAuthInput | undefined> {
  const clientId = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_OAUTH_CLIENT_ID_PROMPT,
    placeHolder: SN_SYNC_INPUTS.AUTH_OAUTH_CLIENT_ID_PLACEHOLDER,
    ignoreFocusOut: true,
  });
  if (!clientId) {
    return undefined;
  }

  const oauthStart = await authService.beginOAuthSignIn(
    workspaceFolderUri,
    instanceUrl,
    clientId,
  );
  void runtime.showInformationMessage(SN_SYNC_MESSAGES.AUTH_OAUTH_OPEN_BROWSER_INFO);
  await runtime.openExternal(vscode.Uri.parse(oauthStart.authorizationUrl));

  const authorizationCode = await askRequiredInput(runtime, {
    prompt: SN_SYNC_INPUTS.AUTH_OAUTH_CODE_PROMPT,
    placeHolder: SN_SYNC_INPUTS.AUTH_OAUTH_CODE_PLACEHOLDER,
    password: true,
    ignoreFocusOut: true,
  });
  if (!authorizationCode) {
    return undefined;
  }

  return {
    authType: "oauth",
    instanceName,
    instanceUrl,
    clientId,
    authorizationCode,
    codeVerifier: oauthStart.codeVerifier,
  };
}

async function askAuthMethod(
  runtime: SnAuthRuntime,
): Promise<SnAuthMethodChoice | undefined> {
  return runtime.askChoice(
    [
      {
        label: SN_SYNC_INPUTS.AUTH_METHOD_BASIC_LABEL,
        authType: "basic",
      },
      {
        label: SN_SYNC_INPUTS.AUTH_METHOD_OAUTH_LABEL,
        authType: "oauth",
      },
    ],
    {
      title: SN_SYNC_INPUTS.AUTH_METHOD_PROMPT,
      placeHolder: SN_SYNC_INPUTS.AUTH_METHOD_PROMPT,
      ignoreFocusOut: true,
    },
  );
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
