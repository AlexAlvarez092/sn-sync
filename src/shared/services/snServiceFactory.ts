import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import { SnBackgroundScriptService } from "@services/snBackgroundScriptService.js";
import { SnPullService } from "@services/snPullService.js";
import { SnPushReportService } from "@services/snPushReportService.js";
import { SnPushService } from "@services/snPushService.js";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import { SnSyncIndexService } from "@services/snSyncIndexService.js";

export interface SnExtensionServices {
  configService: SnSyncConfigService;
  indexService: SnSyncIndexService;
  authService: SnAuthService;
  pullService: SnPullService;
  pushService: SnPushService;
  pushReportService: SnPushReportService;
  backgroundScriptService: SnBackgroundScriptService;
}

export function createExtensionServices(
  context: vscode.ExtensionContext,
): SnExtensionServices {
  const configService = new SnSyncConfigService();
  const indexService = new SnSyncIndexService(context.workspaceState);
  const authService = new SnAuthService();
  const pullService = new SnPullService(authService);
  const pushService = new SnPushService(authService);
  const pushReportService = new SnPushReportService(authService);
  const backgroundScriptService = new SnBackgroundScriptService(authService);

  return {
    configService,
    indexService,
    authService,
    pullService,
    pushService,
    pushReportService,
    backgroundScriptService,
  };
}