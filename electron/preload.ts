import { contextBridge, ipcRenderer } from "electron";
import type { ElectronApi, ImportBrowserDataOptions } from "../src/shared/ipc-types";

const electronApi: ElectronApi = {
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowStateChanged: (cb) => {
    ipcRenderer.on("window-state-changed", (_, state: "maximized" | "normal") => cb(state));
  },
  navigateUrl: (url) => ipcRenderer.invoke("navigate-url", url),
  fillFormField: (data) => ipcRenderer.invoke("fill-form-field", data),
  clickElement: (selector) => ipcRenderer.invoke("click-element", selector),
  executeScript: (script) => ipcRenderer.invoke("execute-script", script),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  showNotification: (title, body) => ipcRenderer.invoke("show-notification", { title, body }),
  captureWebview: (webContentsId, rect) => ipcRenderer.invoke("capture-webview", { webContentsId, rect }),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke("save-screenshot", dataUrl),
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),
  setZoom: (level) => ipcRenderer.invoke("set-zoom", level),
  sendChatMessage: (message) => ipcRenderer.invoke("chat-message", message),
  profileList: () => ipcRenderer.invoke("profile-list"),
  profileSave: (name, data) => ipcRenderer.invoke("profile-save", { name, data }),
  profileLoad: (name) => ipcRenderer.invoke("profile-load", name),
  profileDelete: (name) => ipcRenderer.invoke("profile-delete", name),
  browserImport: () => ipcRenderer.invoke("browser-import"),
  getBrowserStats: () => ipcRenderer.invoke("get-browser-stats"),
  getImportStats: (payload) => ipcRenderer.invoke("get-import-stats", payload),
  listBrowserProfiles: () => ipcRenderer.invoke("list-browser-profiles"),
  importBrowserData: (options: ImportBrowserDataOptions) => ipcRenderer.invoke("import-browser-data", options),
  runAutomationCommand: (cmd) => ipcRenderer.invoke("automation-command", cmd),
  runAutomationLine: (line) => ipcRenderer.invoke("automation-line", line),
  requestSaveTemplate: (tpl) => ipcRenderer.invoke("request-save-template", tpl),
  requestListTemplates: () => ipcRenderer.invoke("request-list-templates"),
  requestDeleteTemplate: (id) => ipcRenderer.invoke("request-delete-template", id),
  requestRun: (input) => ipcRenderer.invoke("request-run", input),
  requestListCaptures: (limit) => ipcRenderer.invoke("request-list-captures", limit),
  cookieProfileSetToken: (profile, name, value) =>
    ipcRenderer.invoke("cookie-profile-set-token", { profile, name, value }),
  cookieProfileGetTokens: (profile) => ipcRenderer.invoke("cookie-profile-get-tokens", profile),
  getBookmarks: () => ipcRenderer.invoke("get-bookmarks"),
  getHistory: () => ipcRenderer.invoke("get-history"),
  getCookies: () => ipcRenderer.invoke("get-cookies"),
  getPasswords: () => ipcRenderer.invoke("get-passwords"),
  getAutofill: () => ipcRenderer.invoke("get-autofill"),
  addBookmark: (bookmark) => ipcRenderer.invoke("add-bookmark", bookmark),
  addHistoryEntry: (entry) => ipcRenderer.invoke("add-history-entry", entry),
  getDataStats: () => ipcRenderer.invoke("get-data-stats"),
  clearAllData: () => ipcRenderer.invoke("clear-all-data"),
};

contextBridge.exposeInMainWorld("electronAPI", electronApi);
