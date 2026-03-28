/**
 * Build LLM tool definitions and route execution (Butcher in-process vs external MCP via IPC).
 */

import type { AutomationCommand, AutomationResult } from "../../shared/automation-types";
import {
  MCP_TOOL_DEFINITIONS,
  automationCommandFromMcpTool,
  sanitizeAutomationResultForMcp,
} from "../../shared/mcp-tool-registry";
import type { McpServerConfigPayload } from "../../shared/mcp-external-types";
import type { IntelligentSettingsState, WorkspaceMcpToggles } from "../state/session-settings-store";
import { BUTCHER_BUILTIN_MCP_ID } from "../state/session-settings-store";
import type { ChatScope } from "../chat/conversation-store";
import type { ElectronApi } from "../../shared/ipc-types";

export type OpenAiToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function togglesForScope(settings: IntelligentSettingsState, scope: ChatScope): WorkspaceMcpToggles {
  return scope === "browser" ? settings.mcpTogglesBrowser : settings.mcpTogglesIntelligent;
}

function isConnectionEnabled(toggles: WorkspaceMcpToggles, mcpId: string): boolean {
  const v = toggles.connectionEnabled[mcpId];
  return v !== false;
}

function isToolEnabled(toggles: WorkspaceMcpToggles, mcpId: string, toolName: string): boolean {
  const per = toggles.toolEnabled[mcpId];
  if (!per) return true;
  const v = per[toolName];
  return v !== false;
}

export function filterButcherTools(settings: IntelligentSettingsState, scope: ChatScope): typeof MCP_TOOL_DEFINITIONS {
  const t = togglesForScope(settings, scope);
  const butcherOn = scope === "browser" ? true : isConnectionEnabled(t, BUTCHER_BUILTIN_MCP_ID);
  if (!butcherOn) return [];
  return MCP_TOOL_DEFINITIONS.filter((d) => isToolEnabled(t, BUTCHER_BUILTIN_MCP_ID, d.name));
}

export function butcherToolsToOpenAi(defs: typeof MCP_TOOL_DEFINITIONS): OpenAiToolDef[] {
  return defs.map((d) => ({
    type: "function",
    function: {
      name: d.name,
      description: d.description,
      parameters: d.inputSchema as Record<string, unknown>,
    },
  }));
}

/** Gemini API function declarations shape. */
export function butcherToolsToGemini(defs: typeof MCP_TOOL_DEFINITIONS): Array<{
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}> {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    parametersJsonSchema: d.inputSchema as Record<string, unknown>,
  }));
}

export type ToolDispatch =
  | { kind: "butcher"; name: string }
  | { kind: "external"; server: McpServerConfigPayload; toolName: string };

/** OpenAI-compatible function names: letters, digits, underscore, hyphen. */
export function sanitizeOpenAiToolFunctionName(raw: string): string {
  const s = raw
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^-+|-+$/g, "")
    .replace(/^_|_$/g, "");
  return s.length > 0 ? s : "tool";
}

/**
 * Pick a unique OpenAI function name for an external MCP tool: prefer the sanitized tool name,
 * then `displayName_toolName`, then include `server.id`, then numeric suffixes.
 * Exported for unit tests.
 */
export function allocateExternalOpenAiFunctionName(
  used: Set<string>,
  server: McpServerConfigPayload,
  toolName: string,
): string {
  const label = server.name.trim() || server.id;
  const base = sanitizeOpenAiToolFunctionName(toolName);
  if (!used.has(base)) return base;

  const prefixed = sanitizeOpenAiToolFunctionName(`${label}_${toolName}`);
  if (!used.has(prefixed)) return prefixed;

  const withId = sanitizeOpenAiToolFunctionName(`${label}_${server.id}_${toolName}`);
  if (!used.has(withId)) return withId;

  let n = 2;
  let candidate = `${withId}_${n}`;
  while (used.has(candidate)) {
    n++;
    candidate = `${withId}_${n}`;
  }
  return candidate;
}

/** Build OpenAI tool list + resolver for model function names. */
export function buildToolDispatchMap(
  butcherDefs: typeof MCP_TOOL_DEFINITIONS,
  external: Array<{ server: McpServerConfigPayload; tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }>,
): { openAiTools: OpenAiToolDef[]; dispatch: (fn: string) => ToolDispatch | null } {
  const map = new Map<string, ToolDispatch>();
  const openAiTools: OpenAiToolDef[] = [];
  const usedNames = new Set<string>();

  for (const d of butcherDefs) {
    usedNames.add(d.name);
    map.set(d.name, { kind: "butcher", name: d.name });
    openAiTools.push({
      type: "function",
      function: {
        name: d.name,
        description: d.description,
        parameters: d.inputSchema as Record<string, unknown>,
      },
    });
  }

  for (const { server, tools } of external) {
    for (const t of tools) {
      const fn = allocateExternalOpenAiFunctionName(usedNames, server, t.name);
      usedNames.add(fn);
      map.set(fn, { kind: "external", server, toolName: t.name });
      openAiTools.push({
        type: "function",
        function: {
          name: fn,
          description: `${server.name || server.id}: ${t.description ?? t.name}`,
          parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
        },
      });
    }
  }

  return {
    openAiTools,
    dispatch: (fn: string) => map.get(fn) ?? null,
  };
}

export async function executeButcherTool(
  name: string,
  args: unknown,
  runCmd: (cmd: AutomationCommand) => Promise<AutomationResult>,
): Promise<string> {
  const cmdOrErr = automationCommandFromMcpTool(name, args);
  if (cmdOrErr instanceof Error) return JSON.stringify({ error: cmdOrErr.message });
  const result = await runCmd(cmdOrErr);
  const sanitized = sanitizeAutomationResultForMcp(result);
  return JSON.stringify(sanitized);
}

export async function executeExternalTool(
  api: ElectronApi,
  server: McpServerConfigPayload,
  toolName: string,
  args: unknown,
): Promise<string> {
  const r = await api.mcpExternalCallTool(server, toolName, args);
  return JSON.stringify(r);
}
