/**
 * Multi-turn chat with tool execution via OpenAI-compatible Chat Completions (incl. Gemini compat endpoint).
 */

import type { AutomationCommand, AutomationResult } from "../../shared/automation-types";
import type { McpServerConfigPayload } from "../../shared/mcp-external-types";
import type { ChatMessageV2, ChatScope } from "../chat/conversation-store";
import { generateMessageId } from "../chat/conversation-ids";
import {
  type AiProvider,
  type IntelligentSettingsState,
  type ThinkingLevel,
  mcpServerHasConnectionParams,
  mcpServerToPayload,
  resolveOpenAiCompatibleBaseUrl,
  optionalCustomTlsCaPem,
  selectedModelIdForChatScope,
  thinkingLevelForChatScope,
} from "../state/session-settings-store";
import {
  buildToolDispatchMap,
  executeButcherTool,
  executeExternalTool,
  filterButcherTools,
  filterToolsByAllowlist,
  listOpenAiToolNames,
  togglesForScope,
} from "./ai-tools";
import {
  extractAtToolNames,
  resolveToolAllowlist,
  unknownAtToolNames,
} from "../chat/ai-tool-mentions";
import type { ElectronApi } from "../../shared/ipc-types";
import { systemPromptForWorkspace } from "./ai-system-prompts";

export type ChatStreamEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; toolCallId: string }
  | {
      type: "tool_end";
      name: string;
      toolCallId: string;
      /** JSON string of function arguments from the model. */
      arguments: string;
      resultPreview: string;
      fullResult: string;
    }
  | { type: "error"; message: string }
  /** Start of one model SSE response (each outer agent round). Resets bridge preamble state. */
  | { type: "stream_start" }
  /** Fired after each tool round completes (before the next model stream). Used to persist thinking before tools per round. */
  | { type: "round_end" }
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

function inferHttpStatusFromProxyError(message: string): number {
  const m = message.match(/HTTP\s+(\d{3})\b/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

/**
 * True when the provider likely rejected the request because tools / function calling
 * are invalid for this model (retry once without tools).
 */
export function responseLooksLikeToolsNotSupported(httpStatus: number, body: string): boolean {
  const status = httpStatus > 0 ? httpStatus : inferHttpStatusFromProxyError(body);
  const b = body.toLowerCase();
  const mentionsTools =
    b.includes("tool_choice") ||
    b.includes('"tools"') ||
    b.includes("tool_calls") ||
    b.includes("function_call") ||
    /\bfunctions\b/.test(b) ||
    b.includes("parallel_tool_calls") ||
    b.includes("tool use") ||
    b.includes("tool_use");

  if (status === 400 || status === 422) {
    return mentionsTools;
  }

  /** e.g. OpenRouter: "No endpoints found that support tool use" (HTTP 404). */
  if (status === 404) {
    return (
      mentionsTools ||
      b.includes("support tool use") ||
      (b.includes("no endpoints") && b.includes("tool"))
    );
  }

  if (status === 0 && mentionsTools) {
    return (
      b.includes("invalid") ||
      b.includes("not support") ||
      b.includes("unsupported") ||
      b.includes("unknown parameter") ||
      b.includes("does not support")
    );
  }

  return false;
}

/** OpenAI-compatible streams: reasoning / thinking may appear under several delta keys (OpenRouter, o-series, Gemini, etc.). */
function extractThinkingDelta(d: Record<string, unknown>): string {
  const directKeys = [
    "reasoning",
    "reasoning_content",
    "thinking",
    "thought",
    "reasoning_content_delta",
    "reasoning_delta",
    "chain_of_thought",
    "model_reasoning",
    "internal_monologue",
    "thoughts",
  ] as const;
  let out = "";
  for (const k of directKeys) {
    const v = d[k];
    if (typeof v === "string" && v.length) out += v;
  }
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== "string" || !v.length) continue;
    if (k === "content" || k === "role" || k === "refusal" || k === "tool_calls") continue;
    if (/reason|think|thought|chain|internal|monologue|deliberat|cognitive/i.test(k)) out += v;
  }
  return out;
}

