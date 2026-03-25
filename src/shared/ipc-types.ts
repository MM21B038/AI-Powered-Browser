import type { AutomationCommand, AutomationResult } from "./automation-types";

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
  dataTypes: Array<"bookmarks" | "history" | "cookies" | "passwords" | "autofill">;
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

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

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
  captureWebview: (webContentsId: number, rect?: unknown) => Promise<IpcResponse<{ dataUrl: string }>>;
  saveScreenshot: (dataUrl: string) => Promise<IpcResponse<{ path: string; filename: string }>>;
  showSaveDialog: (options?: unknown) => Promise<unknown>;
  setZoom: (level: number) => Promise<IpcResponse>;
  sendChatMessage: (message: string) => Promise<IpcResponse>;
  profileList: () => Promise<string[]>;
  profileSave: (name: string, data: unknown) => Promise<IpcResponse<{ name: string }>>;
  profileLoad: (name: string) => Promise<unknown>;
  profileDelete: (name: string) => Promise<IpcResponse>;
  browserImport: () => Promise<unknown>;
  getBrowserStats: () => Promise<{ chrome: BrowserImportStats; firefox: BrowserImportStats }>;
  getImportStats: (payload: {
    browser: "chrome" | "firefox";
    profilePath?: string;
  }) => Promise<ImportStatsDetail>;
  listBrowserProfiles: () => Promise<ListBrowserProfilesResult>;
  importBrowserData: (options: ImportBrowserDataOptions) => Promise<IpcResponse<{ results: Record<string, number> }>>;
  runAutomationCommand: (cmd: AutomationCommand) => Promise<AutomationResult>;
  runAutomationLine: (line: string) => Promise<AutomationResult>;
  requestSaveTemplate: (tpl: Omit<RequestTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<RequestTemplate>;
  requestListTemplates: () => Promise<RequestTemplate[]>;
  requestDeleteTemplate: (id: string) => Promise<IpcResponse>;
  requestRun: (input: RequestRunInput) => Promise<RequestRunResult>;
  requestListCaptures: (limit?: number) => Promise<CapturedRequestRecord[]>;
  cookieProfileSetToken: (profile: string, name: string, value: string) => Promise<IpcResponse>;
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
}
