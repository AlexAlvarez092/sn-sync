import type {
  ExtensionConfigSetting,
  SnPullClearBeforePull,
} from "@shared/models/config.js";

export const SN_SYNC_COMMANDS = {
  INIT: "sn-sync.sn-init",
  AUTH: "sn-sync.auth",
  AUTH_VALIDATE: "sn-sync.auth-validate",
  RESET_AUTH: "sn-sync.reset-auth",
  OPEN_ACTIVE_IN_INSTANCE: "sn-sync.open-active-in-instance",
  PULL: "sn-sync.pull",
  PULL_BY_SYS_ID: "sn-sync.pull-by-sys-id",
  RESET_INDEX: "sn-sync.reset-index",
  PUSH_ACTIVE: "sn-sync.push-active",
  PUSH_MODIFIED: "sn-sync.push-modified",
  PUSH_REPORT: "sn-sync.push-report",
} as const;

export const SN_SYNC_PATHS = {
  RC_FILE: ".snsyncrc",
} as const;

export const SN_SYNC_MESSAGES = {
  NO_WORKSPACE: "No workspace folder found. Please open a folder in VS Code.",
  INIT_SUCCESS: "sn-sync initialized successfully.",
  INIT_FAILED_PREFIX: "Failed to initialize sn-sync:",
  AUTH_CANCELLED: "sn-sync auth cancelled.",
  AUTH_SUCCESS: "sn-sync auth saved successfully.",
  AUTH_FAILED_PREFIX: "Failed to save sn-sync auth:",
  AUTH_NOT_CONFIGURED: "No saved sn-sync auth found. Run 'sn: auth' first.",
  AUTH_INVALID_INSTANCE_URL_PREFIX: "Invalid ServiceNow instance URL:",
  AUTH_INVALID_CREDENTIALS:
    "ServiceNow rejected the credentials. Please verify username and password.",
  AUTH_VALIDATE_SUCCESS: "ServiceNow login validated successfully.",
  AUTH_VALIDATE_FAILED_PREFIX: "Failed to validate ServiceNow login:",
  AUTH_VALIDATE_HTTP_STATUS_PREFIX:
    "ServiceNow login validation failed with status:",
  AUTH_VALIDATE_NETWORK_ERROR_PREFIX:
    "ServiceNow login validation failed before receiving a response:",
  RESET_AUTH_SUCCESS: "sn-sync auth reset completed.",
  RESET_AUTH_FAILED_PREFIX: "Failed to reset sn-sync auth:",
  OPEN_ACTIVE_NO_EDITOR:
    "No active file found. Open a file from this workspace and try again.",
  OPEN_ACTIVE_NOT_INDEXED:
    "Active file is not indexed. Run 'sn: pull' or 'sn: pull by sys_id' first.",
  OPEN_ACTIVE_OPEN_FAILED: "Failed to open record in external browser.",
  OPEN_ACTIVE_SUCCESS_PREFIX: "Opened ServiceNow record:",
  OPEN_ACTIVE_FAILED_PREFIX:
    "Failed to open active file in ServiceNow instance:",
  SN_REQUEST_HTTP_STATUS_PREFIX: "ServiceNow data request failed with status:",
  SN_REQUEST_INVALID_PATH_SEGMENT_PREFIX:
    "Invalid ServiceNow request path segment:",
  WORKSPACE_PATH_INVALID_PREFIX: "Invalid workspace path fragment:",
  WORKSPACE_PATH_OUTSIDE_WORKSPACE_PREFIX:
    "Resolved workspace path escapes workspace folder:",
  PULL_PROGRESS_TITLE: "Pulling scripts from ServiceNow...",
  PULL_NO_SETTINGS:
    "No sync settings found in extension config. Nothing to pull.",
  PULL_BY_SYS_ID_TABLE_PROMPT: "Select table to pull by sys_id",
  PULL_BY_SYS_ID_CANCELLED: "sn-sync pull by sys_id cancelled.",
  PULL_BY_SYS_ID_INVALID_SYS_ID: "A valid sys_id is required.",
  PULL_BY_SYS_ID_SUCCESS_PREFIX: "sn-sync pull by sys_id completed.",
  PULL_BY_SYS_ID_FAILED_PREFIX:
    "Failed to pull record by sys_id from ServiceNow:",
  RESET_INDEX_SUCCESS: "sn-sync index reset completed.",
  RESET_INDEX_FAILED_PREFIX: "Failed to reset sn-sync index:",
  PULL_CLEAR_SRC_PROMPT: "Clear src before pull to avoid stale local files?",
  PULL_CLEAR_SRC_SKIP_ACTION: "Keep src",
  PULL_SUCCESS_PREFIX: "sn-sync pull completed.",
  PULL_FAILED_PREFIX: "Failed to pull scripts from ServiceNow:",
  PUSH_PROGRESS_TITLE: "Pushing scripts to ServiceNow...",
  PUSH_ACTIVE_NO_EDITOR:
    "No active file found. Open a file from this workspace and try again.",
  PUSH_ACTIVE_NOT_INDEXED:
    "Active file is not indexed. Run 'sn: pull' or 'sn: pull by sys_id' first.",
  PUSH_ACTIVE_NO_LOCAL_CHANGES:
    "No local changes detected for the active file.",
  PUSH_ACTIVE_CONFLICT_PREFIX:
    "Push aborted: remote changes detected for active file:",
  PUSH_ACTIVE_SUCCESS: "sn-sync push active completed.",
  PUSH_ACTIVE_FAILED_PREFIX: "Failed to push active file to ServiceNow:",
  PUSH_MODIFIED_NO_LOCAL_CHANGES: "No modified local files detected to push.",
  PUSH_REPORT_NO_LOCAL_CHANGES: "No modified local files detected to report.",
  PUSH_REPORT_TITLE: "Generating push report...",
  PUSH_REPORT_SUCCESS: "sn-sync push report generated.",
  PUSH_REPORT_FAILED_PREFIX: "Failed to generate push report:",
  PUSH_REPORT_NO_UPDATE_SET: "(none found)",
  PUSH_REPORT_RECORD_NOT_FOUND_NOTE: "Record not found in instance (404).",
  PUSH_REPORT_UPDATE_SET_TABLE_UNAVAILABLE_NOTE:
    "Update set table is not available (404).",
  PUSH_MODIFIED_CONFLICTS_PREFIX:
    "Push aborted: remote conflicts detected. No files were uploaded.",
  PUSH_MODIFIED_SUCCESS_PREFIX: "sn-sync push modified completed.",
  PUSH_MODIFIED_FAILED_PREFIX: "Failed to push modified files to ServiceNow:",
  CLEAR_SRC_CONFIRM_ACTION: "Clear src",
} as const;