/**
 * User-visible assistant text from one streamed `choices[].delta` (all OpenAI-compat providers).
 * - Most APIs (OpenAI, Groq, xAI, Mistral, Together, OpenRouter, DeepSeek): `delta.content` string.
 * - Google Gemini OpenAI-compat and some routed models: `content` as an array of `{ type, text }` parts.
 * - Occasional proxies: top-level `delta.text`.
 */
function extractVisibleDeltaText(d: Record<string, unknown>): string {
  const c = d.content;
  if (typeof c === "string" && c.length) return c;
  if (Array.isArray(c)) {
    let out = "";
    for (const part of c) {
      if (typeof part === "string") {
        out += part;
        continue;
      }
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const typ = typeof p.type === "string" ? p.type.toLowerCase() : "";
      if (
        typ === "reasoning" ||
        typ === "thinking" ||
        typ === "tool_use" ||
        typ === "tool-call" ||
        typ === "function"
      ) {
        continue;
      }
      if (typeof p.text === "string") out += p.text;
      else if (typeof p.content === "string") out += p.content;
    }
    return out;
  }
  const t = d.text;
  if (typeof t === "string" && t.length) return t;
  return "";
}

/** Common in Qwen / DeepSeek-style streams: hide chain-of-thought from the visible reply. */
const THINK_TAG_OPEN = "\u003cthink\u003e";
const THINK_TAG_CLOSE = "\u003c/think\u003e";

function mightEndWithPartialOpenTag(buf: string, openTag: string): boolean {
  const max = Math.min(buf.length, openTag.length - 1);
  for (let len = 1; len <= max; len++) {
    if (openTag.startsWith(buf.slice(-len))) return true;
  }
  return false;
}

/**
 * Streams may split `</think>` across SSE chunks; buffer until we can strip thinking into
 * separate events (common for local / tag-trained models).
 */
function createThinkTagSplitter(
  onVisible: (text: string) => void,
  onThinking: (text: string) => void,
): { feed: (chunk: string) => void; flush: () => void } {
  let buf = "";
  const feed = (chunk: string) => {
    if (!chunk) return;
    buf += chunk;
    while (true) {
      const openIdx = buf.indexOf(THINK_TAG_OPEN);
      if (openIdx === -1) {
        if (mightEndWithPartialOpenTag(buf, THINK_TAG_OPEN)) break;
        if (buf) onVisible(buf);
        buf = "";
        break;
      }
      if (openIdx > 0) onVisible(buf.slice(0, openIdx));
      buf = buf.slice(openIdx + THINK_TAG_OPEN.length);
      const closeIdx = buf.indexOf(THINK_TAG_CLOSE);
      if (closeIdx === -1) {
        buf = THINK_TAG_OPEN + buf;
        break;
      }
      const inner = buf.slice(0, closeIdx);
      if (inner.trim()) onThinking(inner);
      buf = buf.slice(closeIdx + THINK_TAG_CLOSE.length);
    }
  };
  const flush = () => {
    if (!buf) return;
    onVisible(buf);
    buf = "";
  };
  return { feed, flush };
}

type ToolMsgV2 = Extract<ChatMessageV2, { role: "tool" }>;

function toolArgumentsForApi(t: ToolMsgV2): string {
  const a = t.arguments;
  if (typeof a === "string" && a.trim().length > 0) return a;
  return "{}";
}

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
            function: {
              name: nonEmptyToolName(t.name),
              arguments: toolArgumentsForApi(t),
            },
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
            function: {
              name: nonEmptyToolName(t.name),
              arguments: toolArgumentsForApi(t),
            },
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
          function: {
            name: nonEmptyToolName(t.name),
            arguments: toolArgumentsForApi(t),
          },
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

