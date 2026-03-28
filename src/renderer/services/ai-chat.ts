/**
 * Multi-turn chat with tool execution via OpenAI-compatible Chat Completions (incl. Gemini compat endpoint).
 */

import type { AutomationCommand, AutomationResult } from "../../shared/automation-types";
import type { McpServerConfigPayload } from "../../shared/mcp-external-types";
import type { ChatMessageV2, ChatScope } from "../chat/conversation-store";
import { generateMessageId } from "../chat/conversation-ids";
import {
  type IntelligentSettingsState,
  mcpServerHasConnectionParams,
  mcpServerToPayload,
} from "../state/session-settings-store";
import {
  buildToolDispatchMap,
  executeButcherTool,
  executeExternalTool,
  filterButcherTools,
  togglesForScope,
} from "./ai-tools";
import type { ElectronApi } from "../../shared/ipc-types";
import { systemPromptForWorkspace } from "./ai-system-prompts";

export type ChatStreamEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; toolCallId: string }
  | { type: "tool_end"; name: string; toolCallId: string; resultPreview: string; fullResult: string }
  | { type: "error"; message: string }
  | { type: "done" };

type OpenAiMsg =
  | { role: "system" | "user" | "assistant"; content: string | null }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  /** Gemini OpenAI-compat requires non-empty function name on tool results. */
  | { role: "tool"; tool_call_id: string; name: string; content: string };

function nonEmptyToolName(raw: string): string {
  const t = (raw || "").trim();
  return t.length > 0 ? t : "unknown_tool";
}

/** OpenAI-compatible streams: reasoning / thinking may appear under several delta keys (OpenRouter, o-series, etc.). */
function extractThinkingDelta(d: Record<string, unknown>): string {
  let out = "";
  for (const k of ["reasoning", "reasoning_content", "thinking", "thought"] as const) {
    const v = d[k];
    if (typeof v === "string" && v.length) out += v;
  }
  return out;
}

type ToolMsgV2 = Extract<ChatMessageV2, { role: "tool" }>;

function collectContiguousTools(messages: ChatMessageV2[], start: number): { tools: ToolMsgV2[]; end: number } {
  const tools: ToolMsgV2[] = [];
  let j = start;
  while (j < messages.length && messages[j].role === "tool") {
    tools.push(messages[j] as ToolMsgV2);
    j++;
  }
  return { tools, end: j };
}

/**
 * Chat UI persists `[user, tool, tool, …, assistant]` but OpenAI/Gemini require
 * `assistant + tool_calls` before each tool result block. Rebuild that shape here.
 */
function buildOpenAiMessagesFromChatV2(sysContent: string, messages: ChatMessageV2[]): OpenAiMsg[] {
  const oa: OpenAiMsg[] = [{ role: "system", content: sysContent }];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (!m) break;
    if (m.role === "system") {
      i++;
      continue;
    }
    if (m.role === "user") {
      const { tools, end } = collectContiguousTools(messages, i + 1);
      if (tools.length > 0) {
        oa.push({ role: "user", content: m.content });
        oa.push({
          role: "assistant",
          content: null,
          tool_calls: tools.map((t) => ({
            id: t.toolCallId,
            type: "function" as const,
            function: { name: nonEmptyToolName(t.name), arguments: "{}" },
          })),
        });
        for (const t of tools) {
          oa.push({
            role: "tool",
            tool_call_id: t.toolCallId,
            name: nonEmptyToolName(t.name),
            content: t.content,
          });
        }
        i = end;
        continue;
      }
      oa.push({ role: "user", content: m.content });
      i++;
      continue;
    }
    if (m.role === "assistant") {
      const { tools, end } = collectContiguousTools(messages, i + 1);
      const text = (m.content || "").trim();
      if (tools.length > 0) {
        oa.push({
          role: "assistant",
          content: text.length > 0 ? m.content : null,
          tool_calls: tools.map((t) => ({
            id: t.toolCallId,
            type: "function" as const,
            function: { name: nonEmptyToolName(t.name), arguments: "{}" },
          })),
        });
        for (const t of tools) {
          oa.push({
            role: "tool",
            tool_call_id: t.toolCallId,
            name: nonEmptyToolName(t.name),
            content: t.content,
          });
        }
        i = end;
        continue;
      }
      oa.push({ role: "assistant", content: m.content });
      i++;
      continue;
    }
    if (m.role === "tool") {
      const { tools, end } = collectContiguousTools(messages, i);
      oa.push({
        role: "assistant",
        content: null,
        tool_calls: tools.map((t) => ({
          id: t.toolCallId,
          type: "function" as const,
          function: { name: nonEmptyToolName(t.name), arguments: "{}" },
        })),
      });
      for (const t of tools) {
        oa.push({
          role: "tool",
          tool_call_id: t.toolCallId,
          name: nonEmptyToolName(t.name),
          content: t.content,
        });
      }
      i = end;
      continue;
    }
    i++;
  }
  return oa;
}

