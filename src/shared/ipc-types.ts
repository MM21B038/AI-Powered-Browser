import type { AutomationCommand, AutomationResult } from "./automation-types";
import type { McpServerConfigPayload } from "./mcp-external-types";

export interface BrowserImportStats {
  available: boolean;
  bookmarks?: number;
  history?: number;
  cookies?: number;
  passwords?: number;
  autofill?: number;
  browser?: string | null;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  chrome: string;
  node: string;
  memory: string;
  totalMemory: string;
  cpus: number;
}

export interface ImportBrowserDataOptions {
  browser: "chrome" | "firefox";
  dataTypes: Array<
    "bookmarks" | "history" | "cookies" | "passwords" | "autofill"
  >;
  /** Chromium profile folder (Default, Profile 1, …) or Firefox profile path */
  profilePath?: string;
}

export interface ListedBrowserProfile {
  path: string;
  engine: string;
  label: string;
}

export interface ListBrowserProfilesResult {
  chrome: ListedBrowserProfile[];
  firefox: ListedBrowserProfile[];
}

export interface ImportStatsDetail extends BrowserImportStats {
  browser?: string | null;
}

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface RequestTemplate {
  id: string;
  name: string;
  collection: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  query?: Record<string, string>;
  body?: string;
  bodyType?: "none" | "json" | "form" | "text";
  auth?: { type: "none" | "bearer"; token?: string };
  cookieProfile?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RequestRunInput {
  template?: RequestTemplate;
  templateId?: string;
  override?: Partial<RequestTemplate>;
  timeoutMs?: number;
  followRedirects?: boolean;
  allowMutating?: boolean;
}

export interface RequestRunResult {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyPreview: string;
  durationMs: number;
}

export interface CapturedRequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
  resourceType: string;
  referrer: string;
}

export type ListedAiModel = { id: string; displayName?: string };

export type AiTestChatHiPayload =
  | { provider: "google"; googleApiKey: string; modelId: string }
  | {
      provider: "custom";
      customBaseUrl: string;
      customApiKey: string;
      modelId: string;
    };

export type AiChatProxyStreamHandlers = {
  onChunk: (text: string) => void;
  onComplete: () => void;
  /** Optional HTTP status when the proxy failed before streaming (e.g. 400). */
  onError: (message: string, httpStatus?: number) => void;
};

export interface McpBridgeState {
  enabled: boolean;
  port: number;
  token: string;
  listeningPort: number | null;
  /** Absolute path to the bundled stdio MCP entry (pass to `node` in client config). */
  stdioServerPath: string;
}

export type McpExternalListedTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

/** Result of listing tools from a remote MCP server (main process; does not throw over IPC). */
export type McpExternalListToolsResult =
  | { ok: true; tools: McpExternalListedTool[] }
  | { ok: false; error: string; tools: [] };