export async function loadExternalToolGroups(
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

export async function getIntelligentOpenAiToolNames(
  api: ElectronApi,
  settings: IntelligentSettingsState,
): Promise<string[]> {
  const butcherDefs = filterButcherTools(settings, "intelligent");
  const externalGroups = await loadExternalToolGroups(api, settings, "intelligent");
  return listOpenAiToolNames(butcherDefs, externalGroups);
}

export async function computeIntelligentToolAllowlistFromUserText(
  text: string,
  api: ElectronApi,
  settings: IntelligentSettingsState,
): Promise<{ allowlist: string[] | null; unknownNames: string[] }> {
  const mentioned = extractAtToolNames(text);
  const names = await getIntelligentOpenAiToolNames(api, settings);
  const enabled = new Set(names);
  return {
    allowlist: resolveToolAllowlist(mentioned, enabled),
    unknownNames: unknownAtToolNames(mentioned, enabled),
  };
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
  /** When set (intelligent workspace), only these OpenAI function names are exposed to the model. */
  toolAllowlist?: string[] | null;
}): Promise<void> {
  const maxRounds = opts.maxToolRounds ?? 8;
  const modelId = selectedModelIdForChatScope(opts.settings, opts.scope).trim();
  if (!modelId) {
    opts.onEvent({ type: "error", message: "Select a model in Settings." });
    opts.onEvent({ type: "done" });
    return;
  }

  const butcherDefs = filterButcherTools(opts.settings, opts.scope);
  const externalGroups =
    opts.scope === "browser" ? [] : await loadExternalToolGroups(opts.api, opts.settings, opts.scope);
  let { openAiTools, dispatch } = buildToolDispatchMap(butcherDefs, externalGroups);
  const allow = opts.toolAllowlist;
  if (opts.scope === "intelligent" && allow != null && allow.length > 0) {
    const narrowed = filterToolsByAllowlist(openAiTools, dispatch, allow);
    openAiTools = narrowed.openAiTools;
    dispatch = narrowed.dispatch;
  }

  const provider = opts.settings.aiProvider;
  const baseUrl =
    provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/openai"
      : normalizeOpenAiBase(
          resolveOpenAiCompatibleBaseUrl(provider, opts.settings.customBaseUrl),
        );
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
    thinkingLevelForChatScope(opts.settings, opts.scope),
    opts.settings.aiProvider,
    optionalCustomTlsCaPem(opts.settings),
    openAiTools,
    dispatch,
    maxRounds,
  );
}

/**
 * Maps chat “thinking” level to provider-specific Chat Completions fields.
 * OpenAI / Google Gemini compat: top-level `reasoning_effort`.
 * OpenRouter: unified `reasoning` object (pass-through to upstream models).
 * DeepSeek API: `thinking.type` (native); avoid mixing with `reasoning_effort` which can 400.
 * Custom / unknown proxy: send both `reasoning_effort` and `reasoning` for compatibility.
 */
