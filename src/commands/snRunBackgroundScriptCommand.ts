import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_ERROR_CODES,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
  getWorkspaceFolderOrShowError,
  runWithCommandStatus,
  showPrefixedCommandError,
} from "@shared/services/snCommandRuntime.js";
import {
  SnBackgroundScriptService,
  type SnBackgroundScriptExecutionContext,
  type SnBackgroundScriptServiceApi,
} from "@services/snBackgroundScriptService.js";

export interface SnRunBackgroundScriptRuntime extends SnBaseCommandRuntime {
  getActiveTextEditor(): vscode.TextEditor | undefined;
  showOpenDialog(
    options: vscode.OpenDialogOptions,
  ): Thenable<vscode.Uri[] | undefined>;
  readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  askConfirmation(message: string, actionLabel: string): Thenable<boolean>;
  getOutputChannel(name: string): vscode.OutputChannel;
}

const OUTPUT_CHANNEL_NAME = "sn-sync background script";

const defaultRuntime: SnRunBackgroundScriptRuntime = {
  ...defaultBaseRuntime,
  getActiveTextEditor: () => vscode.window.activeTextEditor,
  showOpenDialog: (options: vscode.OpenDialogOptions) =>
    vscode.window.showOpenDialog(options),
  readFile: (uri: vscode.Uri) => vscode.workspace.fs.readFile(uri),
  askConfirmation: async (message: string, actionLabel: string) => {
    const selected = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      actionLabel,
    );

    return selected === actionLabel;
  },
  getOutputChannel: (name: string) => vscode.window.createOutputChannel(name),
};

export async function runSnRunBackgroundScriptCommand(
  context: vscode.ExtensionContext,
  backgroundScriptService: SnBackgroundScriptServiceApi,
  runtime: SnRunBackgroundScriptRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = getWorkspaceFolderOrShowError(runtime);
  if (!workspaceFolderUri) {
    return;
  }

  try {
    const scriptUri = await resolveScriptUri(runtime);
    if (!scriptUri) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
      );
      return;
    }

    const scriptContent = await readUtf8File(runtime, scriptUri);
    if (!scriptContent.trim()) {
      void runtime.showErrorMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_EMPTY_FILE,
      );
      return;
    }

    const executionContext = await backgroundScriptService.resolveExecutionContext(
      context,
      workspaceFolderUri,
    );

    const shouldProceed = await runtime.askConfirmation(
      formatConfirmationMessage(executionContext),
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CONFIRM_ACTION,
    );
    if (!shouldProceed) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
      );
      return;
    }

    const result = await backgroundScriptService.runBackgroundScript(
      context,
      workspaceFolderUri,
      scriptContent,
    );

    const output = runtime.getOutputChannel(OUTPUT_CHANNEL_NAME);
    output.appendLine(
      `[${new Date().toISOString()}] ${scriptUri.fsPath} -> ${executionContext.instanceUrl}`,
    );
    for (const line of result.output.split(/\r?\n/)) {
      output.appendLine(line);
    }
    output.appendLine("");
    output.show(true);

    void runtime.showInformationMessage(
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_SUCCESS,
    );
  } catch (error) {
    showPrefixedCommandError(
      runtime,
      SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_FAILED_PREFIX,
      error,
      {
        code: SN_SYNC_ERROR_CODES.RUN_BACKGROUND_SCRIPT_FAILED,
        command: SN_SYNC_COMMANDS.RUN_BACKGROUND_SCRIPT,
      },
    );
  }
}

export function registerSnRunBackgroundScriptCommand(
  context: vscode.ExtensionContext,
  backgroundScriptService: SnBackgroundScriptServiceApi =
    new SnBackgroundScriptService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.RUN_BACKGROUND_SCRIPT,
    () =>
      runWithCommandStatus(
        () =>
          runSnRunBackgroundScriptCommand(
            context,
            backgroundScriptService,
            defaultRuntime,
          ),
        {
          message: "sn-sync: running background script...",
        },
      ),
  );

  context.subscriptions.push(disposable);
}

async function resolveScriptUri(
  runtime: Pick<
    SnRunBackgroundScriptRuntime,
    "getActiveTextEditor" | "showOpenDialog"
  >,
): Promise<vscode.Uri | undefined> {
  const activeUri = runtime.getActiveTextEditor()?.document.uri;
  if (activeUri?.scheme === "file") {
    return activeUri;
  }

  const selected = await runtime.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Run as background script",
  });

  return selected?.[0];
}

async function readUtf8File(
  runtime: Pick<SnRunBackgroundScriptRuntime, "readFile">,
  uri: vscode.Uri,
): Promise<string> {
  const bytes = await runtime.readFile(uri);
  return new TextDecoder("utf-8").decode(bytes);
}

function formatConfirmationMessage(
  executionContext: SnBackgroundScriptExecutionContext,
): string {
  const userText = executionContext.username
    ? ` as ${executionContext.username}`
    : "";

  return `Execute script on ${executionContext.instanceUrl}${userText}?`;
}
