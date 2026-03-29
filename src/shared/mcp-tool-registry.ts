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
    description: "Navigate the active tab to a URL (Tool Hub: Go to URL).",
    inputSchema: schemaWithSession(
      {
        url: { type: "string", description: "Absolute or resolvable URL" },
      },
      ["url"],
    ),
  },
  {
    name: "butcher_go_back",
    description: "History back in the active tab.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_go_forward",
    description: "History forward in the active tab.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_reload",
    description: "Reload the active tab.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_get_url",
    description: "Return the current page URL.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_get_title",
    description: "Return the current page title.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_list_tabs",
    description: "List open tabs with ids and URLs.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_tab_cycle",
    description: "Cycle to the next tab in the current session.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_new_tab",
    description: "Open a new tab (optional URL).",
    inputSchema: schemaWithSession({
      url: { type: "string", description: "Optional URL to load in the new tab" },
    }),
  },
  {
    name: "butcher_switch_tab",
    description: "Switch active tab by numeric tab id.",
    inputSchema: schemaWithSession(
      {
        tabId: { type: "integer", description: "Tab id (see list_tabs)" },
      },
      ["tabId"],
    ),
  },
  {
    name: "butcher_close_tab",
    description: "Close a tab (current tab if tabId omitted).",
    inputSchema: schemaWithSession({
      tabId: { type: "integer", description: "Optional tab id to close" },
    }),
  },
  {
    name: "butcher_click",
    description:
      "Click an element matched by CSS selector. For items from cross-origin iframes (see interactables `guestFrame`), pass guestProcessId and guestRoutingId from the suggested line.",
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
    description: "Fill an input or textarea with text.",
    inputSchema: schemaWithSession(
      {
        selector: { type: "string", description: "CSS selector" },
        value: { type: "string", description: "Value to set" },
      },
      ["selector", "value"],
    ),
  },
  {
    name: "butcher_type",
    description: "Type text into the focused field or a specific selector.",
    inputSchema: schemaWithSession(
      {
        text: { type: "string", description: "Text to type" },
        selector: { type: "string", description: "Optional CSS selector (type into)" },
      },
      ["text"],
    ),
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
    description: "Press and hold an element for a duration.",
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
    description: "Capture viewport or full-page screenshot (may return large payload; truncated in MCP responses).",
    inputSchema: schemaWithSession({
      mode: { type: "string", enum: ["viewport", "full"], description: "Capture mode" },
    }),
  },
  {
    name: "butcher_viewport_markdown",
    description: "Extract markdown representation of the visible viewport.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_form_schema",
    description: "Describe detected form fields on the page.",
    inputSchema: schemaWithSession({}),
  },
  {
    name: "butcher_interactables",
    description: "List clickable / input elements (limit optional).",
    inputSchema: schemaWithSession({
      limit: { type: "integer", minimum: 1, maximum: 400, description: "Max rows" },
    }),
  },
  {
    name: "butcher_create_session",
    description: "Create a new browser session (headless or windowed).",
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
    description:
      "Advanced: run a raw AutomationCommand object (same schema as chat automation). Prefer named tools when possible.",
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

export const MCP_TOOL_NAMES = MCP_TOOL_DEFINITIONS.map((t) => t.name);

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
        return { kind: "action", op: "goto", url, ...(sid ? { sessionId: sid } : {}) };
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
export function sanitizeAutomationResultForMcp(result: AutomationResult): AutomationResult {
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
