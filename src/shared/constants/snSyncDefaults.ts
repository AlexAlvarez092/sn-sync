import type {
  ExtensionConfigSetting,
  SnPullClearBeforePull,
} from "@shared/models/config.js";

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
      folder: "client_scripts",
      table: "sys_script_client",
      query: "active=true",
      key: "name",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "ui_actions",
      table: "sys_ui_action",
      query: "active=true",
      key: "action_name",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "acl_scripts",
      table: "sys_security_acl",
      query: "active=true^operation!=read",
      key: "name",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "scheduled_jobs",
      table: "sysauto_script",
      query: "active=true",
      key: "name",
      fields: [{ extension: "js", field_name: "script" }],
    },
    {
      folder: "script_actions",
      table: "sysevent_script_action",
      query: "active=true",
      key: "name",
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
