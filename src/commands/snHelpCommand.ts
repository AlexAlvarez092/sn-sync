import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  registerCommandWithStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";

const DOCS_URL = "https://alexalvarez092.github.io/sn-sync/";

export interface SnHelpRuntime extends SnBaseCommandRuntime {
  openExternal(target: vscode.Uri): Thenable<boolean>;
}

const defaultRuntime: SnHelpRuntime = {
  ...defaultBaseRuntime,
  openExternal: (target: vscode.Uri) => vscode.env.openExternal(target),
};

export async function runSnHelpCommand(
  runtime: SnHelpRuntime = defaultRuntime,
): Promise<void> {
  try {
    const uri = vscode.Uri.parse(DOCS_URL);
    const opened = await runtime.openExternal(uri);
    if (!opened) {
      throw new Error(SN_SYNC_MESSAGES.HELP_OPEN_FAILED);
    }
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.HELP_SUCCESS);
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.HELP_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.HELP_FAILED,
        command: SN_SYNC_COMMANDS.HELP,
      },
    );
  }
}

export function registerSnHelpCommand(context: vscode.ExtensionContext): void {
  registerCommandWithStatus({
    context,
    commandId: SN_SYNC_COMMANDS.HELP,
    task: () => runSnHelpCommand(),
    message: "sn-sync: opening documentation...",
  });
}
