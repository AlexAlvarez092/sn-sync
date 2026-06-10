import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { SnSyncConfigService } from "@services/snSyncConfigService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SECRET_KEYS,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import type {
  SavedSnAuth,
  SnAuthInput,
  SnAuthSecret,
  SnBasicAuthSecret,
  SnOAuthAuthSecret,
} from "@shared/models/auth.js";
import {
  buildBasicAuthHeader,
  createGotFetchTransport,
  normalizeInstanceUrl,
} from "@shared/services/snHttpService.js";
import { getErrorMessage } from "@shared/services/errorMessageService.js";
import { resolvePreferences } from "@shared/services/snPreferencesService.js";
import { normalizeAndValidateInstanceUrl } from "@shared/services/snInstanceUrlPolicyService.js";

export interface SnServiceNowConnectionAuth {
  authType: "basic" | "oauth";
  instanceUrl: string;
  headers: Record<string, string>;
  username?: string;
}

interface SnAuthRequestOptions {
  method: "GET";
  headers: Record<string, string>;
  timeout: {
    request: number;
  };
}

interface SnAuthResponse {
  statusCode: number;
  statusMessage?: string;
}

interface SnOAuthTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

type SnAuthRequestApi = (
  url: string,
  options: SnAuthRequestOptions,
) => Promise<SnAuthResponse>;

export class SnAuthService {
  private readonly fetchApi = createGotFetchTransport();
  private readonly requestApi: SnAuthRequestApi;

  public constructor(
    private readonly configService: SnSyncConfigService = new SnSyncConfigService(),
    requestApi?: SnAuthRequestApi,
  ) {
    this.requestApi = requestApi ?? this.requestWithGot.bind(this);
  }

  public async beginOAuthSignIn(
    workspaceFolderUri: vscode.Uri,
    instanceUrl: string,
    clientId: string,
  ): Promise<{
    authorizationUrl: string;
    codeVerifier: string;
  }> {
    const normalizedInstanceUrl = await this.resolveValidatedInstanceUrl(
      workspaceFolderUri,
      instanceUrl,
    );
    const normalizedClientId = clientId.trim();

    const codeVerifier = this.createPkceCodeVerifier();
    const codeChallenge = this.createPkceCodeChallenge(codeVerifier);

    const queryParams = new URLSearchParams({
      response_type: "code",
      client_id: normalizedClientId,
      redirect_uri: SN_SYNC_SERVICENOW.OAUTH_REDIRECT_PATH,
      scope: SN_SYNC_SERVICENOW.OAUTH_DEFAULT_SCOPE,
      state: this.createRandomToken(24),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return {
      authorizationUrl: `${normalizeInstanceUrl(normalizedInstanceUrl)}${SN_SYNC_SERVICENOW.OAUTH_AUTHORIZE_PATH}?${queryParams.toString()}`,
      codeVerifier,
    };
  }

  public async saveAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    authInput: SnAuthInput,
  ): Promise<void> {
    const instanceUrl = await this.resolveValidatedInstanceUrl(
      workspaceFolderUri,
      authInput.instanceUrl,
    );

    await this.configService.setInstanceName(
      workspaceFolderUri,
      authInput.instanceName,
    );

    const secretKey = this.getSecretKey(
      workspaceFolderUri,
      authInput.instanceName,
    );

    if (authInput.authType === "basic") {
      const secretValue: SnBasicAuthSecret = {
        authType: "basic",
        instanceUrl,
        username: authInput.username,
        password: authInput.password,
      };

      await context.secrets.store(secretKey, JSON.stringify(secretValue));
      return;
    }

    const oauthToken = await this.exchangeOAuthAuthorizationCode({
      instanceUrl,
      clientId: authInput.clientId,
      authorizationCode: authInput.authorizationCode,
      codeVerifier: authInput.codeVerifier,
    });

    const secretValue: SnOAuthAuthSecret = {
      authType: "oauth",
      instanceUrl,
      clientId: authInput.clientId.trim(),
      accessToken: oauthToken.accessToken,
      tokenType: oauthToken.tokenType,
      ...(oauthToken.refreshToken ? { refreshToken: oauthToken.refreshToken } : {}),
      ...(oauthToken.expiresAt ? { expiresAt: oauthToken.expiresAt } : {}),
      ...(oauthToken.scope ? { scope: oauthToken.scope } : {}),
    };

    await context.secrets.store(secretKey, JSON.stringify(secretValue));
  }

  public async getSavedAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SavedSnAuth | undefined> {
    const instanceName =
      await this.configService.getInstanceName(workspaceFolderUri);

    if (!instanceName) {
      return undefined;
    }

    const secretKey = this.getSecretKey(workspaceFolderUri, instanceName);
    const rawSecret = await context.secrets.get(secretKey);

    if (!rawSecret) {
      return undefined;
    }

    try {
      const parsedSecret = JSON.parse(rawSecret) as unknown;

      if (!this.isSnAuthSecret(parsedSecret)) {
        return undefined;
      }

      return {
        instanceName,
        ...parsedSecret,
      };
    } catch {
      return undefined;
    }
  }

  public async validateAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    const connection = await this.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );

