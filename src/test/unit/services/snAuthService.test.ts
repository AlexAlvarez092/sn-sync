import * as assert from "assert";
import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import { SN_SYNC_SECRET_KEYS } from "@shared/constants/snSyncConstants.js";
import type { SnAuthInput } from "@shared/models/auth.js";

suite("snAuthService", () => {
  test("stores instance name in config service and credentials in secret storage", async () => {
    const authInput: SnAuthInput = {
      instanceName: "dev1",
      instanceUrl: "https://dev1.service-now.com",
      username: "admin",
      password: "secret",
    };
    const workspaceFolderUri = vscode.Uri.file("/tmp/workspace");
    let savedInstanceName: string | undefined;
    let savedWorkspaceUri: vscode.Uri | undefined;
    let storedSecretKey: string | undefined;
    let storedSecretValue: string | undefined;

    const configService = {
      setInstanceName: async (
        currentWorkspaceUri: vscode.Uri,
        instanceName: string,
      ): Promise<void> => {
        savedWorkspaceUri = currentWorkspaceUri;
        savedInstanceName = instanceName;
      },
    };
    const context = {
      secrets: {
        store: async (key: string, value: string): Promise<void> => {
          storedSecretKey = key;
          storedSecretValue = value;
        },
      },
    } as unknown as vscode.ExtensionContext;

    const service = new SnAuthService(configService as unknown as never);

    await service.saveAuth(context, workspaceFolderUri, authInput);

    assert.strictEqual(
      savedWorkspaceUri?.toString(),
      workspaceFolderUri.toString(),
    );
    assert.strictEqual(savedInstanceName, authInput.instanceName);
    assert.strictEqual(
      storedSecretKey,
      `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:${authInput.instanceName}`,
    );
    assert.deepStrictEqual(JSON.parse(storedSecretValue ?? "{}"), {
      instanceUrl: authInput.instanceUrl,
      username: authInput.username,
      password: authInput.password,
    });
  });
});
