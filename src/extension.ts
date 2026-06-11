import * as vscode from "vscode";
import { registerSnAuthValidateCommand } from "@commands/snAuthValidateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnResetAuthCommand } from "@commands/snResetAuthCommand.js";
import { registerSnOpenActiveInInstanceCommand } from "@commands/snOpenActiveInInstanceCommand.js";
import { registerSnPullBySysIdCommand } from "@commands/snPullBySysIdCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnResetIndexCommand } from "@commands/snResetIndexCommand.js";
import { registerSnPushCommand } from "@commands/snPushCommand.js";
import { registerSnPushCurrentCommand } from "@commands/snPushCurrentCommand.js";
import { registerSnPushModifiedCommand } from "@commands/snPushModifiedCommand.js";
import { registerSnPushReportCommand } from "@commands/snPushReportCommand.js";
import { registerSnRunBackgroundScriptCommand } from "@commands/snRunBackgroundScriptCommand.js";
import { registerSnStatusBar } from "@services/snStatusBarService.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnAuthValidateCommand(context);
  registerSnResetAuthCommand(context);
  registerSnRunBackgroundScriptCommand(context);
  registerSnOpenActiveInInstanceCommand(context);
  registerSnPullCommand(context);
  registerSnPullBySysIdCommand(context);
  registerSnResetIndexCommand(context);
  registerSnPushCommand(context);
  registerSnPushCurrentCommand(context);
  registerSnPushReportCommand(context);
  registerSnPushModifiedCommand(context);
  registerSnStatusBar(context);
}

export function deactivate() {}
