import * as vscode from "vscode";
import { registerSnActivateCommand } from "@commands/snActivateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnValidateAuthCommand } from "@commands/snValidateAuthCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnValidateAuthCommand(context);
  registerSnActivateCommand(context);
}

export function deactivate() {}
