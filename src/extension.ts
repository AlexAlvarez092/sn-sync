import * as vscode from "vscode";
import { registerSnAuthValidateCommand } from "@commands/snAuthValidateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnPullBySysIdCommand } from "@commands/snPullBySysIdCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnResetIndexCommand } from "@commands/snResetIndexCommand.js";
import { registerSnPushActiveCommand } from "@commands/snPushActiveCommand.js";
import { registerSnPushModifiedCommand } from "@commands/snPushModifiedCommand.js";
import { registerSnPushReportCommand } from "@commands/snPushReportCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnAuthValidateCommand(context);
  registerSnPullCommand(context);
  registerSnPullBySysIdCommand(context);
  registerSnResetIndexCommand(context);
  registerSnPushActiveCommand(context);
  registerSnPushReportCommand(context);
  registerSnPushModifiedCommand(context);
}

export function deactivate() {}
