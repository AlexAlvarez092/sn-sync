import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import type { FolderClearRuntime } from "@shared/services/snFolderService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnClearSrcRuntime
  extends SnBaseCommandRuntime, FolderClearRuntime {
  showWarningMessage(
    message: string,
    ...items: string[]
  ): Thenable<string | undefined>;
}

export interface SnClearSrcConfigService {
  getPreferences(workspaceFolderUri: vscode.Uri): Promise<{
    rootDir: string;
    pull: { clearBeforePull: "ask" | "delete" | "keep" };
  }>;
}

const defaultRuntime: SnClearSrcRuntime = {
  ...defaultBaseRuntime,
  showWarningMessage: (message: string, ...items: string[]) =>
    vscode.window.showWarningMessage(message, { modal: true }, ...items),
  readDirectory: (uri: vscode.Uri) => vscode.workspace.fs.readDirectory(uri),
  delete: (uri: vscode.Uri, options) =>
    vscode.workspace.fs.delete(uri, options),
};

export async function runSnClearSrcCommand(
  configService: SnClearSrcConfigService = new SnSyncConfigService(),
  runtime: SnClearSrcRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    const preferences = await configService.getPreferences(workspaceFolderUri);

    const confirmation = await runtime.showWarningMessage(
      `This will permanently delete all files and folders inside ${preferences.rootDir}. Continue?`,
      SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION,
    );

    if (confirmation !== SN_SYNC_MESSAGES.CLEAR_SRC_CONFIRM_ACTION) {
      void runtime.showInformationMessage(SN_SYNC_MESSAGES.CLEAR_SRC_CANCELLED);
      return;
    }

    const srcFolderUri = vscode.Uri.joinPath(
      workspaceFolderUri,
      preferences.rootDir,
    );

    let entries: [string, vscode.FileType][];
    try {
      entries = await runtime.readDirectory(srcFolderUri);
    } catch (error) {
      if (getErrorMessage(error).includes("FileNotFound")) {
        void runtime.showInformationMessage(
          `Folder ${preferences.rootDir} not found. Nothing to clear.`,
        );
        return;
      }

      throw error;
    }

    for (const [entryName] of entries) {
      await runtime.delete(vscode.Uri.joinPath(srcFolderUri, entryName), {
        recursive: true,
        useTrash: false,
      });
    }

    void runtime.showInformationMessage(
      `Folder ${preferences.rootDir} cleared.`,
    );
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.CLEAR_SRC_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnClearSrcCommand(
  context: vscode.ExtensionContext,
  configService: SnClearSrcConfigService = new SnSyncConfigService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.CLEAR_SRC,
    () => runSnClearSrcCommand(configService),
  );

  context.subscriptions.push(disposable);
}
