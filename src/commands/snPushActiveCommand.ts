import * as vscode from "vscode";
import {
  SnPushService,
  type SnPushServiceApi,
} from "@services/snPushService.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import { hashText } from "@shared/services/hashService.js";

export interface SnPushActiveRuntime extends SnBaseCommandRuntime {
  getActiveTextEditor(): vscode.TextEditor | undefined;
}

const defaultRuntime: SnPushActiveRuntime = {
  ...defaultBaseRuntime,
  getActiveTextEditor: () => vscode.window.activeTextEditor,
};

export async function runSnPushActiveCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi,
  indexService: SnSyncIndexServiceApi,
  runtime: SnPushActiveRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  const activeEditor = runtime.getActiveTextEditor();
  if (!activeEditor) {
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.PUSH_ACTIVE_NO_EDITOR);
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
      SN_SYNC_MESSAGES.PUSH_ACTIVE_NOT_INDEXED,
    );
    return;
  }

  try {
    const localContent = activeEditor.document.getText();
    const localHash = hashText(localContent);

    if (localHash === entry.baseHash) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PUSH_ACTIVE_NO_LOCAL_CHANGES,
      );
      return;
    }

    const remoteContent = await pushService.getRemoteFieldContent(
      context,
      workspaceFolderUri,
      entry,
    );
    const remoteHash = hashText(remoteContent);

    if (remoteHash !== entry.baseHash) {
      void runtime.showErrorMessage(
        `${SN_SYNC_MESSAGES.PUSH_ACTIVE_CONFLICT_PREFIX} ${entry.localPath}`,
      );
      return;
    }

    await pushService.pushFieldContent(
      context,
      workspaceFolderUri,
      entry,
      localContent,
    );

    await indexService.updateBaseHashes(workspaceFolderUri, [
      {
        localPath: entry.localPath,
        table: entry.table,
        sysId: entry.sysId,
        fieldName: entry.fieldName,
        baseHash: localHash,
      },
    ]);

    void runtime.showInformationMessage(SN_SYNC_MESSAGES.PUSH_ACTIVE_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.PUSH_ACTIVE_FAILED_PREFIX,
      error,
    );
  }
}

export function registerSnPushActiveCommand(
  context: vscode.ExtensionContext,
  pushService: SnPushServiceApi = new SnPushService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PUSH_ACTIVE,
    () =>
      runSnPushActiveCommand(
        context,
        pushService,
        new SnSyncIndexService(context.workspaceState),
      ),
  );

  context.subscriptions.push(disposable);
}
