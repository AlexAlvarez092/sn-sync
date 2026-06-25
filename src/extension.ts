import * as vscode from "vscode";
import { registerSnAuthValidateCommand } from "@commands/snAuthValidateCommand.js";
import { registerSnAuthCommand } from "@commands/snAuthCommand.js";
import { registerSnAuthConfigCommand } from "@commands/snAuthConfigCommand.js";
import { registerSnInitCommand } from "@commands/snInitCommand.js";
import { registerSnResetCommand } from "@commands/snResetCommand.js";
import { registerSnResetAuthCommand } from "@commands/snResetAuthCommand.js";
import { registerSnOpenCurrentInInstanceCommand } from "@commands/snOpenCurrentInInstanceCommand.js";
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
import { registerSnHelpCommand } from "@commands/snHelpCommand.js";
import { registerSnStatusBar } from "@services/snStatusBarService.js";
import { createExtensionServices } from "@shared/services/snServiceFactory.js";

export function activate(context: vscode.ExtensionContext) {
  const services = createExtensionServices(context);

  registerSnInitCommand(context, services.configService);
  registerSnAuthCommand(context);
  registerSnAuthConfigCommand(context, services.authService);
  registerSnAuthValidateCommand(context, services.authService);
  registerSnResetCommand(context);
  registerSnResetAuthCommand(context, services.authService);
  registerSnRunBackgroundScriptCommand(
    context,
    services.backgroundScriptService,
  );
  registerSnOpenCurrentInInstanceCommand(context, services.authService);
  registerSnPullCommand(context);
  registerSnPullAllFilesCommand(
    context,
    services.configService,
    services.pullService,
  );
  registerSnPullCurrentCommand(
    context,
    services.configService,
    services.pullService,
  );
  registerSnPullTableCommand(
    context,
    services.configService,
    services.pullService,
  );
  registerSnPullBySysIdCommand(
    context,
    services.configService,
    services.pullService,
  );
  registerSnResetIndexCommand(context, services.indexService);
  registerSnPushCommand(context);
  registerSnPushCurrentCommand(context, services.pushService);
  registerSnPushReportCommand(
    context,
    services.indexService,
    services.pushReportService,
  );
  registerSnPushModifiedCommand(context, services.pushService);
  registerSnHelpCommand(context);
  registerSnStatusBar(context);
}

export function deactivate(): void {
  // nothing to clean up
}
