import * as vscode from "vscode";
import { registerSnInitCommand } from "@commands/snInitCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
}

export function deactivate() {}