function normalizeOpenAiBase(base: string): string {
  const t = base.trim().replace(/\/+$/, "");
  return t.endsWith("/v1") ? t.slice(0, -3) : t;
}

/** Chat uses normalized base (…/api); OpenAI + OpenRouter need /v1/chat/completions; Gemini compat does not. */
function openAiStyleChatCompletionsUrl(baseUrl: string): string {
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return `${baseUrl}/chat/completions`;
  }
  return `${baseUrl}/v1/chat/completions`;
}

function isConnectionEnabled(settings: IntelligentSettingsState, scope: ChatScope, mcpId: string): boolean {
  const t = togglesForScope(settings, scope);
  return t.connectionEnabled[mcpId] !== false;
}

function isToolEnabled(settings: IntelligentSettingsState, scope: ChatScope, mcpId: string, toolName: string): boolean {
  const t = togglesForScope(settings, scope);
  const per = t.toolEnabled[mcpId];
  if (!per) return true;
  return per[toolName] !== false;
}

async function loadExternalToolGroups(
  api: ElectronApi,
  settings: IntelligentSettingsState,
  scope: ChatScope,
): Promise<
  Array<{
    server: McpServerConfigPayload;
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  }>
> {
  const out: Array<{
    server: McpServerConfigPayload;
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  }> = [];
  for (const s of settings.mcpServers) {
    if (!mcpServerHasConnectionParams(s)) continue;
    if (!isConnectionEnabled(settings, scope, s.id)) continue;
    try {
      const payload = mcpServerToPayload(s);
      const res = await api.mcpExternalListTools(payload);
      if (!res.ok) continue;
      const filtered = res.tools.filter((t) => isToolEnabled(settings, scope, s.id, t.name));
      if (filtered.length) out.push({ server: payload, tools: filtered });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function runAutomationSafe(cmd: AutomationCommand): Promise<AutomationResult> {
  const fn = window.legacyBrowser?.runAutomationCommand;
  if (!fn) throw new Error("Browser bridge not ready");
  return fn(cmd);
}

export async function runAiChatPipeline(opts: {
  scope: ChatScope;
  settings: IntelligentSettingsState;
  api: ElectronApi;
  messages: ChatMessageV2[];
  onEvent: (e: ChatStreamEvent) => void;
  maxToolRounds?: number;
}): Promise<void> {
  const maxRounds = opts.maxToolRounds ?? 8;
  const modelId = opts.settings.selectedModelId.trim();
  if (!modelId) {
    opts.onEvent({ type: "error", message: "Select a model in Settings." });
    opts.onEvent({ type: "done" });
    return;
  }

  const butcherDefs = filterButcherTools(opts.settings, opts.scope);
  const externalGroups =
    opts.scope === "browser" ? [] : await loadExternalToolGroups(opts.api, opts.settings, opts.scope);
  const { openAiTools, dispatch } = buildToolDispatchMap(butcherDefs, externalGroups);

  const provider = opts.settings.aiProvider;
  const baseUrl =
    provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/openai"
      : normalizeOpenAiBase(opts.settings.customBaseUrl || "https://api.openai.com");
  const apiKey = provider === "google" ? opts.settings.googleApiKey.trim() : opts.settings.customApiKey.trim();
  if (!apiKey) {
    opts.onEvent({ type: "error", message: provider === "google" ? "Google API key required." : "API key required." });
    opts.onEvent({ type: "done" });
    return;
  }

  await runOpenAiCompatible(
    { ...opts, api: opts.api },
    modelId,
    baseUrl,
    apiKey,
    openAiTools,
    dispatch,
    maxRounds,
  );
}

async function runOpenAiCompatible(
  opts: {
    scope: ChatScope;
    messages: ChatMessageV2[];
    onEvent: (e: ChatStreamEvent) => void;
    api: ElectronApi;
  },
  modelId: string,
  baseUrl: string,
  apiKey: string,
  openAiTools: ReturnType<typeof buildToolDispatchMap>["openAiTools"],
  dispatch: ReturnType<typeof buildToolDispatchMap>["dispatch"],
  maxRounds: number,
): Promise<void> {
  const sys = systemPromptForWorkspace(opts.scope);
  const oaMessages = buildOpenAiMessagesFromChatV2(sys, opts.messages);

  let rounds = 0;
  while (rounds < maxRounds) {
    rounds++;
    const body: Record<string, unknown> = {
      model: modelId,
      messages: oaMessages,
      stream: true,
    };
    if (openAiTools.length) {
      body.tools = openAiTools;
      body.tool_choice = "auto";
    }

    const url = openAiStyleChatCompletionsUrl(baseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    const bodyStr = JSON.stringify(body);

    let buffer = "";
    let fullAssistant = "";
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

    const processSseLine = (lineRaw: string) => {
      const s = lineRaw.trim();
      if (!s.startsWith("data:")) return;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: Record<string, unknown> & {
              content?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
        const choice = chunk.choices?.[0];
        const d = choice?.delta;
        if (d && typeof d === "object") {
          const content = d.content;
          if (typeof content === "string" && content.length) {
            fullAssistant += content;
            opts.onEvent({ type: "assistant_delta", text: content });
          }
          const thinkingPart = extractThinkingDelta(d);
          if (thinkingPart) opts.onEvent({ type: "thinking", text: thinkingPart });
          const tcalls = d.tool_calls;
          if (Array.isArray(tcalls) && tcalls.length) {
            for (const tc of tcalls) {
              const idx = typeof tc.index === "number" ? tc.index : 0;
              let row = toolCallMap.get(idx);
              if (!row) {
                row = { id: "", name: "", arguments: "" };
                toolCallMap.set(idx, row);
              }
              if (tc.id) row.id = tc.id;
              if (tc.function?.name) row.name = tc.function.name;
              if (tc.function?.arguments) row.arguments += tc.function.arguments;
            }
          }
        }
      } catch {
        /* ignore */
      }
    };

    const feedSseChunk = (text: string) => {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processSseLine(line);
      }
    };

    const proxy = opts.api.aiChatProxyStream;
    if (proxy) {
      try {
        await new Promise<void>((resolve, reject) => {
          proxy(
            { url, headers, body: bodyStr },
            {
              onChunk: feedSseChunk,
              onComplete: () => resolve(),
              onError: (m) => reject(new Error(m)),
            },
          );
        });
      } catch (e) {
        opts.onEvent({ type: "error", message: e instanceof Error ? e.message : String(e) });
        opts.onEvent({ type: "done" });
        return;
      }
    } else {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
      });

      if (!res.ok) {
        const t = await res.text();
        opts.onEvent({ type: "error", message: t || `HTTP ${res.status}` });
        opts.onEvent({ type: "done" });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        opts.onEvent({ type: "error", message: "No response stream" });
        opts.onEvent({ type: "done" });
        return;
      }

      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        feedSseChunk(dec.decode(value, { stream: true }));
      }
    }

    const toolCalls = Array.from(toolCallMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .filter((t) => t.id);

    if (toolCalls.length) {
      const valid = toolCalls.filter((t) => (t.name || "").trim().length > 0);
      if (valid.length === 0) {
        opts.onEvent({
          type: "error",
          message: "Model returned tool calls without function names; cannot run tools.",
        });
        opts.onEvent({ type: "done" });
        return;
      }
      oaMessages.push({
        role: "assistant",
        content: fullAssistant || null,
        tool_calls: valid.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: nonEmptyToolName(t.name), arguments: t.arguments || "{}" },
        })),
      });

      for (const tc of valid) {
        const apiToolName = nonEmptyToolName(tc.name);
        opts.onEvent({ type: "tool_start", name: apiToolName, toolCallId: tc.id });
        let args: unknown = {};
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          args = {};
        }
        const ref = dispatch(tc.name);
        let resultText = "";
        try {
          if (!ref) throw new Error("Unknown tool");
          if (ref.kind === "butcher") {
            resultText = await executeButcherTool(ref.name, args, runAutomationSafe);
          } else {
            resultText = await executeExternalTool(opts.api, ref.server, ref.toolName, args);
          }
        } catch (e) {
          resultText = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
        }
        opts.onEvent({
          type: "tool_end",
          name: apiToolName,
          toolCallId: tc.id,
          resultPreview: resultText.slice(0, 400),
          fullResult: resultText,
        });
        oaMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: apiToolName,
          content: resultText,
        });
      }
      continue;
    }

    if (fullAssistant.trim()) {
      oaMessages.push({ role: "assistant", content: fullAssistant });
    }
    break;
  }

  opts.onEvent({ type: "done" });
}

export function appendUserMessage(messages: ChatMessageV2[], text: string): ChatMessageV2[] {
  return [...messages, { id: generateMessageId(), role: "user", content: text.trim() }];
}

export function ensureSystemMessage(messages: ChatMessageV2[], scope: ChatScope): ChatMessageV2[] {
  if (messages.some((m) => m.role === "system")) return messages;
  return [{ id: generateMessageId(), role: "system", content: systemPromptForWorkspace(scope) }, ...messages];
}
