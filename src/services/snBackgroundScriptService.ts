import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import {
  createGotFetchTransport,
  normalizeInstanceUrl,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";

export interface SnBackgroundScriptExecutionContext {
  instanceUrl: string;
  username?: string;
}

export interface SnBackgroundScriptResult {
  output: string;
  rawResponse: string;
}

export interface SnBackgroundScriptServiceApi {
  resolveExecutionContext(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnBackgroundScriptExecutionContext>;
  runBackgroundScript(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    scriptContent: string,
  ): Promise<SnBackgroundScriptResult>;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const NO_OUTPUT_HINT =
  "(No printable output returned by ServiceNow. Use gs.print()/gs.warn() if you need visible output. gs.info() writes to system logs.)";

const PRINTABLE_HARNESS_PREFIX = [
  "(function () {",
  "  var __snSyncOriginal = {};",
  "  var __snSyncLog = [];",
  "  function __snSyncToText(value) {",
  "    if (value === undefined || value === null) { return ''; }",
  "    if (typeof value === 'string') { return value; }",
  "    try { return JSON.stringify(value); } catch (error) { return String(value); }",
  "  }",
  "  function __snSyncRender(level, args) {",
  "    var parts = [];",
  "    for (var index = 0; index < args.length; index += 1) {",
  "      parts.push(__snSyncToText(args[index]));",
  "    }",
  "    var text = parts.join(' ');",
  "    var line = level ? '[' + level + '] ' + text : text;",
  "    __snSyncLog.push(line);",
  "    if (__snSyncOriginal.print) {",
  "      __snSyncOriginal.print.call(gs, line);",
  "    }",
  "  }",
  "  function __snSyncWrap(name, level) {",
  "    if (typeof gs === 'undefined' || !gs[name] || typeof gs[name] !== 'function') { return; }",
  "    __snSyncOriginal[name] = gs[name];",
  "    gs[name] = function () {",
  "      __snSyncRender(level, arguments);",
  "      return __snSyncOriginal[name].apply(gs, arguments);",
  "    };",
  "  }",
  "  __snSyncWrap('print', 'PRINT');",
  "  __snSyncWrap('info', 'INFO');",
  "  __snSyncWrap('log', 'LOG');",
  "  __snSyncWrap('warn', 'WARN');",
  "  __snSyncWrap('error', 'ERROR');",
  "  try {",
].join("\n");

const PRINTABLE_HARNESS_SUFFIX = [
  "  } finally {",
  "    if (__snSyncOriginal.print) { gs.print = __snSyncOriginal.print; }",
  "    if (__snSyncOriginal.info) { gs.info = __snSyncOriginal.info; }",
  "    if (__snSyncOriginal.log) { gs.log = __snSyncOriginal.log; }",
  "    if (__snSyncOriginal.warn) { gs.warn = __snSyncOriginal.warn; }",
  "    if (__snSyncOriginal.error) { gs.error = __snSyncOriginal.error; }",
  "  }",
  "}())",
].join("\n");

export class SnBackgroundScriptService implements SnBackgroundScriptServiceApi {
  public constructor(
    private readonly authService: SnAuthService = new SnAuthService(),
    private readonly fetchApi: typeof fetch = createGotFetchTransport(),
  ) {}

  public async resolveExecutionContext(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnBackgroundScriptExecutionContext> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );

    return {
      instanceUrl: connection.instanceUrl,
      username: connection.username,
    };
  }

  public async runBackgroundScript(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
    scriptContent: string,
  ): Promise<SnBackgroundScriptResult> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);

    const response = await this.fetchApi(
      `${normalizeInstanceUrl(connection.instanceUrl)}${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_PATH}`,
      {
        method: "POST",
        headers: {
          Accept: "text/html",
          "Content-Type": "application/x-www-form-urlencoded",
          ...headers,
        },
        body: new URLSearchParams({
          script: this.wrapPrintableScript(scriptContent),
          runscript: "Run script",
          sysparm_ck: "",
          quota_managed_transaction: "on",
        }).toString(),
      },
    );

    if (response.status === 401 || response.status === 403) {
      throw new Error(SN_SYNC_MESSAGES.AUTH_INVALID_CREDENTIALS);
    }

    if (!response.ok) {
      throw new Error(
        `${SN_SYNC_MESSAGES.SN_REQUEST_HTTP_STATUS_PREFIX} ${response.status} ${response.statusText}`.trim(),
      );
    }

    const rawResponse = await response.text();
    return {
      output: this.extractExecutionOutput(rawResponse),
      rawResponse,
    };
  }

  private extractExecutionOutput(rawHtml: string): string {
    const preBlocks = [...rawHtml.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)];
    if (preBlocks.length > 0) {
      const longest = preBlocks
        .map((match) => this.decodeHtml(match[1]).trim())
        .sort((a, b) => b.length - a.length)[0];

      if (longest) {
        return longest;
      }
    }

    const bodyText = this.decodeHtml(rawHtml.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    return bodyText || NO_OUTPUT_HINT;
  }

  private decodeHtml(value: string): string {
    return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity) => {
      const token = entity.slice(1, -1);
      const mapped = HTML_ENTITY_MAP[token.toLowerCase()];
      if (mapped !== undefined) {
        return mapped;
      }

      if (/^#x[0-9a-fA-F]+$/.test(token)) {
        const codePoint = Number.parseInt(token.slice(2), 16);
        return Number.isNaN(codePoint)
          ? entity
          : String.fromCodePoint(codePoint);
      }

      if (/^#\d+$/.test(token)) {
        const codePoint = Number.parseInt(token.slice(1), 10);
        return Number.isNaN(codePoint)
          ? entity
          : String.fromCodePoint(codePoint);
      }

      return entity;
    });
  }

  private wrapPrintableScript(scriptContent: string): string {
    return `${PRINTABLE_HARNESS_PREFIX}\n${scriptContent}\n${PRINTABLE_HARNESS_SUFFIX}`;
  }
}
