import * as assert from "assert";
import { SN_SYNC_PATHS } from "@shared/constants/snSyncConstants.js";
import { getSnSyncPaths } from "@shared/services/snSyncPathService.js";
import { createTempWorkspaceUri } from "@test/helpers/testRuntime.js";

suite("snSyncPathService", () => {
  test("builds the expected sn-sync rc path", () => {
    const workspaceFolderUri = createTempWorkspaceUri();
    const paths = getSnSyncPaths(workspaceFolderUri);

    assert.strictEqual(
      paths.rcConfigUri.path,
      `${workspaceFolderUri.path}/${SN_SYNC_PATHS.RC_FILE}`,
    );
  });
});
