import * as vscode from "vscode";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
}

export function deactivate() {}