export const SN_SYNC_VALUES = {
  UNKNOWN: "unknown",
  GLOBAL: "global",
  UNNAMED_PATH_SEGMENT: "unnamed",
} as const;

export const SN_SYNC_DIAGNOSTICS = {
  CHANNEL_NAME: "sn-sync diagnostics",
} as const;

export const SN_SYNC_ERROR_CODES = {
  AUTH_FAILED: "SN_AUTH_FAILED",
  AUTH_VALIDATE_FAILED: "SN_AUTH_VALIDATE_FAILED",
  INIT_FAILED: "SN_INIT_FAILED",
  OPEN_ACTIVE_IN_INSTANCE_FAILED: "SN_OPEN_ACTIVE_IN_INSTANCE_FAILED",
  PULL_FAILED: "SN_PULL_FAILED",
  PULL_BY_SYS_ID_FAILED: "SN_PULL_BY_SYS_ID_FAILED",
  PUSH_ACTIVE_FAILED: "SN_PUSH_ACTIVE_FAILED",
  PUSH_MODIFIED_FAILED: "SN_PUSH_MODIFIED_FAILED",
  PUSH_REPORT_FAILED: "SN_PUSH_REPORT_FAILED",
  RESET_AUTH_FAILED: "SN_RESET_AUTH_FAILED",
  RESET_INDEX_FAILED: "SN_RESET_INDEX_FAILED",
} as const;

export const SN_SYNC_INPUTS = {
  AUTH_INSTANCE_NAME_PROMPT: "Instance name",
  AUTH_INSTANCE_NAME_PLACEHOLDER: "my-dev-instance",
  AUTH_INSTANCE_URL_PROMPT: "Instance URL",
  AUTH_INSTANCE_URL_PLACEHOLDER: "https://my-dev-instance.service-now.com",
  AUTH_USERNAME_PROMPT: "Username",
  AUTH_USERNAME_PLACEHOLDER: "admin",
  AUTH_PASSWORD_PROMPT: "Password",
  PULL_BY_SYS_ID_PROMPT: "sys_id",
  PULL_BY_SYS_ID_PLACEHOLDER: "Paste a ServiceNow sys_id",
} as const;

export const SN_SYNC_DEFAULTS = {
  ROOT_DIR: "src",
  CLEAR_BEFORE_PULL: "ask" as SnPullClearBeforePull,
  AUTH_ALLOW_CUSTOM_HOSTS: false,
  AUTH_CUSTOM_HOSTS: [] as string[],
  SETTINGS: [
    {
      folder: "business_rules",
      table: "sys_script",
      query: "active=true",
      key: "name",
      subDirPattern: "<collection>/<when>",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "script_includes",
      table: "sys_script_include",
      query: "active=true",
      key: "api_name",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "widgets",
      table: "sp_widget",
      query: "active=true",
      key: "id",
      fields: [
        { extension: "server.js", field_name: "script" },
        { extension: "client.js", field_name: "client_script" },
        { extension: "html", field_name: "template" },
        { extension: "scss", field_name: "css" },
      ],
    },
  ] satisfies ExtensionConfigSetting[],
} as const;

export const SN_SYNC_SERVICENOW = {
  CONTENT_TYPE_JSON: "application/json",
  TABLE_API_PATH: "/api/now/table",
} as const;

export const SN_SYNC_SECRET_KEYS = {
  INSTANCE_AUTH_PREFIX: "sn-sync.instance-auth",
} as const;

export const SN_SYNC_STORAGE_KEYS = {
  SYNC_INDEX_PREFIX: "sn-sync.sync-index",
} as const;