    const normalizedUrl = normalizeInstanceUrl(connection.instanceUrl);
    const validationUrl = `${normalizedUrl}${SN_SYNC_SERVICENOW.TABLE_API_PATH}/sys_user?sysparm_limit=1&sysparm_fields=sys_id`;

    try {
      const response = await this.requestApi(validationUrl, {
        method: "GET",
        headers: {
          Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
          ...connection.headers,
        },
        timeout: {
          request: 90000,
        },
      });

      this.handleValidateAuthStatus(response);
    } catch (error) {
      if (error instanceof Error && this.isNetworkError(error)) {
        throw new Error(
          `${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} ${getErrorMessage(error)} (${normalizedUrl})`,
        );
      }

      throw error;
    }
  }

  private async requestWithGot(
    url: string,
    options: SnAuthRequestOptions,
  ): Promise<SnAuthResponse> {
    const response = await this.fetchApi(url, {
      method: options.method,
      headers: options.headers,
    });

    return {
      statusCode: response.status,
      statusMessage: response.statusText,
    };
  }

  private handleValidateAuthStatus(response: SnAuthResponse): void {
    const statusText = response.statusMessage ?? "";

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
    }

    throw new Error(
      `${SN_SYNC_MESSAGES.AUTH_VALIDATE_HTTP_STATUS_PREFIX} ${response.statusCode} ${statusText}`.trim(),
    );
  }

  private isNetworkError(error: Error): boolean {
    return (
      /^(TypeError|FetchError|RequestError)$/i.test(error.name) ||
      /(ERR_EMPTY_RESPONSE|fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|certificate|TLS|SSL)/i.test(
        error.message,
      )
    );
  }

  public async resetAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<void> {
    const instanceName =
      await this.configService.getInstanceName(workspaceFolderUri);

    if (!instanceName) {
      return;
    }

    const secretKey = this.getSecretKey(workspaceFolderUri, instanceName);
    await context.secrets.delete(secretKey);
  }

  public async resolveConnectionAuth(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnServiceNowConnectionAuth> {
    const savedAuth = await this.getSavedAuth(context, workspaceFolderUri);
    const rawInstanceUrl = savedAuth?.instanceUrl;

    if (!savedAuth || !rawInstanceUrl) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    const instanceUrl = await this.resolveValidatedInstanceUrl(
      workspaceFolderUri,
      rawInstanceUrl,
    );

    if (savedAuth.authType === "basic") {
      if (!savedAuth.username || !savedAuth.password) {
        throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
      }

      return {
        authType: "basic",
        instanceUrl,
        headers: {
          Authorization: buildBasicAuthHeader(
            savedAuth.username,
            savedAuth.password,
          ),
        },
        username: savedAuth.username,
      };
    }

    const oauthSecret = await this.resolveOAuthSecret(
      context,
      workspaceFolderUri,
      savedAuth.instanceName,
      savedAuth,
      instanceUrl,
    );

    return {
      authType: "oauth",
      instanceUrl,
      headers: {
        Authorization: `${oauthSecret.tokenType} ${oauthSecret.accessToken}`,
      },
    };
  }

  private async resolveOAuthSecret(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
    savedAuth: SnOAuthAuthSecret,
    instanceUrl: string,
  ): Promise<SnOAuthAuthSecret> {
    if (!savedAuth.accessToken || !savedAuth.tokenType || !savedAuth.clientId) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_NOT_CONFIGURED);
    }

    if (!this.shouldRefreshOAuthToken(savedAuth.expiresAt)) {
      return savedAuth;
    }

    if (!savedAuth.refreshToken) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_OAUTH_REAUTH_REQUIRED);
    }

    const refreshedToken = await this.refreshOAuthToken({
      instanceUrl,
      clientId: savedAuth.clientId,
      refreshToken: savedAuth.refreshToken,
      currentScope: savedAuth.scope,
    });

    const refreshedSecret: SnOAuthAuthSecret = {
      authType: "oauth",
      instanceUrl,
      clientId: savedAuth.clientId,
      accessToken: refreshedToken.accessToken,
      tokenType: refreshedToken.tokenType,
      refreshToken: refreshedToken.refreshToken ?? savedAuth.refreshToken,
      ...(refreshedToken.expiresAt ? { expiresAt: refreshedToken.expiresAt } : {}),
      ...(refreshedToken.scope ?? savedAuth.scope
        ? { scope: refreshedToken.scope ?? savedAuth.scope }
        : {}),
    };

    const secretKey = this.getSecretKey(workspaceFolderUri, instanceName);
    await context.secrets.store(secretKey, JSON.stringify(refreshedSecret));

    return refreshedSecret;
  }

  private shouldRefreshOAuthToken(expiresAt: number | undefined): boolean {
    if (expiresAt === undefined) {
      return false;
    }

    return Date.now() + 60000 >= expiresAt;
  }

  private async exchangeOAuthAuthorizationCode(input: {
    instanceUrl: string;
    clientId: string;
    authorizationCode: string;
    codeVerifier: string;
  }): Promise<{
    accessToken: string;
    tokenType: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  }> {
    return this.requestOAuthToken(
      input.instanceUrl,
      {
        grant_type: "authorization_code",
        code: input.authorizationCode.trim(),
        redirect_uri: SN_SYNC_SERVICENOW.OAUTH_REDIRECT_PATH,
        client_id: input.clientId.trim(),
        code_verifier: input.codeVerifier,
      },
      SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_EXCHANGE_FAILED_PREFIX,
    );
  }

  private async refreshOAuthToken(input: {
    instanceUrl: string;
    clientId: string;
    refreshToken: string;
    currentScope?: string;
  }): Promise<{
    accessToken: string;
    tokenType: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  }> {
    return this.requestOAuthToken(
      input.instanceUrl,
      {
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: input.clientId.trim(),
        ...(input.currentScope ? { scope: input.currentScope } : {}),
      },
      SN_SYNC_MESSAGES.AUTH_OAUTH_TOKEN_REFRESH_FAILED_PREFIX,
    );
  }

  private async requestOAuthToken(
    instanceUrl: string,
    requestBody: Record<string, string>,
    errorPrefix: string,
  ): Promise<{
    accessToken: string;
    tokenType: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  }> {
    let response: Response;

    try {
      response = await this.fetchApi(
        `${normalizeInstanceUrl(instanceUrl)}${SN_SYNC_SERVICENOW.OAUTH_TOKEN_PATH}`,
        {
          method: "POST",
          headers: {
            Accept: SN_SYNC_SERVICENOW.CONTENT_TYPE_JSON,
            "Content-Type": SN_SYNC_SERVICENOW.CONTENT_TYPE_FORM_URLENCODED,
          },
          body: new URLSearchParams(requestBody).toString(),
        },
      );
    } catch (error) {
      if (error instanceof Error && this.isNetworkError(error)) {
        throw new Error(
          `${errorPrefix} ${SN_SYNC_MESSAGES.AUTH_VALIDATE_NETWORK_ERROR_PREFIX} ${getErrorMessage(error)} (${normalizeInstanceUrl(instanceUrl)})`,
        );
      }

      throw error;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
    }

    if (!response.ok) {
      throw new Error(
        `${errorPrefix} ${response.status} ${response.statusText}`.trim(),
      );
    }

    let payload: SnOAuthTokenResponse;

    try {
      payload = (await response.json()) as SnOAuthTokenResponse;
    } catch {
      throw new Error(`${errorPrefix} Invalid token response payload.`);
    }

    if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
      throw new Error(`${errorPrefix} Missing access token in response.`);
    }

    const tokenType =
      typeof payload.token_type === "string" && payload.token_type.trim()
        ? payload.token_type.trim()
        : "Bearer";

    const expiresInSeconds =
      typeof payload.expires_in === "number"
        ? payload.expires_in
        : typeof payload.expires_in === "string"
          ? Number.parseInt(payload.expires_in, 10)
          : undefined;

    return {
      accessToken: payload.access_token.trim(),
      tokenType,
      ...(typeof payload.refresh_token === "string" && payload.refresh_token
        ? { refreshToken: payload.refresh_token }
        : {}),
      ...(Number.isFinite(expiresInSeconds) && expiresInSeconds && expiresInSeconds > 0
        ? { expiresAt: Date.now() + expiresInSeconds * 1000 }
        : {}),
      ...(typeof payload.scope === "string" && payload.scope.trim()
        ? { scope: payload.scope.trim() }
        : {}),
    };
  }

  private async resolveValidatedInstanceUrl(
    workspaceFolderUri: vscode.Uri,
    rawInstanceUrl: string,
  ): Promise<string> {
    const preferences = await resolvePreferences(
      this.configService,
      workspaceFolderUri,
    );

    return normalizeAndValidateInstanceUrl(rawInstanceUrl, preferences.auth);
  }

  private getSecretKey(
    workspaceFolderUri: vscode.Uri,
    instanceName: string,
  ): string {
    return `${SN_SYNC_SECRET_KEYS.INSTANCE_AUTH_PREFIX}:${workspaceFolderUri.toString()}:${instanceName}`;
  }

  private isSnAuthSecret(value: unknown): value is SnAuthSecret {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate.authType === "basic") {
      return (
        typeof candidate.instanceUrl === "string" &&
        typeof candidate.username === "string" &&
        typeof candidate.password === "string"
      );
    }

    if (candidate.authType === "oauth") {
      return (
        typeof candidate.instanceUrl === "string" &&
        typeof candidate.clientId === "string" &&
        typeof candidate.accessToken === "string" &&
        typeof candidate.tokenType === "string" &&
        (candidate.refreshToken === undefined ||
          typeof candidate.refreshToken === "string") &&
        (candidate.expiresAt === undefined ||
          typeof candidate.expiresAt === "number") &&
        (candidate.scope === undefined || typeof candidate.scope === "string")
      );
    }

    return false;
  }

  private createPkceCodeVerifier(): string {
    return this.base64UrlEncode(crypto.randomBytes(32));
  }

  private createPkceCodeChallenge(codeVerifier: string): string {
    return this.base64UrlEncode(
      crypto.createHash("sha256").update(codeVerifier).digest(),
    );
  }

  private createRandomToken(byteLength: number): string {
    return this.base64UrlEncode(crypto.randomBytes(byteLength));
  }

  private base64UrlEncode(value: Buffer): string {
    return value
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
}
