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
}

const BG_SCRIPT_PANEL_VIEW_TYPE = "sn-sync.backgroundScriptResult";
let backgroundScriptResultPanel: vscode.WebviewPanel | undefined;

const defaultRuntime: SnRunBackgroundScriptRuntime = {
  ...defaultBaseRuntime,
  getActiveTextEditor: () => vscode.window.activeTextEditor,
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
    const editor = runtime.getActiveTextEditor();
    if (!editor) {
      void runtime.showErrorMessage(SN_SYNC_MESSAGES.OPEN_ACTIVE_NO_EDITOR);
      return;
    }

    const allowedLanguages = new Set(["javascript", "typescript"]);
    if (!allowedLanguages.has(editor.document.languageId)) {
      void runtime.showErrorMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_INVALID_LANGUAGE,
      );
      return;
    }

    const scriptContent = resolveScriptContent(editor);
    if (!scriptContent.trim()) {
      void runtime.showErrorMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_EMPTY_FILE,
      );
      return;
    }

    const executionContext =
      await backgroundScriptService.resolveExecutionContext(
        context,
        workspaceFolderUri,
      );

    const scopeId = await promptExecutionScope();
    if (!scopeId) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_CANCELLED,
      );
      return;
    }

    const result = await backgroundScriptService.runBackgroundScript(
      context,
      workspaceFolderUri,
      scriptContent,
      scopeId,
    );

    showResultInNewTab(result.rawResponse, executionContext.instanceUrl);

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
  backgroundScriptService: SnBackgroundScriptServiceApi = new SnBackgroundScriptService(),
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

function showResultInNewTab(rawHtml: string, instanceUrl: string): void {
  if (backgroundScriptResultPanel) {
    backgroundScriptResultPanel.dispose();
  }

  const panel = vscode.window.createWebviewPanel(
    BG_SCRIPT_PANEL_VIEW_TYPE,
    SN_SYNC_MESSAGES.RUN_BACKGROUND_SCRIPT_PANEL_TITLE,
    vscode.ViewColumn.Two,
    {
      enableScripts: false,
      retainContextWhenHidden: true,
    },
  );

  // Match ikosak behavior: make relative href links absolute to the instance URL.
  const normalizedBase = instanceUrl.replace(/\/+$/, "");
  const htmlWithAbsoluteLinks = rawHtml
    .replace(
      /\shref='(?!https?:\/\/|\/)([^']*)'/gi,
      ` href='${normalizedBase}/$1'`,
    )
    .replace(
      /\shref="(?!https?:\/\/|\/)([^"]*)"/gi,
      ` href="${normalizedBase}/$1"`,
    )
    .replace(/\shref='\/([^']*)'/gi, ` href='${normalizedBase}/$1'`)
    .replace(/\shref="\/([^"]*)"/gi, ` href="${normalizedBase}/$1"`)
    .replace(
      /\ssrc='(?!https?:\/\/|\/)([^']*)'/gi,
      ` src='${normalizedBase}/$1'`,
    )
    .replace(
      /\ssrc="(?!https?:\/\/|\/)([^"]*)"/gi,
      ` src="${normalizedBase}/$1"`,
    )
    .replace(/\ssrc='\/([^']*)'/gi, ` src='${normalizedBase}/$1'`)
    .replace(/\ssrc="\/([^"]*)"/gi, ` src="${normalizedBase}/$1"`)
    .replace(
      /\saction='(?!https?:\/\/|\/)([^']*)'/gi,
      ` action='${normalizedBase}/$1'`,
    )
    .replace(
      /\saction="(?!https?:\/\/|\/)([^"]*)"/gi,
      ` action="${normalizedBase}/$1"`,
    )
    .replace(/\saction='\/([^']*)'/gi, ` action='${normalizedBase}/$1'`)
    .replace(/\saction="\/([^"]*)"/gi, ` action="${normalizedBase}/$1"`);

  panel.webview.html = htmlWithAbsoluteLinks;
  backgroundScriptResultPanel = panel;
  panel.onDidDispose(() => {
    if (backgroundScriptResultPanel === panel) {
      backgroundScriptResultPanel = undefined;
    }
  });
}

function resolveScriptContent(editor: vscode.TextEditor): string {
  const selectedScript = editor.document.getText(editor.selection);
  if (selectedScript.trim()) {
    return selectedScript;
  }
  return editor.document.getText();
}

async function promptExecutionScope(): Promise<string | undefined> {
  const mode = await vscode.window.showQuickPick(
    [
      { label: "Global", value: "global" },
      { label: "Custom", value: "custom" },
    ],
    {
      title: SN_SYNC_INPUTS.RUN_BACKGROUND_SCOPE_TITLE,
      placeHolder: SN_SYNC_INPUTS.RUN_BACKGROUND_SCOPE_PLACEHOLDER,
      canPickMany: false,
    },
  );

  if (!mode) {
    return undefined;
  }

  if (mode.value === "global") {
    return "global";
  }

  const customScope = await vscode.window.showInputBox({
    title: SN_SYNC_INPUTS.RUN_BACKGROUND_CUSTOM_SCOPE_TITLE,
    placeHolder: SN_SYNC_INPUTS.RUN_BACKGROUND_CUSTOM_SCOPE_PLACEHOLDER,
    prompt: SN_SYNC_INPUTS.RUN_BACKGROUND_CUSTOM_SCOPE_PROMPT,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return value.trim().length > 0
        ? undefined
        : SN_SYNC_INPUTS.RUN_BACKGROUND_CUSTOM_SCOPE_REQUIRED;
    },
  });

  const normalized = customScope?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}
