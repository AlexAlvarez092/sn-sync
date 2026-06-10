export const SN_SYNC_COMMANDS = {
  INIT: "sn-sync.sn-init",
  AUTH: "sn-sync.auth",
  AUTH_VALIDATE: "sn-sync.auth-validate",
  RESET_AUTH: "sn-sync.reset-auth",
  RUN_BACKGROUND_SCRIPT: "sn-sync.run-background-script",
  OPEN_ACTIVE_IN_INSTANCE: "sn-sync.open-active-in-instance",
  PULL: "sn-sync.pull",
  PULL_BY_SYS_ID: "sn-sync.pull-by-sys-id",
  RESET_INDEX: "sn-sync.reset-index",
  PUSH_ACTIVE: "sn-sync.push-active",
  PUSH_MODIFIED: "sn-sync.push-modified",
  PUSH_REPORT: "sn-sync.push-report",
} as const;
