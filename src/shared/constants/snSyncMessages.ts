export const SN_SYNC_MESSAGES = {
  NO_WORKSPACE: "No workspace folder found. Please open a folder in VS Code.",
  INIT_SUCCESS: "sn-sync initialized successfully.",
  INIT_INSTANCE_SKIPPED:
    "sn-sync initialized without instance name. Re-run 'sn: init' or run 'sn: auth' when ready.",
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
  RESET_AUTH_CONFIRM_PROMPT:
    "This will delete the active auth secret. Continue?",
  RESET_AUTH_CONFIRM_ACTION: "Delete auth",
  RESET_AUTH_CANCELLED: "sn-sync reset auth cancelled.",
  RUN_BACKGROUND_SCRIPT_CANCELLED: "sn-sync run background script cancelled.",
  RUN_BACKGROUND_SCRIPT_CONFIRM_ACTION: "Run script",
  RUN_BACKGROUND_SCRIPT_EMPTY_FILE:
    "Selected script file is empty. Add script content and try again.",
  RUN_BACKGROUND_SCRIPT_SUCCESS: "sn-sync background script completed.",
  RUN_BACKGROUND_SCRIPT_FAILED_PREFIX:
    "Failed to run ServiceNow background script:",
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
  PULL_DUPLICATE_OUTPUT_FILE_PREFIX:
    "Duplicate output file name detected in sync setting:",
  RESET_INDEX_SUCCESS: "sn-sync index reset completed.",
  RESET_INDEX_FAILED_PREFIX: "Failed to reset sn-sync index:",
  RESET_INDEX_CONFIRM_PROMPT: "This will clear the local sync index. Continue?",
  RESET_INDEX_CONFIRM_ACTION: "Clear index",
  RESET_INDEX_CANCELLED: "sn-sync reset index cancelled.",
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
    "Push aborted: remote conflicts detected for active file. No files were uploaded:",
  PUSH_ACTIVE_SUCCESS: "sn-sync push active completed.",
  PUSH_ACTIVE_FAILED_PREFIX: "Failed to push active file to ServiceNow:",
  PUSH_MODIFIED_NO_LOCAL_CHANGES: "No modified local files detected to push.",
  PUSH_REPORT_NO_LOCAL_CHANGES: "No modified local files detected to report.",
  PUSH_REPORT_TITLE: "Generating push report...",
  PUSH_REPORT_SUCCESS: "sn-sync push report generated.",
  PUSH_REPORT_FAILED_PREFIX: "Failed to generate push report:",
  PUSH_REPORT_NO_UPDATE_SET: "(none found)",
  PUSH_REPORT_RECORD_NOT_FOUND_NOTE: "Record not found in instance (404).",
  PUSH_REPORT_RECORD_RESOLUTION_FAILED_NOTE_PREFIX:
    "Record metadata could not be resolved:",
  PUSH_REPORT_UPDATE_SET_TABLE_UNAVAILABLE_NOTE:
    "Update set table is not available (404).",
  PUSH_REPORT_UPDATE_SET_RESOLUTION_FAILED_NOTE_PREFIX:
    "Update set metadata could not be resolved:",
  PUSH_MODIFIED_CONFLICTS_PREFIX:
    "Push aborted: remote conflicts detected. No files were uploaded.",
  PUSH_MODIFIED_SUCCESS_PREFIX: "sn-sync push modified completed.",
  PUSH_MODIFIED_FAILED_PREFIX: "Failed to push modified files to ServiceNow:",
  CLEAR_SRC_CONFIRM_ACTION: "Clear src",
} as const;