export interface IpcResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface ElectronApi {
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowStateChanged: (cb: (state: "maximized" | "normal") => void) => void;
  navigateUrl: (url: string) => Promise<IpcResponse<{ url: string }>>;
  fillFormField: (data: unknown) => Promise<IpcResponse>;
  clickElement: (selector: string) => Promise<IpcResponse>;
  executeScript: (script: string) => Promise<IpcResponse>;
  openExternal: (url: string) => Promise<IpcResponse>;
  getSystemInfo: () => Promise<SystemInfo>;
  showNotification: (title: string, body: string) => Promise<IpcResponse>;
  captureWebview: (
    webContentsId: number,
    rect?: unknown,
  ) => Promise<IpcResponse<{ dataUrl: string }>>;
  saveScreenshot: (
    dataUrl: string,
  ) => Promise<IpcResponse<{ path: string; filename: string }>>;
  // Background (Playwright-like) session APIs (main-process offscreen pages)
  bgEnsureSession: (sessionId: string) => Promise<IpcResponse>;
  bgKillSession: (sessionId: string) => Promise<IpcResponse>;
  bgGoto: (
    sessionId: string,
    url: string,
  ) => Promise<IpcResponse<{ url: string }>>;
  bgEval: <T = unknown>(
    sessionId: string,
    script: string,
  ) => Promise<IpcResponse<T>>;
  bgGetUrl: (sessionId: string) => Promise<IpcResponse<{ url: string }>>;
  bgGetTitle: (sessionId: string) => Promise<IpcResponse<{ title: string }>>;
  bgScreenshot: (
    sessionId: string,
  ) => Promise<IpcResponse<{ dataUrl: string }>>;
  showSaveDialog: (options?: unknown) => Promise<unknown>;
  setZoom: (level: number) => Promise<IpcResponse>;
  sendChatMessage: (message: string) => Promise<IpcResponse>;
  profileList: () => Promise<string[]>;
  profileSave: (
    name: string,
    data: unknown,
  ) => Promise<IpcResponse<{ name: string }>>;
  profileLoad: (name: string) => Promise<unknown>;
  profileDelete: (name: string) => Promise<IpcResponse>;
  browserImport: () => Promise<unknown>;
  getBrowserStats: () => Promise<{
    chrome: BrowserImportStats;
    firefox: BrowserImportStats;
  }>;
  getImportStats: (payload: {
    browser: "chrome" | "firefox";
    profilePath?: string;
  }) => Promise<ImportStatsDetail>;
  listBrowserProfiles: () => Promise<ListBrowserProfilesResult>;
  importBrowserData: (
    options: ImportBrowserDataOptions,
  ) => Promise<IpcResponse<{ results: Record<string, number> }>>;
  runAutomationCommand: (cmd: AutomationCommand) => Promise<AutomationResult>;
  runAutomationLine: (line: string) => Promise<AutomationResult>;
  requestSaveTemplate: (
    tpl: Omit<RequestTemplate, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ) => Promise<RequestTemplate>;
  requestListTemplates: () => Promise<RequestTemplate[]>;
  requestDeleteTemplate: (id: string) => Promise<IpcResponse>;
  requestRun: (input: RequestRunInput) => Promise<RequestRunResult>;
  requestListCaptures: (limit?: number) => Promise<CapturedRequestRecord[]>;
  cookieProfileSetToken: (
    profile: string,
    name: string,
    value: string,
  ) => Promise<IpcResponse>;
  cookieProfileGetTokens: (profile: string) => Promise<Record<string, string>>;
  getBookmarks: () => Promise<unknown>;
  getHistory: () => Promise<unknown>;
  getCookies: () => Promise<unknown>;
  getPasswords: () => Promise<unknown>;
  getAutofill: () => Promise<unknown>;
  addBookmark: (bookmark: unknown) => Promise<IpcResponse>;
  addHistoryEntry: (entry: unknown) => Promise<IpcResponse>;
  getDataStats: () => Promise<unknown>;
  clearAllData: () => Promise<IpcResponse>;
  debugLog: (payload: {
    source?: string;
    message?: string;
    data?: unknown;
  }) => Promise<IpcResponse>;
  mcpBridgeGetState: () => Promise<McpBridgeState>;
  mcpBridgeSetEnabled: (enabled: boolean) => Promise<McpBridgeState>;
  mcpBridgeSetPort: (port: number) => Promise<McpBridgeState>;
  mcpBridgeRegenerateToken: () => Promise<McpBridgeState>;
  /** Never rejects; use `ok` to detect failures (avoids Electron logging IPC handler errors). */
  mcpExternalListTools: (
    cfg: McpServerConfigPayload,
  ) => Promise<McpExternalListToolsResult>;
  mcpExternalCallTool: (
    cfg: McpServerConfigPayload,
    toolName: string,
    args: unknown,
  ) => Promise<{ content: unknown[]; isError?: boolean }>;
  mcpExternalDisconnect: (
    serverId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Main-process fetch (avoids renderer CORS for Google / some APIs). */
  aiListGoogleModels: (apiKey: string) => Promise<ListedAiModel[]>;
  aiListOpenAiModels: (
    baseUrl: string,
    apiKey: string,
  ) => Promise<ListedAiModel[]>;
  aiTestChatHi: (payload: AiTestChatHiPayload) => Promise<{ reply: string }>;
  /** Stream POST body to OpenAI-compatible chat/completions from main. Returns unsubscribe. */
  aiChatProxyStream: (
    payload: { url: string; headers: Record<string, string>; body: string },
    handlers: AiChatProxyStreamHandlers,
  ) => () => void;
}
