export type SnAuthType = "basic" | "oauth";

interface SnBaseAuthInput {
  instanceName: string;
  instanceUrl: string;
}

export interface SnBasicAuthInput extends SnBaseAuthInput {
  authType: "basic";
  username: string;
  password: string;
}

export interface SnOAuthAuthInput extends SnBaseAuthInput {
  authType: "oauth";
  clientId: string;
  authorizationCode: string;
  codeVerifier: string;
  scope?: string;
}

export type SnAuthInput = SnBasicAuthInput | SnOAuthAuthInput;

interface SnBaseAuthSecret {
  authType: SnAuthType;
  instanceUrl: string;
}

export interface SnBasicAuthSecret extends SnBaseAuthSecret {
  authType: "basic";
  username: string;
  password: string;
}

export interface SnOAuthAuthSecret extends SnBaseAuthSecret {
  authType: "oauth";
  clientId: string;
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export type SnAuthSecret = SnBasicAuthSecret | SnOAuthAuthSecret;

export type SavedSnAuth = SnAuthSecret & {
  instanceName: string;
};
