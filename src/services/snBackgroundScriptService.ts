import * as vscode from "vscode";
import { SnAuthService } from "@services/snAuthService.js";
import {
  SN_SYNC_MESSAGES,
  SN_SYNC_SERVICENOW,
} from "@shared/constants/snSyncConstants.js";
import {
  buildServiceNowTableApiUrl,
  createGotFetchTransport,
  normalizeInstanceUrl,
  resolveConnectionHeaders,
} from "@shared/services/snHttpService.js";
import {
  isLikelySysId,
  decodeHtmlEntities,
  normalizeOptionalString,
} from "@shared/services/snStringService.js";

export interface SnBackgroundScriptExecutionContext {
  instanceUrl: string;
  username?: string;
}

export interface SnBackgroundScriptResult {
  output: string;
  rawResponse: string;
}

export interface SnBackgroundScriptScopeOption {
  id: string;
  label: string;
}

export interface SnBackgroundScriptScopeResolution {
  options: SnBackgroundScriptScopeOption[];
  defaultScopeId: string;
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
    scopeId?: string,
  ): Promise<SnBackgroundScriptResult>;
  resolveScopeOptions?(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnBackgroundScriptScopeResolution>;
}

const NO_OUTPUT_HINT =
  "(No printable output returned by ServiceNow. Use gs.print() for visible output. gs.info() writes to system logs, not visible here.)";

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
    scopeId = "global",
  ): Promise<SnBackgroundScriptResult> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);
    const instanceUrl = normalizeInstanceUrl(connection.instanceUrl);

    await this.warmSession(instanceUrl, headers);
    const scriptsPageHtml = await this.fetchScriptsPage(instanceUrl, headers);
    const ckToken = this.extractCkToken(scriptsPageHtml);
    if (!ckToken) {
      throw new Error("Could not extract ck token from ServiceNow response");
    }

    const effectiveScopeValue = await this.resolveScopeValueForSubmission(
      scopeId,
      scriptsPageHtml,
      instanceUrl,
      headers,
    );
    if (!effectiveScopeValue) {
      throw new Error(
        `Selected scope '${scopeId}' is not available for this instance/user.`,
      );
    }

    // Phase 2: execute script with the ck token using the same cookie-backed transport.
    const formPayload = new URLSearchParams({
      script: scriptContent,
      runscript: SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_RUN_LABEL,
      sysparm_ck: ckToken,
      sys_scope: effectiveScopeValue,
      record_for_rollback:
        SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_RECORD_FOR_ROLLBACK,
    });

    const response = await this.fetchApi(
      `${instanceUrl}${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...headers,
        },
        body: formPayload.toString(),
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

  public async resolveScopeOptions(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ): Promise<SnBackgroundScriptScopeResolution> {
    const connection = await this.authService.resolveConnectionAuth(
      context,
      workspaceFolderUri,
    );
    const headers = resolveConnectionHeaders(connection);
    const instanceUrl = normalizeInstanceUrl(connection.instanceUrl);

    await this.warmSession(instanceUrl, headers);

    const currentScope = await this.getCurrentScopeFromScriptsPage(
      instanceUrl,
      headers,
    );
    const listedScopes = await this.tryGetAllScopes(instanceUrl, headers);

    if (listedScopes.length > 0) {
      const byId = new Map<string, SnBackgroundScriptScopeOption>();
      for (const scope of listedScopes) {
        byId.set(scope.id, scope);
      }

      if (!byId.has("global")) {
        byId.set("global", { id: "global", label: "Global" });
      }

      if (currentScope && !byId.has(currentScope.id)) {
        byId.set(currentScope.id, currentScope);
      }

      const options = Array.from(byId.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
      );

      return {
        options,
        defaultScopeId: currentScope?.id || "global",
      };
    }

    // ACL fallback: only global + current scope from scripts page.
    const fallback = new Map<string, SnBackgroundScriptScopeOption>();
    fallback.set("global", { id: "global", label: "Global" });
    if (currentScope) {
      fallback.set(currentScope.id, currentScope);
    }

    return {
      options: Array.from(fallback.values()),
      defaultScopeId: currentScope?.id || "global",
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

    return bodyText;
  }

  private decodeHtml(value: string): string {
    return decodeHtmlEntities(value);
  }

  private extractCkToken(html: string): string | undefined {
    return this.extractCkTokenFromInput(html);
  }

  private async resolveScopeValueForSubmission(
    requestedScope: string,
    scriptsPageHtml: string,
    instanceUrl: string,
    headers: Record<string, string>,
  ): Promise<string | undefined> {
    const normalizedRequested = requestedScope.trim();
    if (!normalizedRequested) {
      return this.resolveGlobalScopeValue(scriptsPageHtml);
    }

    const options = this.extractScopeOptionsFromHtml(scriptsPageHtml);
    if (options.length === 0) {
      const apiResolved = await this.tryResolveScopeValueByLookup(
        instanceUrl,
        headers,
        normalizedRequested,
      );
      if (apiResolved) {
        return apiResolved;
      }

      if (normalizedRequested.toLowerCase() === "global") {
        return "global";
      }

      if (isLikelySysId(normalizedRequested)) {
        return normalizedRequested;
      }

      return undefined;
    }

    const matched = this.findMatchingScopeOption(options, normalizedRequested);
    if (matched) {
      return matched.value;
    }

    const apiResolved = await this.tryResolveScopeValueByLookup(
      instanceUrl,
      headers,
      normalizedRequested,
    );
    if (apiResolved) {
      return apiResolved;
    }

    if (isLikelySysId(normalizedRequested)) {
      return normalizedRequested;
    }

    return undefined;
  }

  private resolveGlobalScopeValue(scriptsPageHtml: string): string | undefined {
    const options = this.extractScopeOptionsFromHtml(scriptsPageHtml);
    const globalMatch = this.findMatchingScopeOption(options, "global");
    return globalMatch?.value;
  }

  private findMatchingScopeOption(
    options: Array<{ value: string; label: string }>,
    requestedScope: string,
  ): { value: string; label: string } | undefined {
    const requestedLower = requestedScope.toLowerCase();

    // Try exact match first
    for (const option of options) {
      const aliases = this.getScopeAliases(option);
      if (aliases.some((alias) => alias.toLowerCase() === requestedLower)) {
        return option;
      }
    }

    // Try canonical form match
    const requestedCanonical = this.toScopeCanonicalKey(requestedScope);
    if (requestedCanonical.length > 0) {
      for (const option of options) {
        const aliases = this.getScopeAliases(option)
          .map((alias) => this.toScopeCanonicalKey(alias))
          .filter((alias) => alias.length > 0);
        if (aliases.includes(requestedCanonical)) {
          return option;
        }
      }
    }

    // Try fuzzy substring match for longer queries
    if (requestedLower.length >= 3) {
      for (const option of options) {
        const aliases = this.getScopeAliases(option).map((alias) =>
          alias.toLowerCase(),
        );
        if (
          aliases.some(
            (alias) =>
              alias.includes(requestedLower) || requestedLower.includes(alias),
          )
        ) {
          return option;
        }
      }
    }

    return undefined;
  }

  private getScopeAliases(option: { value: string; label: string }): string[] {
    const aliases = new Set<string>();
    const addAlias = (value: string): void => {
      const normalized = value.trim();
      if (normalized.length > 0) {
        aliases.add(normalized);
      }
    };

    addAlias(option.value);
    addAlias(option.label);

    const bracketTokens = [...option.label.matchAll(/\[([^\]]+)\]/g)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => Boolean(value));
    for (const token of bracketTokens) {
      addAlias(token);
    }

    return [...aliases];
  }

  private toScopeCanonicalKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private async tryResolveScopeValueByLookup(
    instanceUrl: string,
    headers: Record<string, string>,
    requestedScope: string,
  ): Promise<string | undefined> {
    const safeRequested = requestedScope.replace(/\^/g, "").trim();
    if (!safeRequested) {
      return undefined;
    }

    const url = buildServiceNowTableApiUrl(instanceUrl, "sys_scope", {
      queryParams: {
        sysparm_fields: "sys_id,scope,name",
        sysparm_limit: 25,
        sysparm_query: [
          `scope=${safeRequested}`,
          `name=${safeRequested}`,
          `sys_id=${safeRequested}`,
          `scopeLIKE${safeRequested}`,
          `nameLIKE${safeRequested}`,
        ].join("^OR"),
      },
    });

    const response = await this.fetchApi(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const result = await this.parseApiResponseArray(response);
    if (!result || result.length === 0) {
      return undefined;
    }

    const requestedLower = safeRequested.toLowerCase();
    const requestedCanonical = this.toScopeCanonicalKey(safeRequested);

    for (const item of result) {
      const record = item as Record<string, unknown>;
      const sysId = this.normalizeScopeValue(record.sys_id);
      const scope = this.normalizeScopeValue(record.scope);
      const name = this.normalizeScopeValue(record.name);
      if (!sysId) {
        continue;
      }

      const candidates = [sysId, scope, name].filter((value): value is string =>
        Boolean(value),
      );

      if (
        candidates.some(
          (candidate) => candidate.toLowerCase() === requestedLower,
        )
      ) {
        return sysId;
      }

      if (
        requestedCanonical &&
        candidates
          .map((candidate) => this.toScopeCanonicalKey(candidate))
          .includes(requestedCanonical)
      ) {
        return sysId;
      }
    }

    return undefined;
  }

  private async getCurrentScopeFromScriptsPage(
    instanceUrl: string,
    headers: Record<string, string>,
  ): Promise<SnBackgroundScriptScopeOption | undefined> {
    const html = await this.fetchScriptsPage(instanceUrl, headers);
    return this.extractCurrentScopeFromHtml(html);
  }

  private async fetchScriptsPage(
    instanceUrl: string,
    headers: Record<string, string>,
  ): Promise<string> {
    const response = await this.fetchApi(
      `${instanceUrl}${SN_SYNC_SERVICENOW.BACKGROUND_SCRIPT_PATH}`,
      {
        method: "GET",
        headers: {
          ...headers,
        },
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

    return response.text();
  }

  private async tryGetAllScopes(
    instanceUrl: string,
    headers: Record<string, string>,
  ): Promise<SnBackgroundScriptScopeOption[]> {
    const url = buildServiceNowTableApiUrl(instanceUrl, "sys_scope", {
      queryParams: {
        sysparm_fields: "scope,name",
        sysparm_limit: 10000,
        sysparm_query: "scopeISNOTEMPTY^ORDERBYname",
      },
    });

    const response = await this.fetchApi(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });

    if (!response.ok) {
      return [];
    }

    const result = await this.parseApiResponseArray(response);
    if (!result) {
      return [];
    }

    const scopes: SnBackgroundScriptScopeOption[] = [];
    for (const item of result) {
      const record = item as Record<string, unknown>;
      const id = this.normalizeScopeValue(record.scope);
      if (!id) {
        continue;
      }

      const name = this.normalizeScopeValue(record.name);
      scopes.push({
        id,
        label: name as string,
      });
    }

    return scopes;
  }

  private async warmSession(
    instanceUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const warmupUrl = `${instanceUrl}/api/now/v2/table/sys_user?sysparm_limit=1&sysparm_fields=sys_id`;
    await this.fetchApi(warmupUrl, {
      method: "GET",
      headers: {
        ...headers,
      },
    });
  }

  private extractCkTokenFromInput(html: string): string | undefined {
    const inputTagPattern = /<input\b[^>]*>/gi;
    let inputMatch = inputTagPattern.exec(html);

    while (inputMatch) {
      const attrs = this.parseTagAttributes(inputMatch[0]);
      if (attrs.name.toLowerCase() === "sysparm_ck") {
        return attrs.value;
      }

      inputMatch = inputTagPattern.exec(html);
    }

    return undefined;
  }

  private extractScopeOptionsFromHtml(
    html: string,
  ): Array<{ value: string; label: string }> {
    const selectMatch = html.match(
      /<select\b[^>]*name=["']sys_scope["'][^>]*>([\s\S]*?)<\/select>/i,
    );
    if (!selectMatch?.[1]) {
      return [];
    }

    const selectInnerHtml = selectMatch[1];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch = optionPattern.exec(selectInnerHtml);
    const options: Array<{ value: string; label: string }> = [];

    while (optionMatch) {
      const attrs = this.parseTagAttributes(`<option ${optionMatch[1]}>`);
      const value = attrs.value.trim();
      const label = this.decodeHtml(optionMatch[2]).trim();
      if (value) {
        options.push({ value, label });
      }

      optionMatch = optionPattern.exec(selectInnerHtml);
    }

    return options;
  }

  private parseTagAttributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrPattern =
      /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>=]+)))?/g;

    let match = attrPattern.exec(tag);
    while (match) {
      const [, name, dq, sq, uq] = match;
      if (name.toLowerCase() !== "input") {
        attributes[name.toLowerCase()] = dq || sq || uq || "";
      }

      match = attrPattern.exec(tag);
    }

    return attributes;
  }

  private extractCurrentScopeFromHtml(
    html: string,
  ): SnBackgroundScriptScopeOption | undefined {
    const selectMatch = html.match(
      /<select\b[^>]*name=["']sys_scope["'][^>]*>([\s\S]*?)<\/select>/i,
    );
    if (!selectMatch?.[1]) {
      return undefined;
    }

    const optionsHtml = selectMatch[1];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch = optionPattern.exec(optionsHtml);
    while (optionMatch) {
      const attrs = this.parseTagAttributes(`<option ${optionMatch[1]}>`);
      const isSelected =
        /\bselected\b/i.test(optionMatch[1]) || attrs.selected !== undefined;
      if (isSelected) {
        const id = this.normalizeScopeValue(attrs.value);
        if (id) {
          const label = this.decodeHtml(optionMatch[2]).trim();
          return { id, label };
        }
      }

      optionMatch = optionPattern.exec(optionsHtml);
    }

    return undefined;
  }

  private async parseApiResponseArray(
    response: Response,
  ): Promise<unknown[] | undefined> {
    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as { result?: unknown };
    } catch {
      return undefined;
    }

    const result = (payload as { result?: unknown })?.result;
    return result as unknown[] | undefined;
  }

  private normalizeScopeValue(value: unknown): string | undefined {
    return normalizeOptionalString(value);
  }
}
