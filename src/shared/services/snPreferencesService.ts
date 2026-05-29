import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import { SN_SYNC_DEFAULTS } from "@shared/constants/snSyncConstants.js";
import type { SnSyncResolvedPreferences } from "@shared/models/config.js";

export async function resolvePreferences(
  configService: SnSyncConfigService,
  workspaceFolderUri: vscode.Uri,
): Promise<SnSyncResolvedPreferences> {
  if (typeof configService.getPreferences === "function") {
    return configService.getPreferences(workspaceFolderUri);
  }

  return {
    rootDir: SN_SYNC_DEFAULTS.ROOT_DIR,
    pull: {
      clearBeforePull: SN_SYNC_DEFAULTS.CLEAR_BEFORE_PULL,
    },
    auth: {
      allowCustomHosts: SN_SYNC_DEFAULTS.AUTH_ALLOW_CUSTOM_HOSTS,
      customHosts: SN_SYNC_DEFAULTS.AUTH_CUSTOM_HOSTS,
    },
  };
}
