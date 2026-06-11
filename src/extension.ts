import * as vscode from "vscode";
import { registerSnAuthValidateCommand } from "@commands/snAuthValidateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnAuthConfigCommand } from "@commands/snAuthConfigCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnResetCommand } from "@commands/snResetCommand.js";
import { registerSnResetAuthCommand } from "@commands/snResetAuthCommand.js";
import { registerSnOpenActiveInInstanceCommand } from "@commands/snOpenActiveInInstanceCommand.js";
import { registerSnPullBySysIdCommand } from "@commands/snPullBySysIdCommand.js";
import { registerSnPullCurrentCommand } from "@commands/snPullCurrentCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnPullTableCommand } from "@commands/snPullTableCommand.js";
import { registerSnPullAllFilesCommand } from "@commands/snPullAllFilesCommand.js";
import { registerSnResetIndexCommand } from "@commands/snResetIndexCommand.js";
import { registerSnPushCommand } from "@commands/snPushCommand.js";
import { registerSnPushCurrentCommand } from "@commands/snPushCurrentCommand.js";
import { registerSnPushModifiedCommand } from "@commands/snPushModifiedCommand.js";
import { registerSnPushReportCommand } from "@commands/snPushReportCommand.js";
import { registerSnRunBackgroundScriptCommand } from "@commands/snRunBackgroundScriptCommand.js";
import { registerSnStatusBar } from "@services/snStatusBarService.js";
import { flushScheduledTempMergeCleanup } from "@shared/services/snPushConflictResolutionService.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnAuthConfigCommand(context);
  registerSnAuthValidateCommand(context);
  registerSnResetCommand(context);
  registerSnResetAuthCommand(context);
  registerSnRunBackgroundScriptCommand(context);
  registerSnOpenActiveInInstanceCommand(context);
  registerSnPullCommand(context);
  registerSnPullAllFilesCommand(context);
  registerSnPullCurrentCommand(context);
  registerSnPullTableCommand(context);
  registerSnPullBySysIdCommand(context);
  registerSnResetIndexCommand(context);
  registerSnPushCommand(context);
  registerSnPushCurrentCommand(context);
  registerSnPushReportCommand(context);
  registerSnPushModifiedCommand(context);
  registerSnStatusBar(context);
}

export async function deactivate(): Promise<void> {
  await flushScheduledTempMergeCleanup();
}
