export const SN_SYNC_COMMANDS = {
  INIT: "sn-sync.sn-init",
  AUTH: "sn-sync.auth",
  AUTH_VALIDATE: "sn-sync.auth-validate",
  ACTIVATE: "sn-sync.activate",
  ACTIVATE_SELECT_SCOPE: "sn-sync.activate.select-scope",
  ACTIVATE_SELECT_UPDATE_SET: "sn-sync.activate.select-update-set",
} as const;

export const SN_SYNC_PATHS = {
  ROOT_FOLDER: ".sn-sync",
  INSTANCE_CONFIG_FILE: "instance-config.json",
  EXTENSION_CONFIG_FILE: "extension-config.json",
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
  ACTIVATE_READY:
    "sn-sync activate ready. Scope and update set selectors are now available in the status bar.",
  ACTIVATE_NO_UPDATE_SET_FOUND:
    "No in-progress update sets found for the selected scope.",
  ACTIVATE_NOT_READY:
    "Run 'sn: activate' first to initialize scope and update set selectors.",
  ACTIVATE_SCOPE_PROMPT: "Select scope",
  ACTIVATE_UPDATE_SET_PROMPT: "Select in-progress update set",
  ACTIVATE_SCOPE_SELECTOR_LABEL: "SN Scope",
  ACTIVATE_UPDATE_SET_SELECTOR_LABEL: "SN Update Set",
  ACTIVATE_NOT_SELECTED_LABEL: "Not selected",
  ACTIVATE_FAILED_PREFIX: "Failed to activate sn-sync:",
  ACTIVATE_STATUS_HTTP_STATUS_PREFIX:
    "ServiceNow data request failed with status:",
} as const;

export const SN_SYNC_SECRET_KEYS = {
  INSTANCE_AUTH_PREFIX: "sn-sync.instance-auth",
} as const;
