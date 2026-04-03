/**
 * MCP tool definitions for Butcher browser automation (Tool Hub parity).
 * Maps stable butcher_* names to AutomationCommand.
 */

import type { AutomationCommand, AutomationResult } from "./automation-types";

export type McpToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object for input (MCP tools/call arguments) */
  inputSchema: Record<string, unknown>;
};

const sessionProps = {
  sessionId: {
    type: "string",
    description: "Optional session id (e.g. s_abc123). Uses active session when omitted.",
  },
} as const;

function schemaWithSession(
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties: { ...properties, ...sessionProps },
    required: required ?? [],
    additionalProperties: false,
  };
}

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "butcher_navigate",
    description:
      "Navigate the active tab to a URL. Waits for the main document to finish loading by default; optional network-quiet wait for SPAs.",
    inputSchema: schemaWithSession(
      {
        url: { type: "string", description: "Absolute or resolvable URL" },
        waitUntil: {
          type: "string",
          enum: ["commit", "domcontentloaded", "load", "networkidle"],
          description:
            "When to resolve: load (default) = main frame loaded; domcontentloaded = DOM ready; networkidle = after load, no navigation burst for networkIdleMs; commit = return immediately after starting navigation.",
        },
        timeoutMs: {
          type: "integer",
          minimum: 3000,
          maximum: 120000,
          description: "Max wait in ms for the chosen waitUntil phase (default 60000).",
        },
        networkIdleMs: {
          type: "integer",
          minimum: 100,
          maximum: 10000,
          description: "For networkidle: ms with no load burst before success (default 500).",
        },
      },
      ["url"],
    ),
  },
  {
    name: "butcher_go_back",
    description: "Go back in tab history.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_go_forward",
    description: "Go forward in tab history.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_reload",
    description: "Reload the active tab.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_get_url",
    description: "Get the current page URL.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_get_title",
    description: "Get the current page title.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_list_tabs",
    description: "List open tabs with ids and URLs.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_tab_cycle",
    description: "Cycle to the next tab in the session.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_new_tab",
    description: "Open a new tab.",
    inputSchema: schemaWithSession({
      url: { type: "string", description: "Optional URL to load in the new tab" },
    }),
  },
  {
    name: "butcher_switch_tab",
    description: "Switch to a tab by id.",
    inputSchema: schemaWithSession(
      {
        tabId: { type: "integer", description: "Tab id (see list_tabs)" },
      },
      ["tabId"],
    ),
  },
  {
    name: "butcher_close_tab",
    description: "Close a tab (or the current tab).",
    inputSchema: schemaWithSession({
      tabId: { type: "integer", description: "Optional tab id to close" },
    }),
  },
  {
    name: "butcher_click",
    description: "Click an element by selector.",
    inputSchema: schemaWithSession(
      {
        selector: { type: "string", description: "CSS selector for the element" },
        guestProcessId: {
          type: "integer",
          description: "Optional: Chromium frame process id from interactables (iframe clicks)",
        },
        guestRoutingId: {
          type: "integer",
          description: "Optional: Chromium frame routing id from interactables (iframe clicks)",
        },
      },
      ["selector"],
    ),
  },
  {
    name: "butcher_fill",
    description: "Fill an input or textarea.",
    inputSchema: schemaWithSession(
      {
        selector: { type: "string", description: "CSS selector" },
        value: { type: "string", description: "Value to set" },
      },
      ["selector", "value"],
    ),
  },
  {
    name: "butcher_select",
    description: "Select an option in native or custom dropdowns using label, value, index, or path.",
    inputSchema: schemaWithSession(
      {
        selector: {
          type: "string",
          description:
            "CSS selector or visible label/control text identifying the dropdown trigger (not only select elements).",
        },
        by: {
          type: "string",
          enum: ["label", "value", "index", "path"],
          description: "How to choose the option: label, value, index, or path for nested menus.",
        },
        value: {
          oneOf: [{ type: "string" }, { type: "integer" }],
          description:
            "Choice to apply: string for label, value, or path (use > between levels); integer for index when by is index.",
        },
      },
      ["selector", "by", "value"],
    ),
  },
  {
    name: "butcher_type",
    description: "Type text into a field.",
    inputSchema: schemaWithSession(
      {
        text: { type: "string", description: "Text to type" },
        selector: { type: "string", description: "Optional CSS selector (type into)" },
      },
      ["text"],
    ),
  },
  {
    name: "butcher_run_js",
    description: "Run JavaScript in the active page context and return the result.",
    inputSchema: schemaWithSession(
      {
        script: { type: "string", description: "JavaScript function body to execute in the page context." },
        args: { description: "Optional JSON-serializable value passed into script as `args`." },
        timeoutMs: { type: "integer", minimum: 200, maximum: 30000, description: "Optional timeout in milliseconds." },
      },
      ["script"],
    ),
  },
  {
    name: "intelligent_browser_search",
    description: "Search the web and return heading, url, and snippet results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text." },
        max_results: { type: "integer", minimum: 1, maximum: 5, description: "Maximum results to return (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "intelligent_scientific_calculate",
    description:
      "Calculator: mathjs expression with + − * / ^, parentheses, sqrt, nthRoot/nroot, sin/cos/tan (radians), inverse trig asin/acos/atan/atan2, exp, constants pi and e, ln (natural), log (natural; use log(x,b) or log10/log2 for other bases). Examples: {\"expression\":\"sin(pi/2)\"}, {\"expression\":\"ln(e)\"}, {\"expression\":\"log10(100)\"}, {\"expression\":\"2^10\"}.",
    inputSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression (see tool description)." },
        precision: { type: "integer", minimum: 16, maximum: 256, description: "Optional BigNumber precision (default 64)." },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "butcher_scroll",
    description: "Scroll the page up or down.",
    inputSchema: schemaWithSession(
      {
        direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
        amount: { type: "number", description: "Optional scroll amount (implementation-specific)" },
      },
      ["direction"],
    ),
  },
  {
    name: "butcher_wait_ms",
    description: "Wait for a duration in milliseconds.",
    inputSchema: schemaWithSession(
      {
        ms: { type: "integer", minimum: 0, description: "Milliseconds to wait" },
      },
      ["ms"],
    ),
  },
  {
    name: "butcher_press_hold",
    description: "Press and hold an element.",
    inputSchema: schemaWithSession(
      {
        selector: { type: "string", description: "CSS selector" },
        holdMs: { type: "integer", minimum: 1, description: "Hold duration in ms" },
      },
      ["selector", "holdMs"],
    ),
  },
  {
    name: "butcher_screenshot",
    description: "Capture a viewport or full-page screenshot.",
    inputSchema: schemaWithSession({
      mode: { type: "string", enum: ["viewport", "full"], description: "Capture mode" },
    }),
  },
  {
    name: "butcher_viewport_markdown",
    description: "Extract markdown from the visible viewport.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_form_schema",
    description: "Describe detected form fields on the page.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_interactables",
    description: "List interactive page elements with selectors and tool hints.",
    inputSchema: schemaWithSession({
      limit: { type: "integer", minimum: 1, maximum: 400, description: "Max rows" },
    }),
  },
  {
    name: "butcher_create_session",
    description: "Create a new browser session.",
    inputSchema: {
      type: "object",
      properties: {
        headless: { type: "boolean", description: "Run session headless" },
      },
      required: ["headless"],
      additionalProperties: false,
    },
  },
  {
    name: "butcher_kill_session",
    description: "Close a session by id.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session id to kill" },
      },
      required: ["sessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "butcher_run_automation_command",
    description: "Run a raw AutomationCommand object.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "object", description: "AutomationCommand JSON" },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

export const MCP_BROWSER_TOOL_DEFINITIONS = MCP_TOOL_DEFINITIONS.filter((t) => t.name.startsWith("butcher_"));
export const MCP_INTELLIGENT_TOOL_DEFINITIONS = MCP_TOOL_DEFINITIONS.filter((t) =>
  t.name.startsWith("intelligent_"),
);
export const MCP_TOOL_NAMES = MCP_TOOL_DEFINITIONS.map((t) => t.name);
export const MCP_BROWSER_TOOL_NAMES = MCP_BROWSER_TOOL_DEFINITIONS.map((t) => t.name);
export const MCP_INTELLIGENT_TOOL_NAMES = MCP_INTELLIGENT_TOOL_DEFINITIONS.map((t) => t.name);

type JsonRecord = Record<string, unknown>;

function pickSessionId(args: JsonRecord): string | undefined {
  const s = args.sessionId;
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

/**
 * Build AutomationCommand from MCP tool name + arguments. Returns Error if invalid.
 */
export function automationCommandFromMcpTool(name: string, args: unknown): AutomationCommand | Error {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return new Error("arguments must be an object");
  }
  const a = args as JsonRecord;
  const sid = pickSessionId(a);

  try {
    switch (name) {
      case "butcher_navigate": {
        const url = String(a.url ?? "").trim();
        if (!url) return new Error("url required");
        const wu = a.waitUntil != null ? String(a.waitUntil).trim() : undefined;
        const allowed = new Set(["commit", "domcontentloaded", "load", "networkidle"]);
        if (wu && !allowed.has(wu)) return new Error("waitUntil must be commit, domcontentloaded, load, or networkidle");
        const timeoutMs =
          a.timeoutMs != null && Number.isFinite(Number(a.timeoutMs)) ? Math.floor(Number(a.timeoutMs)) : undefined;
        const networkIdleMs =
          a.networkIdleMs != null && Number.isFinite(Number(a.networkIdleMs))
            ? Math.floor(Number(a.networkIdleMs))
            : undefined;
        return {
          kind: "action",
          op: "goto",
          url,
          ...(wu ? { waitUntil: wu as "commit" | "domcontentloaded" | "load" | "networkidle" } : {}),
          ...(timeoutMs != null ? { timeoutMs } : {}),
          ...(networkIdleMs != null ? { networkIdleMs } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_go_back":
        return { kind: "action", op: "back", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_go_forward":
        return { kind: "action", op: "forward", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_reload":
        return { kind: "action", op: "reload", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_get_url":
        return { kind: "info", op: "get_url", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_get_title":
        return { kind: "info", op: "get_title", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_list_tabs":
        return { kind: "info", op: "list_tabs", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_tab_cycle":
        return { kind: "action", op: "tab", action: "cycle", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_new_tab": {
        const url = a.url != null ? String(a.url).trim() : undefined;
        return { kind: "action", op: "new_tab", ...(url ? { url } : {}), ...(sid ? { sessionId: sid } : {}) };
      }
      case "butcher_switch_tab": {
        const tabId = Number(a.tabId);
        if (!Number.isFinite(tabId)) return new Error("tabId must be a number");
        return { kind: "action", op: "switch_tab", tabId, ...(sid ? { sessionId: sid } : {}) };
      }
      case "butcher_close_tab": {
        const tabId = a.tabId != null ? Number(a.tabId) : undefined;
        if (tabId != null && !Number.isFinite(tabId)) return new Error("tabId invalid");
        return {
          kind: "action",
          op: "close_tab",
          ...(tabId != null && Number.isFinite(tabId) ? { tabId } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_click": {
        const target = String(a.selector ?? "").trim();
        if (!target) return new Error("selector required");
        const gp = a.guestProcessId != null ? Number(a.guestProcessId) : undefined;
        const gr = a.guestRoutingId != null ? Number(a.guestRoutingId) : undefined;
        const guestFrame =
          gp != null && gr != null && Number.isFinite(gp) && Number.isFinite(gr)
            ? { processId: gp, routingId: gr }
            : undefined;
        return {
          kind: "action",
          op: "click",
          target,
          ...(guestFrame ? { guestFrame } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_fill": {
        const selector = String(a.selector ?? "").trim();
        const value = String(a.value ?? "");
        if (!selector) return new Error("selector required");
        return { kind: "action", op: "fill", selector, value, ...(sid ? { sessionId: sid } : {}) };
      }
      case "butcher_select": {
        const selector = String(a.selector ?? "").trim();
        if (!selector) return new Error("selector required");
        const byRaw = String(a.by ?? "").toLowerCase();
        if (byRaw !== "label" && byRaw !== "value" && byRaw !== "index" && byRaw !== "path") {
          return new Error("by must be label, value, index, or path");
        }
        const by = byRaw as "label" | "value" | "index" | "path";
        if (by === "index") {
          const idx = typeof a.value === "number" ? a.value : Number(a.value);
          if (!Number.isFinite(idx)) return new Error("value must be a number when by is index");
          return {
            kind: "action",
            op: "select",
            selector,
            by: "index",
            value: Math.floor(idx),
            ...(sid ? { sessionId: sid } : {}),
          };
        }
        const strVal = a.value == null ? "" : String(a.value);
        if ((by === "label" || by === "path") && !strVal.trim()) {
          return new Error("value required (non-empty string for label or path)");
        }
        return {
          kind: "action",
          op: "select",
          selector,
          by,
          value: strVal,
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_type": {
        const text = String(a.text ?? "");
        const selector = a.selector != null ? String(a.selector).trim() : undefined;
        return {
          kind: "action",
          op: "type",
          text,
          ...(selector ? { selector } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "intelligent_browser_search": {
        const query = String(a.query ?? "").trim();
        if (!query) return new Error("query required");
        const limitRaw = a.max_results != null ? Number(a.max_results) : undefined;
        if (limitRaw != null && !Number.isFinite(limitRaw)) return new Error("limit must be a number");
        const limit = limitRaw != null ? Math.max(1, Math.min(5, Math.floor(limitRaw))) : undefined;
        return { kind: "info", op: "browser_search", query, ...(limit != null ? { limit } : {}) };
      }
      case "intelligent_scientific_calculate": {
        const expression = String(a.expression ?? "").trim();
        if (!expression) return new Error("expression required");
        const precisionRaw = a.precision != null ? Number(a.precision) : undefined;
        if (precisionRaw != null && !Number.isFinite(precisionRaw)) return new Error("precision must be a number");
        const precision = precisionRaw != null ? Math.floor(precisionRaw) : undefined;
        return {
          kind: "info",
          op: "scientific_calc",
          expression,
          ...(precision != null ? { precision } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_run_js": {
        const script = String(a.script ?? "");
        if (!script.trim()) return new Error("script required");
        const timeoutMsRaw = a.timeoutMs != null ? Number(a.timeoutMs) : undefined;
        if (timeoutMsRaw != null && !Number.isFinite(timeoutMsRaw)) return new Error("timeoutMs must be a number");
        const timeoutMs = timeoutMsRaw != null ? Math.floor(timeoutMsRaw) : undefined;
        return {
          kind: "action",
          op: "run_js",
          script,
          ...(a.args !== undefined ? { args: a.args } : {}),
          ...(timeoutMs != null ? { timeoutMs } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_scroll": {
        const direction = a.direction === "up" || a.direction === "down" ? a.direction : null;
        if (!direction) return new Error("direction must be up or down");
        const amount = a.amount != null ? Number(a.amount) : undefined;
        return {
          kind: "action",
          op: "scroll",
          direction,
          ...(amount != null && Number.isFinite(amount) ? { amount } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_wait_ms": {
        const ms = Math.floor(Number(a.ms));
        if (!Number.isFinite(ms) || ms < 0) return new Error("ms must be a non-negative number");
        return { kind: "action", op: "wait_ms", ms, ...(sid ? { sessionId: sid } : {}) };
      }
      case "butcher_press_hold": {
        const selector = String(a.selector ?? "").trim();
        const holdMs = Math.floor(Number(a.holdMs));
        if (!selector) return new Error("selector required");
        if (!Number.isFinite(holdMs) || holdMs < 1) return new Error("holdMs invalid");
        return { kind: "action", op: "press", selector, holdMs, ...(sid ? { sessionId: sid } : {}) };
      }
      case "butcher_screenshot": {
        const mode = a.mode === "full" || a.mode === "viewport" ? a.mode : undefined;
        return {
          kind: "action",
          op: "screenshot",
          ...(mode ? { mode } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_viewport_markdown":
        return { kind: "info", op: "get_viewport_md", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_form_schema":
        return { kind: "info", op: "get_form_schema", ...(sid ? { sessionId: sid } : {}) };
      case "butcher_interactables": {
        const limit = a.limit != null ? Math.floor(Number(a.limit)) : undefined;
        return {
          kind: "info",
          op: "get_interactables",
          ...(limit != null && Number.isFinite(limit) ? { limit } : {}),
          ...(sid ? { sessionId: sid } : {}),
        };
      }
      case "butcher_create_session": {
        const headless = Boolean(a.headless);
        return { kind: "action", op: "session", headless };
      }
      case "butcher_kill_session": {
        const sessionId = String(a.sessionId ?? "").trim();
        if (!sessionId) return new Error("sessionId required");
        return { kind: "action", op: "kill_session", sessionId };
      }
      case "butcher_run_automation_command": {
        const cmd = a.command;
        if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) return new Error("command must be object");
        return cmd as AutomationCommand;
      }
      default:
        return new Error(`unknown tool: ${name}`);
    }
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

const MAX_DATA_URL_CHARS = 120_000;

/**
 * Shrink screenshot data URLs for JSON-RPC / MCP responses.
 */
export function sanitizeAutomationResultForMcp(result: AutomationResult): unknown {
  if (result.op === "get_interactables") {
    return {
      op: "get_interactables",
      success: !!result.success,
      message: String(result.message ?? ""),
      ...(result.success ? {} : { error: String(result.error ?? "interactables_failed") }),
    };
  }
  if (result.op === "browser_search") {
    const d = (result.data ?? {}) as Record<string, unknown>;
    const query = typeof d.query === "string" ? d.query : "";
    const results = Array.isArray(d.results)
      ? d.results.map((r) => {
          const row = (r ?? {}) as Record<string, unknown>;
          return {
            heading: String(row.heading ?? ""),
            url: String(row.url ?? ""),
            snippet: String(row.snippet ?? ""),
          };
        })
      : [];
    const resultsCountRaw = d.results_count;
    const results_count =
      typeof resultsCountRaw === "number" && Number.isFinite(resultsCountRaw)
        ? Math.max(0, Math.floor(resultsCountRaw))
        : results.length;
    return {
      success: !!result.success,
      query,
      results_count,
      results,
      ...(result.success ? {} : { error: String(result.error ?? "search_failed") }),
    };
  }
  if (result.op === "scientific_calc") {
    const d = (result.data ?? {}) as Record<string, unknown>;
    return {
      success: !!result.success,
      expression: String(d.expression ?? ""),
      ...(d.result != null ? { result: String(d.result) } : {}),
      ...(result.success ? {} : { error: String(result.error ?? d.error ?? "scientific_calc_failed") }),
    };
  }

  if (!result.artifacts?.length) return result;
  const artifacts = result.artifacts.map((art) => {
    if (art.type !== "screenshot" || !art.dataUrl) return art;
    const len = art.dataUrl.length;
    if (len <= MAX_DATA_URL_CHARS) return art;
    return {
      type: "screenshot" as const,
      dataUrl: `${art.dataUrl.slice(0, 256)}… [truncated ${len} chars total; use smaller viewport or avoid screenshot tool for full data]`,
    };
  });
  return { ...result, artifacts };
}
