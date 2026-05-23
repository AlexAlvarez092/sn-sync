import * as vscode from "vscode";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnClearSrcCommand } from "@commands/snClearSrcCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnPullCommand } from "@commands/snPullCommand.js";
import { registerSnPullTableCommand } from "@commands/snPullTableCommand.js";
import { registerSnUpdateSetResetCommand } from "@commands/snUpdateSetResetCommand.js";
import { registerUpdateSetSelectors } from "@commands/snUpdateSetSelectorsCommand.js";
import { registerSnValidateAuthCommand } from "@commands/snValidateAuthCommand.js";

export function activate(context: vscode.ExtensionContext) {
  registerSnInitCommand(context);
  registerSnAuthCommand(context);
  registerSnValidateAuthCommand(context);
  registerUpdateSetSelectors(context);
  registerSnUpdateSetResetCommand(context);
  registerSnPullCommand(context);
  registerSnPullTableCommand(context);
  registerSnClearSrcCommand(context);
}

export function deactivate() {}
