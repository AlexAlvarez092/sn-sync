import * as vscode from "vscode";
import {
  SN_SYNC_COMMANDS,
  SN_SYNC_MESSAGES,
} from "@shared/constants/snSyncConstants.js";
import {
  type SnBaseCommandRuntime,
  defaultBaseRuntime,
} from "@shared/services/snCommandRuntime.js";
import {
  SnSyncIndexService,
  type SnSyncIndexServiceApi,
} from "@services/snSyncIndexService.js";
import {
  SnPushReportService,
  type SnPushReportData,
  type SnPushReportServiceApi,
} from "@services/snPushReportService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";

export interface SnPushReportRuntime extends SnBaseCommandRuntime {
  withProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
    ) => Thenable<T>,
  ): Thenable<T>;
  openMarkdownReport(content: string): Thenable<void>;
}

const defaultRuntime: SnPushReportRuntime = {
  ...defaultBaseRuntime,
  withProgress: (title, task) =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      task,
    ),
  openMarkdownReport: async (content: string) => {
    const document = await vscode.workspace.openTextDocument({
      language: "markdown",
      content,
    });
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
    });
  },
};

export async function runSnPushReportCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi,
  reportService: SnPushReportServiceApi,
  runtime: SnPushReportRuntime = defaultRuntime,
): Promise<void> {
  const workspaceFolderUri = runtime.getWorkspaceFolderUri();

  if (!workspaceFolderUri) {
    void runtime.showErrorMessage(SN_SYNC_MESSAGES.NO_WORKSPACE);
    return;
  }

  try {
    const candidates =
      await indexService.getModifiedCandidates(workspaceFolderUri);

    if (candidates.length === 0) {
      void runtime.showInformationMessage(
        SN_SYNC_MESSAGES.PUSH_REPORT_NO_LOCAL_CHANGES,
      );
      return;
    }

    const report = await runtime.withProgress(
      SN_SYNC_MESSAGES.PUSH_REPORT_TITLE,
      async (progress) => {
        progress.report({
          message: `Analyzing ${candidates.length} modified files...`,
        });

        return reportService.buildPushReport(
          context,
          workspaceFolderUri,
          candidates,
          {
            onProgress: ({ processed, total, localPath }) => {
              progress.report({
                increment: 100 / total,
                message: `Resolving ${processed}/${total}: ${localPath}`,
              });
            },
          },
        );
      },
    );

    await runtime.openMarkdownReport(formatPushReport(report));
    void runtime.showInformationMessage(SN_SYNC_MESSAGES.PUSH_REPORT_SUCCESS);
  } catch (error) {
    void runtime.showErrorMessage(
      `${SN_SYNC_MESSAGES.PUSH_REPORT_FAILED_PREFIX} ${getErrorMessage(error)}`,
    );
  }
}

export function registerSnPushReportCommand(
  context: vscode.ExtensionContext,
  indexService: SnSyncIndexServiceApi = new SnSyncIndexService(
    context.workspaceState,
  ),
  reportService: SnPushReportServiceApi = new SnPushReportService(),
): void {
  const disposable = vscode.commands.registerCommand(
    SN_SYNC_COMMANDS.PUSH_REPORT,
    () => runSnPushReportCommand(context, indexService, reportService),
  );

  context.subscriptions.push(disposable);
}

function formatPushReport(report: SnPushReportData): string {
  const lines: string[] = [];

  lines.push("# sn-sync push report");
  lines.push("");
  lines.push(
    `Modified files detected: ${report.files.length}. Grouped by scope and current in-progress update set for your user.`,
  );
  lines.push("");
  lines.push("## Scope summary");
  lines.push("");
  lines.push("| Scope | Files | Update set |");
  lines.push("| --- | ---: | --- |");

  for (const scope of report.scopes) {
    lines.push(
      `| ${escapePipes(scope.scopeName)} | ${scope.files} | ${formatUpdateSet(scope.updateSetName, scope.updateSetId)} |`,
    );
  }

  lines.push("");
  lines.push("## Files to push");
  lines.push("");
  lines.push("| File | Table | Field | Scope | Update set | Note |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const file of report.files) {
    lines.push(
      `| ${escapePipes(file.localPath)} | ${escapePipes(file.table)} | ${escapePipes(file.fieldName)} | ${escapePipes(file.scopeName)} | ${formatUpdateSet(file.updateSetName, file.updateSetId)} | ${file.resolutionNote ? escapePipes(file.resolutionNote) : ""} |`,
    );
  }

  lines.push("");

  return lines.join("\n");
}

function formatUpdateSet(
  updateSetName: string | undefined,
  updateSetId: string | undefined,
): string {
  if (!updateSetId) {
    return "(none found)";
  }

  if (!updateSetName) {
    return escapePipes(updateSetId);
  }

  return `${escapePipes(updateSetName)} (${escapePipes(updateSetId)})`;
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}
