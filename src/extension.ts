import * as vscode from "vscode";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnPullTableCommand } from "@commands/snPullTableCommand.js";
import { registerSnPushActiveCommand } from "@commands/snPushActiveCommand.js";
import { registerSnPushModifiedCommand } from "@commands/snPushModifiedCommand.js";
import { registerSnValidateAuthCommand } from "@commands/snValidateAuthCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnValidateAuthCommand(context);
  registerSnPullCommand(context);
  registerSnPullTableCommand(context);
  registerSnPushActiveCommand(context);
  registerSnPushModifiedCommand(context);
}

export function deactivate() {}
