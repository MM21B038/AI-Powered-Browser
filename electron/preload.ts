import { contextBridge, ipcRenderer } from "electron";
import type {
  ElectronApi,
  ImportBrowserDataOptions,
} from "../src/shared/ipc-types";

const electronApi: ElectronApi = {
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowStateChanged: (cb) => {
    ipcRenderer.on("window-state-changed", (_, state: "maximized" | "normal") =>
      cb(state),
    );
  },
  navigateUrl: (url) => ipcRenderer.invoke("navigate-url", url),
  fillFormField: (data) => ipcRenderer.invoke("fill-form-field", data),
  clickElement: (selector) => ipcRenderer.invoke("click-element", selector),
  executeScript: (script) => ipcRenderer.invoke("execute-script", script),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  showNotification: (title, body) =>
    ipcRenderer.invoke("show-notification", { title, body }),
  captureWebview: (webContentsId, rect) =>
    ipcRenderer.invoke("capture-webview", { webContentsId, rect }),
  guestEvalChildFrames: (payload: {
    webContentsId: number;
    script: string;
    maxTotal: number;
  }) => ipcRenderer.invoke("guest-eval-child-frames", payload),
  guestExecInFrame: (payload: {
    webContentsId: number;
    processId: number;
    routingId: number;
    script: string;
  }) => ipcRenderer.invoke("guest-exec-in-frame", payload),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke("save-screenshot", dataUrl),
  bgEnsureSession: (sessionId) =>
    ipcRenderer.invoke("bg-session-ensure", { sessionId }),
  bgKillSession: (sessionId) =>
    ipcRenderer.invoke("bg-session-kill", { sessionId }),
  bgGoto: (sessionId, url) => ipcRenderer.invoke("bg-goto", { sessionId, url }),
  bgEval: (sessionId, script) =>
    ipcRenderer.invoke("bg-eval", { sessionId, script }),
  bgEvalChildFrames: (sessionId, script, maxTotal) =>
    ipcRenderer.invoke("bg-eval-child-frames", { sessionId, script, maxTotal }),
  bgGuestExecInFrame: (sessionId, processId, routingId, script) =>
    ipcRenderer.invoke("bg-guest-exec-in-frame", {
      sessionId,
      processId,
      routingId,
      script,
    }),
  bgGetUrl: (sessionId) => ipcRenderer.invoke("bg-url", { sessionId }),
  bgGetTitle: (sessionId) => ipcRenderer.invoke("bg-title", { sessionId }),
  bgScreenshot: (sessionId) =>
    ipcRenderer.invoke("bg-screenshot", { sessionId }),
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),
  setZoom: (level) => ipcRenderer.invoke("set-zoom", level),
  sendChatMessage: (message) => ipcRenderer.invoke("chat-message", message),
  profileList: () => ipcRenderer.invoke("profile-list"),
  profileSave: (name, data) =>
    ipcRenderer.invoke("profile-save", { name, data }),
  profileLoad: (name) => ipcRenderer.invoke("profile-load", name),
  profileDelete: (name) => ipcRenderer.invoke("profile-delete", name),
  browserImport: () => ipcRenderer.invoke("browser-import"),
  getBrowserStats: () => ipcRenderer.invoke("get-browser-stats"),
  getImportStats: (payload) => ipcRenderer.invoke("get-import-stats", payload),
  listBrowserProfiles: () => ipcRenderer.invoke("list-browser-profiles"),
  importBrowserData: (options: ImportBrowserDataOptions) =>
    ipcRenderer.invoke("import-browser-data", options),
  runAutomationCommand: (cmd) => ipcRenderer.invoke("automation-command", cmd),
  runAutomationLine: (line) => ipcRenderer.invoke("automation-line", line),
  requestSaveTemplate: (tpl) =>
    ipcRenderer.invoke("request-save-template", tpl),
  requestListTemplates: () => ipcRenderer.invoke("request-list-templates"),
  requestDeleteTemplate: (id) =>
    ipcRenderer.invoke("request-delete-template", id),
  requestRun: (input) => ipcRenderer.invoke("request-run", input),
  requestListCaptures: (limit) =>
    ipcRenderer.invoke("request-list-captures", limit),
  cookieProfileSetToken: (profile, name, value) =>
    ipcRenderer.invoke("cookie-profile-set-token", { profile, name, value }),
  cookieProfileGetTokens: (profile) =>
    ipcRenderer.invoke("cookie-profile-get-tokens", profile),
  getBookmarks: () => ipcRenderer.invoke("get-bookmarks"),
  getHistory: () => ipcRenderer.invoke("get-history"),
  getCookies: () => ipcRenderer.invoke("get-cookies"),
  getPasswords: () => ipcRenderer.invoke("get-passwords"),
  getAutofill: () => ipcRenderer.invoke("get-autofill"),
  addBookmark: (bookmark) => ipcRenderer.invoke("add-bookmark", bookmark),
  addHistoryEntry: (entry) => ipcRenderer.invoke("add-history-entry", entry),
  getDataStats: () => ipcRenderer.invoke("get-data-stats"),
  clearAllData: () => ipcRenderer.invoke("clear-all-data"),
  debugLog: (payload) => ipcRenderer.invoke("debug-log", payload),
  mcpBridgeGetState: () => ipcRenderer.invoke("mcp-bridge-get-state"),
  mcpBridgeSetEnabled: (enabled) =>
    ipcRenderer.invoke("mcp-bridge-set-enabled", enabled),
  mcpBridgeSetPort: (port) => ipcRenderer.invoke("mcp-bridge-set-port", port),
  mcpBridgeRegenerateToken: () =>
    ipcRenderer.invoke("mcp-bridge-regenerate-token"),
  mcpExternalListTools: (cfg) =>
    ipcRenderer.invoke("mcp-external-list-tools", cfg),
  mcpExternalCallTool: (cfg, toolName, args) =>
    ipcRenderer.invoke("mcp-external-call-tool", { cfg, toolName, args }),
  mcpExternalDisconnect: (serverId) =>
    ipcRenderer.invoke("mcp-external-disconnect", serverId),
  aiListGoogleModels: (apiKey) =>
    ipcRenderer.invoke("ai-list-google-models", apiKey),
  aiListOpenAiModels: (baseUrl, apiKey) =>
    ipcRenderer.invoke("ai-list-openai-models", { baseUrl, apiKey }),
  aiTestChatHi: (payload) => ipcRenderer.invoke("ai-test-chat-hi", payload),
  aiChatProxyStream: (payload, handlers) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = `ai-chat-proxy:${id}`;
    const listener = (
      _: Electron.IpcRendererEvent,
      msg: { chunk?: string; error?: string; done?: boolean; httpStatus?: number },
    ) => {
      if (msg.error != null && msg.error !== "") {
        ipcRenderer.removeListener(channel, listener);
        handlers.onError(msg.error, msg.httpStatus);
        return;
      }
      if (msg.done) {
        ipcRenderer.removeListener(channel, listener);
        handlers.onComplete();
        return;
      }
      if (typeof msg.chunk === "string" && msg.chunk.length > 0) {
        handlers.onChunk(msg.chunk);
      }
    };
    ipcRenderer.on(channel, listener);
    ipcRenderer
      .invoke("ai-chat-proxy-start", { channel, ...payload })
      .catch((e) => {
        ipcRenderer.removeListener(channel, listener);
        handlers.onError(e instanceof Error ? e.message : String(e));
      });
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronApi);
