import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { normalizeInstanceUrl } from "@shared/services/snHttpService.js";

export interface SnOpenCurrentInInstanceRuntime extends SnBaseCommandRuntime {
  getActiveTextEditor(): vscode.TextEditor | undefined;
  openExternal(target: vscode.Uri): Thenable<boolean>;
}

interface SnOpenCurrentInInstanceAuthApi {
  resolveConnectionAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<{ instanceUrl: string }>;
}

export function getDefaultActiveTextEditor(
  windowApi: Pick<typeof vscode.window, "activeTextEditor"> = vscode.window,
): vscode.TextEditor | undefined {
  return windowApi.activeTextEditor;
}

export function openExternalWithDefaultEnv(
  target: vscode.Uri,
  envApi: Pick<typeof vscode.env, "openExternal"> = vscode.env,
): Thenable<boolean> {
  return envApi.openExternal(target);
}

const defaultRuntime: SnOpenCurrentInInstanceRuntime = {
  ...defaultBaseRuntime,
  getActiveTextEditor: getDefaultActiveTextEditor,
  openExternal: openExternalWithDefaultEnv,
};

export async function runSnOpenCurrentInInstanceCommand(
  context: vscode.ExtensionContext,
  authService: SnOpenCurrentInInstanceAuthApi,
  indexService: SnSyncIndexServiceApi,
  runtime: SnOpenCurrentInInstanceRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const activeEditor = runtime.getActiveTextEditor();
  if (!activeEditor) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.OPEN_CURRENT_NO_EDITOR);
    return;
  }

  const localPath = indexService.toWorkspaceRelativePath(
    workspaceFolderUri,
    activeEditor.document.uri,
  );
  const entry = await indexService.findEntryByLocalPath(
    workspaceFolderUri,
    localPath,
  );

  if (!entry) {
    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.OPEN_CURRENT_NOT_INDEXED,
    );
    return;
  }

  try {
    const connection = await authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const recordUri = buildServiceNowRecordUri(
      connection.instanceUrl,
      entry.table,
      entry.sysId,
    );

    const opened = await runtime.openExternal(recordUri);
    if (!opened) {
      throw new Error(SN_SYNC_MESSAGES.OPEN_CURRENT_OPEN_FAILED);
    }

    void runtime.showInformationMessage(
      `${SN_SYNC_MESSAGES.OPEN_CURRENT_SUCCESS_PREFIX} ${entry.table}:${entry.sysId}`,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.OPEN_CURRENT_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.OPEN_CURRENT_IN_INSTANCE_FAILED,
        command: SN_SYNC_COMMANDS.OPEN_CURRENT_IN_INSTANCE,
      },
    );
  }
}

export function registerSnOpenCurrentInInstanceCommand(
  context: vscode.ExtensionContext,
  authService: SnOpenCurrentInInstanceAuthApi = new SnAuthService(),
): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.OPEN_CURRENT_IN_INSTANCE,
    task: () =>
      runSnOpenCurrentInInstanceCommand(
        context,
        authService,
        new SnSyncIndexService(context.workspaceState),
      ),
    message: "sn-sync: opening current record in instance...",
  });
}

function buildServiceNowRecordUri(
  instanceUrl: string,
  table: string,
  sysId: string,
): vscode.Uri {
  const normalizedInstanceUrl = normalizeInstanceUrl(instanceUrl);
  const url = new URL(
    `${normalizedInstanceUrl}/${encodeURIComponent(table)}.do`,
  );
  url.searchParams.set("sys_id", sysId);

  return vscode.Uri.from({
    scheme: url.protocol.replace(":", ""),
    authority: url.host,
    path: url.pathname,
    query: url.searchParams.toString(),
  });
}
