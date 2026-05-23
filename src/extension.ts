import * as vscode from "vscode";
import { registerSnActivateCommand } from "@commands/snActivateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnClearSrcCommand } from "@commands/snClearSrcCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnResetSelectionsCommand } from "@commands/snResetSelectionsCommand.js";
import { registerSnValidateAuthCommand } from "@commands/snValidateAuthCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnValidateAuthCommand(context);
  registerSnActivateCommand(context);
  registerSnResetSelectionsCommand(context);
  registerSnPullCommand(context);
  registerSnClearSrcCommand(context);
}

export function deactivate() {}
