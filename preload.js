const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  windowMinimize:       () => ipcRenderer.invoke("window-minimize"),
  windowMaximize:       () => ipcRenderer.invoke("window-maximize"),
  windowClose:          () => ipcRenderer.invoke("window-close"),
  windowIsMaximized:    () => ipcRenderer.invoke("window-is-maximized"),
  onWindowStateChanged: (cb) => ipcRenderer.on("window-state-changed", (_, state) => cb(state)),

  // Navigation (pass-through)
  navigateUrl:   (url)      => ipcRenderer.invoke("navigate-url", url),
  fillFormField: (data)     => ipcRenderer.invoke("fill-form-field", data),
  clickElement:  (selector) => ipcRenderer.invoke("click-element", selector),
  executeScript: (script)   => ipcRenderer.invoke("execute-script", script),

  // Shell
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // System
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),

  // Notifications
  showNotification: (title, body) => ipcRenderer.invoke("show-notification", { title, body }),

  // Screenshot
  captureWebview: (webContentsId, rect) => ipcRenderer.invoke("capture-webview", { webContentsId, rect }),
  saveScreenshot: (dataUrl)  => ipcRenderer.invoke("save-screenshot", dataUrl),
  showSaveDialog: (options)  => ipcRenderer.invoke("show-save-dialog", options),

  // Zoom
  setZoom: (level) => ipcRenderer.invoke("set-zoom", level),

  // Chat
  sendChatMessage: (message) => ipcRenderer.invoke("chat-message", message),

  // Profiles
  profileList:   ()           => ipcRenderer.invoke("profile-list"),
  profileSave:   (name, data) => ipcRenderer.invoke("profile-save", { name, data }),
  profileLoad:   (name)       => ipcRenderer.invoke("profile-load", name),
  profileDelete: (name)       => ipcRenderer.invoke("profile-delete", name),

  // Browser import
  browserImport: () => ipcRenderer.invoke("browser-import"),

  // Main → Renderer events
  onFromMain: (cb) => ipcRenderer.on("from-main", (_, data) => cb(data)),
});
