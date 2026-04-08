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

/** Main-process user skills (SKILL.md under userData/skills). */
export type UserSkillListItem = {
  slug: string;
  name: string;
  description: string;
  updatedAt: number;
};

export type UserSkillsPromptAppendResult = {
  text: string;
  truncated: boolean;
  omittedSlugs: string[];
};

export type UserSkillsWritePayload = {
  slug: string;
  markdown: string;
};

export type UserSkillsBuildPromptPayload = {
  slugs: string[];
  maxChars?: number;
};

export type AiTestChatHiPayload =
  | { provider: "google"; googleApiKey: string; modelId: string }
  | {
      provider: "custom";
      customBaseUrl: string;
      customApiKey: string;
      modelId: string;
      /** Extra PEM CA for private TLS (custom OpenAI-compatible hosts). */
      tlsCaPem?: string;
    };

/** Main-process Python sandbox (intelligent_python_execute). */
export type PythonSandboxPayload = {
  packages: string[];
  code: string;
  timeoutMs: number;
  /** Optional user-attached files (main process writes to work dir before executing code). */
  inputFiles?: Array<{ name: string; dataBase64: string }>;
};

export type PythonSandboxExecuteResult =
  | {
      ok: true;
      python_sandbox: {
        success: boolean;
        stdout: string;
        stderr: string;
        images?: Array<{ mime: string; dataBase64: string }>;
        table?: { columns: string[]; rows: unknown[][] } | null;
        files?: Array<{
          name: string;
          size: number;
          dataBase64?: string;
          truncated?: boolean;
        }>;
        error?: string;
      };
    }
  | { ok: false; error: string };

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
  intelligentPort: number;
  intelligentToken: string;
  intelligentListeningPort: number | null;
  /** Absolute path to the bundled stdio MCP entry (pass to `node` in client config). */
  stdioServerPath: string;
  /** Absolute path to the bundled Intelligent stdio MCP entry. */
  intelligentStdioServerPath: string;
  builtInServers: Array<{
    id: "browser_server" | "intelligent_server";
    name: string;
    stdioPath: string;
  }>;
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
  /** Tint taskbar / window icon to match UI theme accent (see theme-app-icon.ts). */
  syncAppIconTheme: (themeId: string) => Promise<void>;
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
  guestEvalChildFrames: (payload: {
    webContentsId: number;
    script: string;
    maxTotal: number;
  }) => Promise<{ success: boolean; error?: string; items?: unknown[] }>;
  guestExecInFrame: (payload: {
    webContentsId: number;
    processId: number;
    routingId: number;
    script: string;
  }) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  saveScreenshot: (
    dataUrl: string,
  ) => Promise<IpcResponse<{ path: string; filename: string }>>;
  readScreenshotFile: (
    filepath: string,
  ) => Promise<IpcResponse<{ dataUrl: string }>>;
  deleteScreenshotFile: (filepath: string) => Promise<IpcResponse>;
  copyScreenshotDataUrlToClipboard: (dataUrl: string) => Promise<IpcResponse>;
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
  bgEvalChildFrames: (
    sessionId: string,
    script: string,
    maxTotal: number,
  ) => Promise<{ success: boolean; error?: string; items?: unknown[] }>;
  bgGuestExecInFrame: <T = unknown>(
    sessionId: string,
    processId: number,
    routingId: number,
    script: string,
  ) => Promise<{ success: boolean; error?: string; data?: T }>;
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
  mcpIntelligentBridgeSetPort: (port: number) => Promise<McpBridgeState>;
  mcpBridgeRegenerateToken: () => Promise<McpBridgeState>;
  mcpIntelligentBridgeRegenerateToken: () => Promise<McpBridgeState>;
  /** Main-process DuckDuckGo HTML fetch (avoids renderer CORS limitations). */
  ddgFetchHtml: (
    query: string,
  ) => Promise<{ success: boolean; html?: string; error?: string }>;
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
    tlsCaPem?: string,
  ) => Promise<ListedAiModel[]>;
  aiTestChatHi: (payload: AiTestChatHiPayload) => Promise<{ reply: string }>;
  /** Run Python in ephemeral venv (main process). */
  pythonSandboxExecute: (payload: PythonSandboxPayload) => Promise<PythonSandboxExecuteResult>;
  /** Stream POST body to OpenAI-compatible chat/completions from main. Returns unsubscribe. */
  aiChatProxyStream: (
    payload: {
      url: string;
      headers: Record<string, string>;
      body: string;
      /** Optional extra PEM CA (custom provider TLS). */
      tlsCaPem?: string;
    },
    handlers: AiChatProxyStreamHandlers,
  ) => () => void;
  /** List user SKILL.md skills (userData/skills). */
  userSkillsList: () => Promise<UserSkillListItem[]>;
  /** Read one skill markdown or error code. */
  userSkillsRead: (
    slug: string,
  ) => Promise<{ ok: true; markdown: string } | { ok: false; error: string }>;
  userSkillsWrite: (
    payload: UserSkillsWritePayload,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  userSkillsDelete: (slug: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  userSkillsBuildPromptAppend: (
    payload: UserSkillsBuildPromptPayload,
  ) => Promise<UserSkillsPromptAppendResult>;
  /** Reveal userData/skills in the file manager. */
  userSkillsOpenFolder: () => Promise<{ ok: boolean }>;
  /** Full chat JSON backup when localStorage quota is exceeded (`userData/chat-backup/conversations-v2.json`). */
  chatStateBackupWrite: (json: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  chatStateBackupRead: () => Promise<string | null>;
}
