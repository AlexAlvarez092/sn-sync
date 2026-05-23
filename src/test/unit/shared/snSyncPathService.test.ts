import * as assert from "assert";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";
import { getSnSyncPaths } from "@shared/services/snSyncPathService.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snSyncPathService", () => {
  test("builds the expected sn-sync paths", () => {
    const workspaceFolderUri = createTempWorkspaceUri();
    const paths = getSnSyncPaths(workspaceFolderUri);

    assert.strictEqual(
      paths.snSyncFolderUri.path,
      `${workspaceFolderUri.path}/${SN_SYNC_PATHS.ROOT_FOLDER}`,
    );
    assert.strictEqual(
      paths.instanceConfigUri.path,
      `${paths.snSyncFolderUri.path}/${SN_SYNC_PATHS.INSTANCE_CONFIG_FILE}`,
    );
    assert.strictEqual(
      paths.extensionConfigUri.path,
      `${paths.snSyncFolderUri.path}/${SN_SYNC_PATHS.EXTENSION_CONFIG_FILE}`,
    );
  });
});
