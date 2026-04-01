/**
 * Intelligent workspace settings: AI keys and MCP server definitions. Persisted locally.
 */

import type {
  McpRemoteTransport,
  McpServerConfigPayload,
  McpServerConnectionMode,
} from "../../shared/mcp-external-types";
import type { ChatScope } from "../chat/conversation-store";

export const INTELLIGENT_SETTINGS_KEY = "butcher.intelligent-settings.v1";
/** @deprecated legacy key — migrated once on load */
const LEGACY_SESSION_SETTINGS_KEY = "butcher.session-settings.v1";

/**
 * Chat providers: Google uses the Gemini API; all others use OpenAI-compatible Chat Completions
 * (each preset supplies a default base URL; `custom` uses `customBaseUrl`).
 */
export type AiProvider =
  | "google"
  | "openai"
  | "openrouter"
  | "groq"
  | "deepseek"
  | "mistral"
  | "together"
  | "xai"
  | "custom";

const OPENAI_COMPAT_PROVIDER_SET = new Set<string>([
  "openai",
  "openrouter",
  "groq",
  "deepseek",
  "mistral",
  "together",
  "xai",
  "custom",
]);

export function parseAiProvider(raw: unknown): AiProvider {
  if (raw === "custom") return "custom";
  if (typeof raw === "string" && OPENAI_COMPAT_PROVIDER_SET.has(raw)) return raw as AiProvider;
  /** Legacy: only `"custom"` was non-Google; missing or unknown values default to Gemini. */
  return "google";
}

/**
 * Default API root for OpenAI-style clients (`normalizeOpenAiBase` /v1 may be stripped).
 * Does not apply when `provider === "google"` (chat uses Gemini OpenAI compat URL separately).
 */
export function resolveOpenAiCompatibleBaseUrl(
  provider: Exclude<AiProvider, "google">,
  customBaseUrl: string,
): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com";
    case "openrouter":
      return "https://openrouter.ai/api";
    case "groq":
      return "https://api.groq.com/openai";
    case "deepseek":
      return "https://api.deepseek.com";
    case "mistral":
      return "https://api.mistral.ai";
    case "together":
      return "https://api.together.xyz";
    case "xai":
      return "https://api.x.ai";
    case "custom":
      return (customBaseUrl || "").trim() || "https://api.openai.com";
  }
}

/** Settings UI: provider dropdown entries (value must match `AiProvider`). */
export const AI_PROVIDER_SELECT_OPTIONS: ReadonlyArray<{
  value: AiProvider;
  label: string;
  description: string;
}> = [
  {
    value: "google",
    label: "Google Gemini",
    description: "Google AI Studio / Gemini API key; uses the OpenAI-compatible Gemini endpoint for chat.",
  },
  {
    value: "openai",
    label: "OpenAI",
    description: "Official OpenAI API (api.openai.com).",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    description: "Route to many models via one API (openrouter.ai).",
  },
  {
    value: "groq",
    label: "Groq",
    description: "Groq OpenAI-compatible API (fast inference).",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek API (OpenAI-compatible).",
  },
  {
    value: "mistral",
    label: "Mistral AI",
    description: "Mistral API (OpenAI-compatible).",
  },
  {
    value: "together",
    label: "Together AI",
    description: "Together API (OpenAI-compatible).",
  },
  {
    value: "xai",
    label: "xAI",
    description: "xAI Grok API (OpenAI-compatible).",
  },
  {
    value: "custom",
    label: "Custom base URL",
    description: "Any other OpenAI-compatible host; set the base URL below.",
  },
];

/** Reasoning / thinking intensity sent to OpenAI-compatible providers (Chat Completions). */
export type ThinkingLevel = "off" | "low" | "medium" | "high";

export function parseThinkingLevel(raw: unknown): ThinkingLevel {
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "off";
}

export type McpServerConfig = {
  id: string;
  name: string;
  serverMode: McpServerConnectionMode;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  remoteTransport: McpRemoteTransport;
};

/** Built-in Butcher automation tools (in-process). */
export const BUTCHER_BUILTIN_MCP_ID = "butcher_builtin";
/** Built-in Intelligent MCP tools (in-process). */
export const INTELLIGENT_BUILTIN_MCP_ID = "intelligent_builtin";

export type WorkspaceMcpToggles = {
  /** MCP connection id -> enabled (missing = true). */
  connectionEnabled: Record<string, boolean>;
  /** MCP id -> tool name -> enabled (missing = true). */
  toolEnabled: Record<string, Record<string, boolean>>;
};

export function defaultWorkspaceMcpToggles(): WorkspaceMcpToggles {
  return { connectionEnabled: {}, toolEnabled: {} };
}

