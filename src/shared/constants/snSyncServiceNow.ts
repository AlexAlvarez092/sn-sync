export const SN_SYNC_SERVICENOW = {
  CONTENT_TYPE_JSON: "application/json",
  CONTENT_TYPE_FORM_URLENCODED: "application/x-www-form-urlencoded",
  TABLE_API_PATH: "/api/now/table",
  BACKGROUND_SCRIPT_PATH: "/sys.scripts.do",
  BACKGROUND_SCRIPT_RUN_LABEL: "Run script",
  BACKGROUND_SCRIPT_RECORD_FOR_ROLLBACK: "true",
  OAUTH_AUTHORIZE_PATH: "/oauth_auth.do",
  OAUTH_TOKEN_PATH: "/oauth_token.do",
  OAUTH_REDIRECT_PATH: "/sdk-oauth.do",
  OAUTH_DEFAULT_SCOPE: "openid",
} as const;
