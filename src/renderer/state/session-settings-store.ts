/**
 * Intelligent workspace settings: AI keys and MCP server definitions. Persisted locally.
 */

import type {
  McpRemoteTransport,
  McpServerConfigPayload,
  McpServerConnectionMode,
} from "../../shared/mcp-external-types";

export const INTELLIGENT_SETTINGS_KEY = "butcher.intelligent-settings.v1";
/** @deprecated legacy key — migrated once on load */
const LEGACY_SESSION_SETTINGS_KEY = "butcher.session-settings.v1";

export type AiProvider = "google" | "custom";

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
  /** Selected model id (Gemini model id or OpenAI-compatible model name). */
  selectedModelId: string;
  /** Last fetched model ids for dropdown (optional cache). */
  cachedModelIds: string[];
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
    selectedModelId: "",
    cachedModelIds: [],
    mcpServers: [],
    mcpTogglesBrowser: defaultWorkspaceMcpToggles(),
    mcpTogglesIntelligent: defaultWorkspaceMcpToggles(),
  };
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
  const aiProvider = parsed.aiProvider === "custom" ? "custom" : "google";
  const mcpRaw = parsed.mcpServers;
  const mcpServers = Array.isArray(mcpRaw)
    ? mcpRaw.filter(isMcpServerConfigLoose).map((m) => normalizeMcpServer(m))
    : [];
  const cachedRaw = parsed.cachedModelIds;
  const cachedModelIds = Array.isArray(cachedRaw)
    ? cachedRaw.filter((x): x is string => typeof x === "string")
    : [];
  return {
    aiProvider,
    googleApiKey: typeof parsed.googleApiKey === "string" ? parsed.googleApiKey : "",
    customBaseUrl: typeof parsed.customBaseUrl === "string" ? parsed.customBaseUrl : "",
    customApiKey: typeof parsed.customApiKey === "string" ? parsed.customApiKey : "",
    selectedModelId: typeof parsed.selectedModelId === "string" ? parsed.selectedModelId : "",
    cachedModelIds,
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
