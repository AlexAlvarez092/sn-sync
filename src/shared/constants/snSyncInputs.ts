export const SN_SYNC_INPUTS = {
  AUTH_METHOD_PROMPT: "Authentication method",
  AUTH_METHOD_BASIC_LABEL: "basic",
  AUTH_METHOD_OAUTH_LABEL: "oauth",
  AUTH_INSTANCE_NAME_PROMPT: "Instance name",
  AUTH_INSTANCE_NAME_PLACEHOLDER: "my-dev-instance",
  AUTH_INSTANCE_URL_PROMPT: "Instance URL",
  AUTH_INSTANCE_URL_PLACEHOLDER: "https://my-dev-instance.service-now.com",
  AUTH_USERNAME_PROMPT: "Username",
  AUTH_USERNAME_PLACEHOLDER: "admin",
  AUTH_PASSWORD_PROMPT: "Password",
  AUTH_OAUTH_CLIENT_ID_PROMPT: "OAuth client ID",
  AUTH_OAUTH_CLIENT_ID_PLACEHOLDER: "Paste the SDK OAuth client ID",
  AUTH_OAUTH_CODE_PROMPT: "OAuth authorization code",
  AUTH_OAUTH_CODE_PLACEHOLDER:
    "Paste the code shown by ServiceNow SDK OAuth page",
  PULL_BY_SYS_ID_PROMPT: "sys_id",
  PULL_BY_SYS_ID_PLACEHOLDER: "Paste a ServiceNow sys_id",
} as const;
