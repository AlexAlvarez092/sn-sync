import type {
  ExtensionConfigSetting,
  SnPullClearBeforePull,
} from "@shared/models/config.js";
import type { SnScopedApplication } from "@shared/models/updateSet.js";

export const SN_SYNC_COMMANDS = {
  INIT: "sn-sync.sn-init",
  AUTH: "sn-sync.auth",
  AUTH_VALIDATE: "sn-sync.auth-validate",
  PULL: "sn-sync.pull",
  PULL_TABLE: "sn-sync.pull-table",
  PUSH_ACTIVE: "sn-sync.push-active",
  PUSH_MODIFIED: "sn-sync.push-modified",
  CLEAR_SRC: "sn-sync.clear-src",
  UPDATE_SET_RESET: "sn-sync.update-set.reset",
  UPDATE_SET_SELECT_SCOPE: "sn-sync.update-set.select-scope",
  UPDATE_SET_SELECT_UPDATE_SET: "sn-sync.update-set.select-update-set",
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
  AUTH_INVALID_CREDENTIALS:
    "ServiceNow rejected the credentials. Please verify username and password.",
  AUTH_VALIDATE_SUCCESS: "ServiceNow login validated successfully.",
  AUTH_VALIDATE_FAILED_PREFIX: "Failed to validate ServiceNow login:",
  AUTH_VALIDATE_HTTP_STATUS_PREFIX:
    "ServiceNow login validation failed with status:",
  UPDATE_SET_NO_IN_PROGRESS_FOUND:
    "No in-progress update sets found for the selected scope.",
  UPDATE_SET_SELECTORS_NOT_READY:
    "Scope and update set selectors are still initializing.",
  UPDATE_SET_SCOPE_PROMPT: "Select scope",
  UPDATE_SET_PROMPT: "Select in-progress update set",
  UPDATE_SET_SCOPE_SELECTOR_LABEL: "SN Scope",
  UPDATE_SET_SELECTOR_LABEL: "SN Update Set",
  UPDATE_SET_NOT_SELECTED_LABEL: "Not selected",
  UPDATE_SET_SELECTORS_INIT_FAILED_PREFIX:
    "Failed to initialize scope selectors:",
  SN_REQUEST_HTTP_STATUS_PREFIX: "ServiceNow data request failed with status:",
  UPDATE_SET_RESET_SUCCESS:
    "sn-sync selections reset. Scope/update set configuration has been cleared.",
  UPDATE_SET_RESET_FAILED_PREFIX: "Failed to reset sn-sync selections:",
  PULL_PROGRESS_TITLE: "Pulling scripts from ServiceNow...",
  PULL_NO_SETTINGS:
    "No sync settings found in extension config. Nothing to pull.",
  PULL_CLEAR_SRC_PROMPT: "Clear src before pull to avoid stale local files?",
  PULL_CLEAR_SRC_SKIP_ACTION: "Keep src",
  PULL_SUCCESS_PREFIX: "sn-sync pull completed.",
  PULL_FAILED_PREFIX: "Failed to pull scripts from ServiceNow:",
  PULL_TABLE_PROMPT: "Select table to pull",
  PULL_TABLE_CANCELLED: "sn-sync pull table cancelled.",
  PULL_TABLE_CLEAR_FOLDER_PROMPT:
    "Clear folder before pull to avoid stale local files?",
  PULL_TABLE_CLEAR_FOLDER_CONFIRM_ACTION: "Clear folder",
  PULL_TABLE_CLEAR_FOLDER_SKIP_ACTION: "Keep folder",
  PULL_TABLE_SUCCESS_PREFIX: "sn-sync pull table completed.",
  PULL_TABLE_FAILED_PREFIX: "Failed to pull table from ServiceNow:",
  PUSH_PROGRESS_TITLE: "Pushing scripts to ServiceNow...",
  PUSH_ACTIVE_NO_EDITOR:
    "No active file found. Open a file from this workspace and try again.",
  PUSH_ACTIVE_NOT_INDEXED:
    "Active file is not indexed. Run 'sn: pull' or 'sn: pull table' first.",
  PUSH_ACTIVE_NO_LOCAL_CHANGES:
    "No local changes detected for the active file.",
  PUSH_ACTIVE_CONFLICT_PREFIX:
    "Push aborted: remote changes detected for active file:",
  PUSH_ACTIVE_SUCCESS: "sn-sync push active completed.",
  PUSH_ACTIVE_FAILED_PREFIX: "Failed to push active file to ServiceNow:",
  PUSH_MODIFIED_NO_LOCAL_CHANGES: "No modified local files detected to push.",
  PUSH_MODIFIED_CONFLICTS_PREFIX:
    "Push aborted: remote conflicts detected. No files were uploaded.",
  PUSH_MODIFIED_SUCCESS_PREFIX: "sn-sync push modified completed.",
  PUSH_MODIFIED_FAILED_PREFIX: "Failed to push modified files to ServiceNow:",
  CLEAR_SRC_CONFIRM:
    "This will permanently delete all files and folders inside src. Continue?",
  CLEAR_SRC_CONFIRM_ACTION: "Clear src",
  CLEAR_SRC_CANCELLED: "sn-sync clear src cancelled.",
  CLEAR_SRC_NOT_FOUND: "src folder not found. Nothing to clear.",
  CLEAR_SRC_SUCCESS: "sn-sync src folder cleared.",
  CLEAR_SRC_FAILED_PREFIX: "Failed to clear src folder:",
} as const;

export const SN_SYNC_INPUTS = {
  AUTH_INSTANCE_NAME_PROMPT: "Instance name",
  AUTH_INSTANCE_NAME_PLACEHOLDER: "my-dev-instance",
  AUTH_INSTANCE_URL_PROMPT: "Instance URL",
  AUTH_INSTANCE_URL_PLACEHOLDER: "https://my-dev-instance.service-now.com",
  AUTH_USERNAME_PROMPT: "Username",
  AUTH_USERNAME_PLACEHOLDER: "admin",
  AUTH_PASSWORD_PROMPT: "Password",
} as const;

export const SN_SYNC_DEFAULTS = {
  ROOT_DIR: "src",
  CLEAR_BEFORE_PULL: "ask" as SnPullClearBeforePull,
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
  CURRENT_USER_API_PATH: "/api/now/ui/user/current",
  TABLES: {
    SCOPE: "sys_scope",
    UPDATE_SET: "sys_update_set",
  },
  QUERIES: {
    NON_EMPTY_SCOPE: "scopeISNOTEMPTY",
    ACTIVE_TRUE: "active=true",
    inProgressUpdateSets: (applicationSysId: string) =>
      `state=in progress^application=${applicationSysId}`,
  },
  FIELDS: {
    SCOPED_APPLICATION: "sys_id,name,scope",
    UPDATE_SET: "sys_id,name",
  },
} as const;

export const SN_SYNC_UPDATE_SET = {
  GLOBAL_SCOPED_APP: {
    sys_id: "global",
    name: "Global",
    scope: "global",
  } satisfies SnScopedApplication,
} as const;

export const SN_SYNC_SECRET_KEYS = {
  INSTANCE_AUTH_PREFIX: "sn-sync.instance-auth",
} as const;

export const SN_SYNC_STORAGE_KEYS = {
  SYNC_INDEX_PREFIX: "sn-sync.sync-index",
} as const;