function applyThinkingToRequestBody(
  body: Record<string, unknown>,
  thinkingLevel: ThinkingLevel,
  aiProvider: AiProvider,
  baseUrl: string,
): void {
  if (thinkingLevel === "off") return;

  let host = "";
  try {
    const u = baseUrl.trim();
    host = new URL(u.includes("://") ? u : `https://${u}`).hostname.toLowerCase();
  } catch {
    host = "";
  }

  const useDeepSeekThinking =
    aiProvider === "deepseek" || host.includes("deepseek.com");
  if (useDeepSeekThinking) {
    body.thinking = { type: "enabled" };
    return;
  }

  switch (aiProvider) {
    case "openrouter":
      body.reasoning = { effort: thinkingLevel, exclude: false };
      return;
    case "google":
    case "openai":
    case "groq":
    case "mistral":
    case "together":
    case "xai":
      body.reasoning_effort = thinkingLevel;
      return;
    case "custom":
    default:
      body.reasoning_effort = thinkingLevel;
      body.reasoning = { effort: thinkingLevel };
      return;
  }
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
  thinkingLevel: ThinkingLevel,
  aiProvider: AiProvider,
  tlsCaPem: string | undefined,
  openAiTools: ReturnType<typeof buildToolDispatchMap>["openAiTools"],
  dispatch: ReturnType<typeof buildToolDispatchMap>["dispatch"],
  maxRounds: number,
): Promise<void> {
  const sys = systemPromptForWorkspace(opts.scope);
  const oaMessages = buildOpenAiMessagesFromChatV2(sys, opts.messages);

  const url = openAiStyleChatCompletionsUrl(baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  /** After one tools-not-supported response, omit tools for the rest of this pipeline run. */
  let toolsOmittedForSession = false;

  let rounds = 0;
  while (rounds < maxRounds) {
    rounds++;

    const proxy = opts.api.aiChatProxyStream;

    let fullAssistant = "";
    let toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

    streamAttempt: while (true) {
      opts.onEvent({ type: "stream_start" });
      let buffer = "";
      fullAssistant = "";
      toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();

      const { feed: feedAssistantContent, flush: flushAssistantThinkBuffer } = createThinkTagSplitter(
        (text) => {
          fullAssistant += text;
          opts.onEvent({ type: "assistant_delta", text });
        },
        (t) => opts.onEvent({ type: "thinking", text: t }),
      );

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
            // Emit reasoning before visible content when both appear in one delta, so the UI
            // keeps thinking above the answer (matches provider intent and legacy layout).
            const thinkingPart = extractThinkingDelta(d);
            if (thinkingPart) opts.onEvent({ type: "thinking", text: thinkingPart });
            const visible = extractVisibleDeltaText(d as Record<string, unknown>);
            if (visible.length) {
              feedAssistantContent(visible);
            }
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

      const includeTools = openAiTools.length > 0 && !toolsOmittedForSession;
      const body: Record<string, unknown> = {
        model: modelId,
        messages: oaMessages,
        stream: true,
      };
      if (includeTools) {
        body.tools = openAiTools;
        body.tool_choice = "auto";
      }
      applyThinkingToRequestBody(body, thinkingLevel, aiProvider, baseUrl);
      const bodyStr = JSON.stringify(body);

      if (proxy) {
        try {
          const outcome = await new Promise<"done" | "retry">((resolve, reject) => {
            proxy(
              { url, headers, body: bodyStr, ...(tlsCaPem ? { tlsCaPem } : {}) },
              {
                onChunk: feedSseChunk,
                onComplete: () => resolve("done"),
                onError: (m, httpStatus) => {
                  if (includeTools && responseLooksLikeToolsNotSupported(httpStatus ?? 0, m)) {
                    toolsOmittedForSession = true;
                    resolve("retry");
                    return;
                  }
                  reject(new Error(m));
                },
              },
            );
          });
          if (outcome === "retry") continue streamAttempt;
        } catch (e) {
          opts.onEvent({ type: "error", message: e instanceof Error ? e.message : String(e) });
          opts.onEvent({ type: "done" });
          return;
        }
      } else {
        if (tlsCaPem) {
          opts.onEvent({
            type: "error",
            message:
              "Custom TLS CA requires the desktop app (chat is proxied through the main process). Cannot use renderer fetch with a private CA.",
          });
          opts.onEvent({ type: "done" });
          return;
        }
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: bodyStr,
        });

        if (!res.ok) {
          const t = await res.text();
          if (includeTools && responseLooksLikeToolsNotSupported(res.status, t)) {
            toolsOmittedForSession = true;
            continue streamAttempt;
          }
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

      feedSseChunk("\n");
      flushAssistantThinkBuffer();
      break streamAttempt;
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
        const ref = dispatch(apiToolName);
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
          arguments: tc.arguments || "{}",
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
      opts.onEvent({ type: "round_end" });
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