export type IntelligentSettingsState = {
  aiProvider: AiProvider;
  googleApiKey: string;
  customBaseUrl: string;
  customApiKey: string;
  /**
   * Optional extra CA bundle (PEM) for HTTPS to custom OpenAI-compatible hosts only.
   * Appended to the system trust store in the main process. Stored locally.
   */
  customTlsCaPem: string;
  /** Browser agent chat: model id (Gemini or OpenAI-compatible name). */
  browserSelectedModelId: string;
  /** AI assistant chat: model id. */
  intelligentSelectedModelId: string;
  /** Last fetched model ids for dropdown (optional cache). */
  cachedModelIds: string[];
  /** Browser agent: reasoning / thinking level for chat requests. */
  browserThinkingLevel: ThinkingLevel;
  /** AI assistant: reasoning / thinking level for chat requests. */
  intelligentThinkingLevel: ThinkingLevel;
  mcpServers: McpServerConfig[];
  mcpTogglesBrowser: WorkspaceMcpToggles;
  mcpTogglesIntelligent: WorkspaceMcpToggles;
};

function newMcpId(): string {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyMcpServer(): McpServerConfig {
  return {
    id: newMcpId(),
    name: "",
    serverMode: "stdio",
    command: "",
    args: "[]",
    env: "{}",
    url: "",
    headers: "{}",
    remoteTransport: "auto",
  };
}

export function mcpServerToPayload(m: McpServerConfig): McpServerConfigPayload {
  return {
    id: m.id,
    name: m.name,
    serverMode: m.serverMode,
    command: m.command,
    args: m.args,
    env: m.env,
    url: m.url,
    headers: m.headers,
    remoteTransport: m.remoteTransport,
  };
}

export function mcpServerHasConnectionParams(m: McpServerConfig): boolean {
  return m.serverMode === "remote" ? Boolean((m.url || "").trim()) : Boolean((m.command || "").trim());
}

export function defaultIntelligentSettings(): IntelligentSettingsState {
  return {
    aiProvider: "google",
    googleApiKey: "",
    customBaseUrl: "",
    customApiKey: "",
    customTlsCaPem: "",
    browserSelectedModelId: "",
    intelligentSelectedModelId: "",
    cachedModelIds: [],
    browserThinkingLevel: "off",
    intelligentThinkingLevel: "off",
    mcpServers: [],
    mcpTogglesBrowser: defaultWorkspaceMcpToggles(),
    mcpTogglesIntelligent: defaultWorkspaceMcpToggles(),
  };
}

export function selectedModelIdForChatScope(
  settings: IntelligentSettingsState,
  scope: ChatScope,
): string {
  return scope === "browser" ? settings.browserSelectedModelId : settings.intelligentSelectedModelId;
}

export function thinkingLevelForChatScope(
  settings: IntelligentSettingsState,
  scope: ChatScope,
): ThinkingLevel {
  return scope === "browser" ? settings.browserThinkingLevel : settings.intelligentThinkingLevel;
}

/** Extra PEM CA for HTTPS when using the Custom OpenAI-compatible provider (main-process only). */
export function optionalCustomTlsCaPem(settings: IntelligentSettingsState): string | undefined {
  if (settings.aiProvider !== "custom") return undefined;
  const pem = settings.customTlsCaPem.trim();
  return pem.length > 0 ? pem : undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isRemoteTransportString(x: unknown): x is McpRemoteTransport {
  return x === "auto" || x === "streamableHttp" || x === "sse";
}

function isServerModeString(x: unknown): x is McpServerConnectionMode {
  return x === "stdio" || x === "remote";
}

/** Legacy row shape before remote MCP — still accepted from localStorage. */
function isMcpServerConfigLoose(x: unknown): x is Record<string, unknown> & {
  id: string;
  name: string;
  command: string;
  args: string;
  env: string;
} {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.command === "string" &&
    typeof x.args === "string" &&
    typeof x.env === "string"
  );
}

function normalizeMcpServer(m: Record<string, unknown>): McpServerConfig {
  const url = typeof m.url === "string" ? m.url : "";
  let serverMode: McpServerConfig["serverMode"] = "stdio";
  if (isServerModeString(m.serverMode)) {
    serverMode = m.serverMode;
  } else if (url.trim()) {
    serverMode = "remote";
  }
  let remoteTransport: McpServerConfig["remoteTransport"] = "auto";
  if (isRemoteTransportString(m.remoteTransport)) {
    remoteTransport = m.remoteTransport;
  }
  return {
    id: String(m.id),
    name: String(m.name),
    serverMode,
    command: String(m.command),
    args: String(m.args),
    env: String(m.env),
    url,
    headers: typeof m.headers === "string" ? m.headers : "{}",
    remoteTransport,
  };
}

function isWorkspaceMcpToggles(x: unknown): x is WorkspaceMcpToggles {
  if (!isRecord(x)) return false;
  const ce = x.connectionEnabled;
  const te = x.toolEnabled;
  return (
    (ce === undefined || isRecord(ce)) &&
    (te === undefined || (isRecord(te) && Object.values(te).every((v) => v === undefined || isRecord(v))))
  );
}

function parseWorkspaceMcpToggles(raw: unknown): WorkspaceMcpToggles {
  if (!isWorkspaceMcpToggles(raw)) return defaultWorkspaceMcpToggles();
  const connectionEnabled =
    raw.connectionEnabled && isRecord(raw.connectionEnabled)
      ? Object.fromEntries(
          Object.entries(raw.connectionEnabled).filter(([, v]) => typeof v === "boolean") as [string, boolean][],
        )
      : {};
  const toolEnabled: Record<string, Record<string, boolean>> = {};
  if (raw.toolEnabled && isRecord(raw.toolEnabled)) {
    for (const [k, v] of Object.entries(raw.toolEnabled)) {
      if (!isRecord(v)) continue;
      toolEnabled[k] = Object.fromEntries(
        Object.entries(v).filter(([, b]) => typeof b === "boolean") as [string, boolean][],
      );
    }
  }
  return { connectionEnabled, toolEnabled };
}

function parseIntelligentPayload(parsed: Record<string, unknown>): IntelligentSettingsState {
  const aiProvider = parseAiProvider(parsed.aiProvider);
  const mcpRaw = parsed.mcpServers;
  const mcpServers = Array.isArray(mcpRaw)
    ? mcpRaw.filter(isMcpServerConfigLoose).map((m) => normalizeMcpServer(m))
    : [];
  const cachedRaw = parsed.cachedModelIds;
  const cachedModelIds = Array.isArray(cachedRaw)
    ? cachedRaw.filter((x): x is string => typeof x === "string")
    : [];
  const legacyModel =
    typeof parsed.selectedModelId === "string" ? parsed.selectedModelId : "";
  const browserSelectedModelId =
    typeof parsed.browserSelectedModelId === "string"
      ? parsed.browserSelectedModelId
      : legacyModel;
  const intelligentSelectedModelId =
    typeof parsed.intelligentSelectedModelId === "string"
      ? parsed.intelligentSelectedModelId
      : legacyModel;
  const legacyThinking = parseThinkingLevel(parsed.thinkingLevel);
  const browserThinkingLevel =
    parsed.browserThinkingLevel !== undefined
      ? parseThinkingLevel(parsed.browserThinkingLevel)
      : legacyThinking;
  const intelligentThinkingLevel =
    parsed.intelligentThinkingLevel !== undefined
      ? parseThinkingLevel(parsed.intelligentThinkingLevel)
      : legacyThinking;
  return {
    aiProvider,
    googleApiKey: typeof parsed.googleApiKey === "string" ? parsed.googleApiKey : "",
    customBaseUrl: typeof parsed.customBaseUrl === "string" ? parsed.customBaseUrl : "",
    customApiKey: typeof parsed.customApiKey === "string" ? parsed.customApiKey : "",
    customTlsCaPem: typeof parsed.customTlsCaPem === "string" ? parsed.customTlsCaPem : "",
    browserSelectedModelId,
    intelligentSelectedModelId,
    cachedModelIds,
    browserThinkingLevel,
    intelligentThinkingLevel,
    mcpServers,
    mcpTogglesBrowser: parseWorkspaceMcpToggles(parsed.mcpTogglesBrowser),
    mcpTogglesIntelligent: parseWorkspaceMcpToggles(parsed.mcpTogglesIntelligent),
  };
}

/** @deprecated use loadIntelligentSettings */
export function loadSessionSettings(): IntelligentSettingsState {
  return loadIntelligentSettings();
}

export function loadIntelligentSettings(): IntelligentSettingsState {
  const base = defaultIntelligentSettings();
  try {
    let raw = localStorage.getItem(INTELLIGENT_SETTINGS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_SESSION_SETTINGS_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (isRecord(parsed)) {
            const migrated = parseIntelligentPayload(parsed);
            saveIntelligentSettings(migrated);
          }
          localStorage.removeItem(LEGACY_SESSION_SETTINGS_KEY);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return base;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return base;
    return parseIntelligentPayload(parsed);
  } catch {
    return base;
  }
}

/** @deprecated use saveIntelligentSettings */
export function saveSessionSettings(state: IntelligentSettingsState): void {
  saveIntelligentSettings(state);
}

export function saveIntelligentSettings(state: IntelligentSettingsState): void {
  try {
    localStorage.setItem(INTELLIGENT_SETTINGS_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("butcher-intelligent-settings-saved"));
    }
  } catch {
    /* quota */
  }
}
