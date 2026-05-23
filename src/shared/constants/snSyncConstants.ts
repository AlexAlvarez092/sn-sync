export const SN_SYNC_COMMANDS = {
  INIT: "sn-sync.sn-init",
  AUTH: "sn-sync.auth",
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
} as const;

export const SN_SYNC_SECRET_KEYS = {
  INSTANCE_AUTH_PREFIX: "sn-sync.instance-auth",
} as const;
