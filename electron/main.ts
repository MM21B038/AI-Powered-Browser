import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  session,
  shell,
  Notification,
  dialog,
  webContents,
  type IpcMainInvokeEvent,
  type Rectangle,
} from "electron";
import { DataManager } from "./data-manager";
import { ChromeImporter } from "./import/chrome-importer";
import { FirefoxImporter } from "./import/firefox-importer";
import { wireNetworkCapture } from "./network/network-capture";
import { runRequest } from "./network/request-service";
import {
  listCaptures,
  listTemplates,
  removeTemplate,
  upsertTemplate,
} from "./network/request-store";
import { getTokens, setToken } from "./security/cookie-token-store";
import { registerBackgroundSessionIpc } from "./ipc/background-session-ipc";
import {
  generateMcpToken,
  getBridgeListeningPort,
  loadMcpBridgeConfig,
  saveMcpBridgeConfig,
  startMcpBridge,
  stopAllMcpBridges,
  stopMcpBridge,
  type McpBridgeFileConfig,
} from "./mcp/mcp-bridge";
import type { McpBridgeState } from "../src/shared/ipc-types";
import type { McpServerConfigPayload } from "../src/shared/mcp-external-types";
import {
  externalMcpCallTool,
  externalMcpListTools,
  mcpExternalDisconnect,
} from "./mcp/mcp-external-pool";
import {
  listGoogleModelsMain,
  listOpenAiCompatibleModelsMain,
} from "./ai-list-models";
import { proxyOpenAiChatCompletionsStream } from "./ai-chat-proxy";
import { testGoogleHiMain, testOpenAiHiMain } from "./ai-test-hi";

let mainWindow: BrowserWindow | null = null;
let mcpBridgeConfig: McpBridgeFileConfig | null = null;
const dataManager = new DataManager();
const chromeImporter = new ChromeImporter();
const firefoxImporter = new FirefoxImporter();
const STARTUP_TRACE_FILE = "startup-trace.log";

function appendStartupTrace(message: string): void {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}\n`;
    const logsDir = app.getPath("logs");
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(path.join(logsDir, STARTUP_TRACE_FILE), line, "utf8");
  } catch {
    // Do not crash startup if logging fails.
  }
}

function traceMain(message: string, extra?: unknown): void {
  const suffix = extra === undefined ? "" : ` ${JSON.stringify(extra)}`;
  const full = `${message}${suffix}`;
  // Keep startup trace in file by default; avoid noisy terminal logs in normal runs.
  if (process.env.ORION_VERBOSE_MAIN_LOGS === "1") {
    console.log(`[main] ${full}`);
  }
  appendStartupTrace(`[main] ${full}`);
}

function ensureDirWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function configureAppPaths(): void {
  // Only redirect userData (profile/bookmarks/history DB) to a guaranteed-writable location.
  // We intentionally leave sessionData and cache at their Electron defaults so Chromium
  // never tries to MOVE existing cache files — that move fails with "Access is denied" on
  // Windows when another process holds the cache lock.
  const appName =
    app.getName().replace(/[^a-zA-Z0-9._-]/g, "_") || "AutonomousBrowser";
  const preferredRoot = path.join(app.getPath("appData"), appName);
  const fallbackRoot = path.join(os.tmpdir(), appName);
  const root = ensureDirWritable(preferredRoot) ? preferredRoot : fallbackRoot;
  fs.mkdirSync(root, { recursive: true });

  const userDataPath = path.join(root, "user-data");
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);

  const logsPath = path.join(root, "logs");
  fs.mkdirSync(logsPath, { recursive: true });
  app.setAppLogsPath(logsPath);
  appendStartupTrace(`[main] app paths configured root=${root}`);
}

configureAppPaths();
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  traceMain("single-instance lock denied; quitting new instance");
  app.quit();
} else {
  traceMain("single-instance lock acquired");
}

function getRendererEntry(): string {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    return devUrl;
  }
  return path.join(__dirname, "../../renderer/index.html");
}

function createWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    traceMain("createWindow reused existing window");
    return mainWindow;
  }
  traceMain("createWindow creating new BrowserWindow");
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      webSecurity: true,
    },
  });
  mainWindow = win;

  const entry = getRendererEntry();
  if (entry.startsWith("http")) {
    void win.loadURL(entry);
  } else {
    void win.loadFile(entry);
  }
  traceMain("renderer entry load requested", { entry });

  win.webContents.on("did-finish-load", () => {
    traceMain("renderer did-finish-load");
  });
  win.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    console.error("[main] renderer load failed", { code, desc, validatedURL });
    appendStartupTrace(
      `[main] renderer load failed ${JSON.stringify({ code, desc, validatedURL })}`,
    );
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[main] renderer process gone", details);
    appendStartupTrace(
      `[main] renderer process gone ${JSON.stringify(details)}`,
    );
  });
  win.webContents.on("console-message", (event) => {
    const e = event as unknown as {
      level?: number;
      message?: string;
      sourceId?: string;
      line?: number;
      lineNumber?: number;
    };
    const level = e.level ?? 0;
    const message = e.message ?? "";
    const sourceId = e.sourceId ?? "unknown";
    const line = e.lineNumber ?? e.line ?? 0;
    appendStartupTrace(
      `[renderer-console] level=${level} ${sourceId}:${line} ${message}`,
    );
  });
  win.on("closed", () => {
    traceMain("main window closed");
    mainWindow = null;
  });
  win.on("maximize", () =>
    win.webContents.send("window-state-changed", "maximized"),
  );
  win.on("unmaximize", () =>
    win.webContents.send("window-state-changed", "normal"),
  );
  return win;
}

app.whenReady().then(async () => {
  traceMain("whenReady started");
  await dataManager.initialize();
  traceMain("dataManager initialized");
  try {
    wireNetworkCapture(session.defaultSession);
    traceMain("network capture wired");
  } catch (e) {
    console.warn("[main] network capture disabled", e);
    appendStartupTrace(`[main] network capture disabled ${String(e)}`);
  }
  createWindow();
  mcpBridgeConfig = loadMcpBridgeConfig(app.getPath("userData"));
  applyMcpBridgeFromConfig();
  app.on("activate", () => {
    traceMain("app activate event");
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on("second-instance", () => {
  traceMain("second-instance event");
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  // In development (non-packaged) a second instance means the user ran `npm start`
  // to pick up a new build. Reload the renderer in-place so they don't have to
  // manually close the window first.
  if (!app.isPackaged) {
    traceMain("second-instance reloadIgnoringCache (dev mode)");
    mainWindow.webContents.reloadIgnoringCache();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  traceMain("window-all-closed");
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopAllMcpBridges();
});

function getStdioServerPath(): string {
  return path.join(__dirname, "mcp", "stdio-server.js");
}
function getIntelligentStdioServerPath(): string {
  return path.join(__dirname, "mcp", "stdio-server-intelligent.js");
}

function getMcpBridgeStatePayload(): McpBridgeState {
  const cfg = mcpBridgeConfig ?? loadMcpBridgeConfig(app.getPath("userData"));
  return {
    enabled: cfg.enabled,
    port: cfg.port,
    token: cfg.token,
    listeningPort: getBridgeListeningPort("browser"),
    intelligentPort: cfg.intelligentPort,
    intelligentToken: cfg.intelligentToken,
    intelligentListeningPort: getBridgeListeningPort("intelligent"),
    stdioServerPath: getStdioServerPath(),
    intelligentStdioServerPath: getIntelligentStdioServerPath(),
    builtInServers: [
      { id: "browser_server", name: "Browser Server", stdioPath: getStdioServerPath() },
      { id: "intelligent_server", name: "Intelligent Server", stdioPath: getIntelligentStdioServerPath() },
    ],
  };
}

function applyMcpBridgeFromConfig(): void {
  if (!mcpBridgeConfig) return;
  if (mcpBridgeConfig.enabled) {
    startMcpBridge(
      "browser",
      () => mainWindow,
      mcpBridgeConfig.port,
      mcpBridgeConfig.token,
      (msg) => traceMain("mcp bridge tcp error", { msg }),
    );
    startMcpBridge(
      "intelligent",
      () => mainWindow,
      mcpBridgeConfig.intelligentPort,
      mcpBridgeConfig.intelligentToken,
      (msg) => traceMain("intelligent mcp bridge tcp error", { msg }),
    );
  } else {
    stopMcpBridge("browser");
    stopMcpBridge("intelligent");
  }
}

process.on("uncaughtException", (err) => {
  appendStartupTrace(`[main] uncaughtException ${err?.stack || String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  appendStartupTrace(`[main] unhandledRejection ${String(reason)}`);
});

ipcMain.handle(
  "debug-log",
  (
    _: IpcMainInvokeEvent,
    payload: { source?: string; message?: string; data?: unknown },
  ) => {
    const source = payload?.source || "renderer";
    const message = payload?.message || "";
    appendStartupTrace(
      `[${source}] ${message}${payload?.data !== undefined ? ` ${JSON.stringify(payload.data)}` : ""}`,
    );
    return { success: true };
  },
);

ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-maximize", () =>
  mainWindow?.isMaximized() ? mainWindow?.unmaximize() : mainWindow?.maximize(),
);
ipcMain.handle("window-close", () => mainWindow?.close());
ipcMain.handle("window-is-maximized", () => !!mainWindow?.isMaximized());

ipcMain.handle("open-external", async (_: IpcMainInvokeEvent, url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: "Invalid protocol" };
  } catch {
    return { success: false, error: "Invalid URL" };
  }
});

ipcMain.handle("get-system-info", () => ({
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
  totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
  cpus: os.cpus().length,
}));

ipcMain.handle(
  "show-notification",
  (_: IpcMainInvokeEvent, data: { title?: string; body?: string }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: data?.title || "Autonomous Browser",
        body: data?.body || "",
      }).show();
      return { success: true };
    }
    return { success: false };
  },
);

registerBackgroundSessionIpc(ipcMain, traceMain);

function guestFrameBelongsToWebContents(frame: Electron.WebFrameMain, wc: Electron.WebContents): boolean {
  try {
    const top = frame.top;
    if (!top || top.isDestroyed()) return false;
    const m = wc.mainFrame;
    return top.routingId === m.routingId && top.processId === m.processId;
  } catch {
    return false;
  }
}

ipcMain.handle(
  "guest-eval-child-frames",
  async (
    _: IpcMainInvokeEvent,
    payload: { webContentsId: number; script: string; maxTotal: number },
  ) => {
    try {
      const wc = webContents.fromId(payload.webContentsId);
      if (!wc || wc.isDestroyed()) return { success: false, error: "webContents not found" };
      const script = String(payload.script ?? "");
      const maxTotal = Math.max(0, Math.floor(Number(payload.maxTotal) || 0));
      if (!script) return { success: false, error: "script required" };

      const children = wc.mainFrame.framesInSubtree.filter(
        (f) => f.parent != null && !f.isDestroyed() && !f.detached,
      );

      const items: Record<string, unknown>[] = [];

      for (const frame of children) {
        if (items.length >= maxTotal) break;
        if (!guestFrameBelongsToWebContents(frame, wc)) continue;
        try {
          const data = (await frame.executeJavaScript(script, true)) as { items?: Record<string, unknown>[] };
          const batch = data?.items ?? [];
          const guestFrame = {
            processId: frame.processId,
            routingId: frame.routingId,
            url: frame.url,
            name: frame.name || "",
          };
          for (const it of batch) {
            if (items.length >= maxTotal) break;
            items.push({ ...it, guestFrame });
          }
        } catch {
          /* cross-origin or transient frame errors */
        }
      }
      return { success: true, items };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
);

ipcMain.handle(
  "guest-exec-in-frame",
  async (
    _: IpcMainInvokeEvent,
    payload: { webContentsId: number; processId: number; routingId: number; script: string },
  ) => {
    try {
      const wc = webContents.fromId(payload.webContentsId);
      if (!wc || wc.isDestroyed()) return { success: false, error: "webContents not found" };
      const frame = wc.mainFrame.framesInSubtree.find(
        (f) => f.processId === payload.processId && f.routingId === payload.routingId,
      );
      if (!frame || frame.isDestroyed() || frame.detached) {
        return { success: false, error: "frame not found" };
      }
      if (!guestFrameBelongsToWebContents(frame, wc)) {
        return { success: false, error: "frame not in webContents" };
      }
      const data = await frame.executeJavaScript(String(payload.script ?? ""), true);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
);

ipcMain.handle(
  "capture-webview",
  async (
    _: IpcMainInvokeEvent,
    payload: { webContentsId: number; rect?: Rectangle },
  ) => {
    try {
      const wc = webContents.fromId(payload.webContentsId);
      if (!wc) return { success: false, error: "webContents not found" };
      const img = payload.rect
        ? await wc.capturePage(payload.rect)
        : await wc.capturePage();
      return { success: true, dataUrl: img.toDataURL() };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
);

function getDownloadsDirResolved(): string {
  return path.resolve(app.getPath("downloads"));
}

/** Only allow reading/deleting PNGs saved by this app under the user Downloads folder. */
function isAllowedLibraryScreenshotPath(filepath: string): boolean {
  if (typeof filepath !== "string" || filepath.length === 0) return false;
  let resolved: string;
  try {
    resolved = path.resolve(filepath);
  } catch {
    return false;
  }
  const root = getDownloadsDirResolved();
  const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  const r = norm(resolved);
  const nroot = norm(root);
  const under = r === nroot || r.startsWith(nroot + path.sep);
  if (!under) return false;
  const base = path.basename(resolved);
  return /^screenshot-\d+\.png$/i.test(base);
}

const MAX_SCREENSHOT_READ_BYTES = 40 * 1024 * 1024;

ipcMain.handle(
  "save-screenshot",
  async (_: IpcMainInvokeEvent, dataUrl: string) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = path.join(app.getPath("downloads"), filename);
      fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
      return { success: true, path: filepath, filename };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
);

ipcMain.handle("read-screenshot-file", (_: IpcMainInvokeEvent, filepath: string) => {
  try {
    if (!isAllowedLibraryScreenshotPath(filepath)) {
      return { success: false, error: "path not allowed" };
    }
    const st = fs.statSync(filepath);
    if (!st.isFile() || st.size > MAX_SCREENSHOT_READ_BYTES) {
      return { success: false, error: "file too large or not a file" };
    }
    const buf = fs.readFileSync(filepath);
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    return { success: true, data: { dataUrl } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("delete-screenshot-file", (_: IpcMainInvokeEvent, filepath: string) => {
  try {
    if (!isAllowedLibraryScreenshotPath(filepath)) {
      return { success: false, error: "path not allowed" };
    }
    fs.unlinkSync(filepath);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("copy-screenshot-data-url-to-clipboard", (_: IpcMainInvokeEvent, dataUrl: string) => {
  try {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return { success: false, error: "invalid data url" };
    }
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return { success: false, error: "empty image" };
    clipboard.writeImage(img);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("show-save-dialog", (_: IpcMainInvokeEvent, options) =>
  dialog.showSaveDialog(mainWindow!, options || {}),
);
ipcMain.handle("set-zoom", (_: IpcMainInvokeEvent, level: number) => {
  mainWindow?.webContents.setZoomLevel(level);
  return { success: true };
});

ipcMain.handle("navigate-url", async (_: IpcMainInvokeEvent, url: string) => ({
  success: true,
  url,
}));
ipcMain.handle("fill-form-field", async (_: IpcMainInvokeEvent, data) => ({
  success: true,
  data,
}));
ipcMain.handle(
  "click-element",
  async (_: IpcMainInvokeEvent, selector: string) => ({
    success: true,
    selector,
  }),
);
ipcMain.handle("execute-script", async () => ({ success: true }));
ipcMain.handle(
  "chat-message",
  async (_: IpcMainInvokeEvent, message: string) => ({
    success: true,
    message,
  }),
);
ipcMain.handle(
  "automation-command",
  async (_: IpcMainInvokeEvent, command) => ({
    success: false,
    kind: "action",
    op: "ipc",
    error: "Use renderer bridge legacyBrowser.runAutomationCommand",
    data: command,
  }),
);
ipcMain.handle(
  "automation-line",
  async (_: IpcMainInvokeEvent, line: string) => ({
    success: false,
    kind: "info",
    op: "ipc-line",
    error: "Use renderer bridge legacyBrowser.dispatchAutomationLine",
    data: { line },
  }),
);

function getProfilesDir() {
  return path.join(app.getPath("userData"), "profiles");
}
function ensureProfilesDir() {
  const dir = getProfilesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ipcMain.handle("profile-list", () => {
  ensureProfilesDir();
  return fs
    .readdirSync(getProfilesDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
});
ipcMain.handle(
  "profile-save",
  (_: IpcMainInvokeEvent, payload: { name: string; data: unknown }) => {
    ensureProfilesDir();
    const raw = payload.name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
    const safe = raw || `profile_${Date.now()}`;
    fs.writeFileSync(
      path.join(getProfilesDir(), `${safe}.json`),
      JSON.stringify(payload.data, null, 2),
    );
    return { success: true, name: safe };
  },
);
ipcMain.handle("profile-load", (_: IpcMainInvokeEvent, name: string) => {
  const file = path.join(getProfilesDir(), `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
});
ipcMain.handle("profile-delete", (_: IpcMainInvokeEvent, name: string) => {
  const file = path.join(getProfilesDir(), `${name}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { success: true };
});

ipcMain.handle("get-browser-stats", async () => {
  try {
    const [chrome, firefox] = await Promise.all([
      chromeImporter.getImportStats(),
      firefoxImporter.getImportStats(),
    ]);
    return { chrome, firefox };
  } catch {
    return { chrome: { available: false }, firefox: { available: false } };
  }
});

ipcMain.handle(
  "get-import-stats",
  async (
    _: IpcMainInvokeEvent,
    payload: { browser: "chrome" | "firefox"; profilePath?: string },
  ) => {
    try {
      const imp =
        payload.browser === "chrome" ? chromeImporter : firefoxImporter;
      return await imp.getImportStats(payload.profilePath);
    } catch {
      return {
        available: false,
        bookmarks: 0,
        history: 0,
        cookies: 0,
        passwords: 0,
        autofill: 0,
        browser: null,
      };
    }
  },
);

ipcMain.handle("list-browser-profiles", async () => {
  try {
    const [chromeList, ffList] = await Promise.all([
      chromeImporter.findAllProfiles(),
      firefoxImporter.findAllProfiles(),
    ]);
    const chrome = (chromeList as { browser: string; path: string }[]).map(
      (p) => {
        const folder = path.basename(p.path);
        return {
          path: p.path,
          engine: p.browser,
          label: `${p.browser} · ${folder}`,
        };
      },
    );
    const firefox = (ffList as { name: string; path: string }[]).map((p) => ({
      path: p.path,
      engine: "firefox",
      label: p.name,
    }));
    return { chrome, firefox };
  } catch {
    return { chrome: [], firefox: [] };
  }
});

ipcMain.handle("browser-import", async () => {
  const result: {
    bookmarks: any[];
    history: any[];
    cookies: any[];
    passwords: any[];
    autofill: any[];
    sources: string[];
  } = {
    bookmarks: [],
    history: [],
    cookies: [],
    passwords: [],
    autofill: [],
    sources: [],
  };
  for (const [importer, label] of [
    [chromeImporter, "Chrome"],
    [firefoxImporter, "Firefox"],
  ] as const) {
    try {
      const stats = await importer.getImportStats();
      if (!stats.available) continue;
      const [bm, hist, ck, pw, af] = await Promise.allSettled([
        importer.importBookmarks(),
        importer.importHistory(),
        importer.importCookies(),
        importer.importPasswords(),
        importer.importAutofill(),
      ]);
      if (bm.status === "fulfilled")
        result.bookmarks.push(...bm.value.bookmarks);
      if (hist.status === "fulfilled") result.history.push(...hist.value);
      if (ck.status === "fulfilled") result.cookies.push(...ck.value);
      if (pw.status === "fulfilled") result.passwords.push(...pw.value);
      if (af.status === "fulfilled") result.autofill.push(...af.value);
      result.sources.push(label);
    } catch {
      continue;
    }
  }
  return result;
});

ipcMain.handle(
  "import-browser-data",
  async (
    _: IpcMainInvokeEvent,
    payload: {
      browser: "chrome" | "firefox";
      dataTypes: string[];
      profilePath?: string;
    },
  ) => {
    const importer =
      payload.browser === "chrome" ? chromeImporter : firefoxImporter;
    const profilePath = payload.profilePath;
    const results = {
      bookmarks: 0,
      history: 0,
      cookies: 0,
      passwords: 0,
      autofill: 0,
    };
    try {
      if (payload.dataTypes.includes("bookmarks")) {
        const data = await importer.importBookmarks(profilePath);
        await dataManager.saveBookmarks({
          version: dataManager.version,
          bookmarks: data.bookmarks,
          folders: data.folders,
        });
        results.bookmarks = data.bookmarks.length;
      }
      if (payload.dataTypes.includes("history")) {
        const data = await importer.importHistory(profilePath);
        const current: any = await dataManager.getHistory();
        current.history.push(...data);
        await dataManager.saveHistory(current);
        results.history = data.length;
      }
      if (payload.dataTypes.includes("cookies")) {
        const data = await importer.importCookies(profilePath);
        await dataManager.addCookies(data);
        results.cookies = data.length;
      }
      if (payload.dataTypes.includes("passwords")) {
        const data = await importer.importPasswords(profilePath);
        await dataManager.addPasswords(data);
        results.passwords = data.length;
      }
      if (payload.dataTypes.includes("autofill")) {
        const data = await importer.importAutofill(profilePath);
        await dataManager.addAutofill(data);
        results.autofill = data.length;
      }
      await dataManager.recordImport(
        payload.browser,
        payload.dataTypes,
        Object.values(results).reduce((a, b) => a + b, 0),
      );
      return { success: true, results };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  },
);

ipcMain.handle("get-bookmarks", async () => dataManager.getBookmarks());
ipcMain.handle("get-history", async () => dataManager.getHistory());
ipcMain.handle("get-cookies", async () => dataManager.getCookies());
ipcMain.handle("get-passwords", async () => dataManager.getPasswords());
ipcMain.handle("get-autofill", async () => dataManager.getAutofill());
ipcMain.handle("add-bookmark", async (_: IpcMainInvokeEvent, bookmark) => ({
  success: true,
  bookmark: await dataManager.addBookmark(bookmark),
}));
ipcMain.handle("add-history-entry", async (_: IpcMainInvokeEvent, entry) => {
  await dataManager.addHistoryEntry(entry);
  return { success: true };
});
ipcMain.handle("get-data-stats", async () => dataManager.getStats());
ipcMain.handle("clear-all-data", async () => {
  await dataManager.clearAllData();
  return { success: true };
});

ipcMain.handle("request-save-template", async (_: IpcMainInvokeEvent, tpl) =>
  upsertTemplate(tpl),
);
ipcMain.handle("request-list-templates", async () => listTemplates());
ipcMain.handle(
  "request-delete-template",
  async (_: IpcMainInvokeEvent, id: string) => {
    await removeTemplate(id);
    return { success: true };
  },
);
ipcMain.handle("request-run", async (_: IpcMainInvokeEvent, input) =>
  runRequest(input),
);
ipcMain.handle(
  "request-list-captures",
  async (_: IpcMainInvokeEvent, limit?: number) => listCaptures(limit ?? 100),
);
ipcMain.handle(
  "cookie-profile-set-token",
  async (
    _: IpcMainInvokeEvent,
    payload: { profile: string; name: string; value: string },
  ) => {
    await setToken(payload.profile, payload.name, payload.value);
    return { success: true };
  },
);
ipcMain.handle(
  "cookie-profile-get-tokens",
  async (_: IpcMainInvokeEvent, profile: string) => getTokens(profile),
);

ipcMain.handle("mcp-bridge-get-state", () => getMcpBridgeStatePayload());

ipcMain.handle(
  "mcp-bridge-set-enabled",
  (_: IpcMainInvokeEvent, enabled: boolean) => {
    const ud = app.getPath("userData");
    mcpBridgeConfig = {
      ...(mcpBridgeConfig ?? loadMcpBridgeConfig(ud)),
      enabled: !!enabled,
    };
    saveMcpBridgeConfig(ud, mcpBridgeConfig);
    applyMcpBridgeFromConfig();
    return getMcpBridgeStatePayload();
  },
);

ipcMain.handle("mcp-bridge-set-port", (_: IpcMainInvokeEvent, port: number) => {
  const ud = app.getPath("userData");
  const p = Math.floor(Number(port));
  const safe =
    Number.isFinite(p) && p > 0 && p < 65536
      ? p
      : (mcpBridgeConfig ?? loadMcpBridgeConfig(ud)).port;
  mcpBridgeConfig = {
    ...(mcpBridgeConfig ?? loadMcpBridgeConfig(ud)),
    port: safe,
  };
  saveMcpBridgeConfig(ud, mcpBridgeConfig);
  applyMcpBridgeFromConfig();
  return getMcpBridgeStatePayload();
});

ipcMain.handle("mcp-intelligent-bridge-set-port", (_: IpcMainInvokeEvent, port: number) => {
  const ud = app.getPath("userData");
  const p = Math.floor(Number(port));
  const safe =
    Number.isFinite(p) && p > 0 && p < 65536
      ? p
      : (mcpBridgeConfig ?? loadMcpBridgeConfig(ud)).intelligentPort;
  mcpBridgeConfig = {
    ...(mcpBridgeConfig ?? loadMcpBridgeConfig(ud)),
    intelligentPort: safe,
  };
  saveMcpBridgeConfig(ud, mcpBridgeConfig);
  applyMcpBridgeFromConfig();
  return getMcpBridgeStatePayload();
});

ipcMain.handle("mcp-bridge-regenerate-token", () => {
  const ud = app.getPath("userData");
  mcpBridgeConfig = {
    ...(mcpBridgeConfig ?? loadMcpBridgeConfig(ud)),
    token: generateMcpToken(),
  };
  saveMcpBridgeConfig(ud, mcpBridgeConfig);
  applyMcpBridgeFromConfig();
  return getMcpBridgeStatePayload();
});

ipcMain.handle("mcp-intelligent-bridge-regenerate-token", () => {
  const ud = app.getPath("userData");
  mcpBridgeConfig = {
    ...(mcpBridgeConfig ?? loadMcpBridgeConfig(ud)),
    intelligentToken: generateMcpToken(),
  };
  saveMcpBridgeConfig(ud, mcpBridgeConfig);
  applyMcpBridgeFromConfig();
  return getMcpBridgeStatePayload();
});

ipcMain.handle("ddg-fetch-html", async (_: IpcMainInvokeEvent, query: string) => {
  const q = String(query ?? "").trim();
  if (!q) return { success: false, error: "query_required" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) return { success: false, error: `DuckDuckGo request failed (${res.status})` };
    const html = await res.text();
    return { success: true, html };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
});

ipcMain.handle(
  "mcp-external-list-tools",
  async (_: IpcMainInvokeEvent, cfg: McpServerConfigPayload) => {
    try {
      const tools = await externalMcpListTools(cfg);
      return { ok: true as const, tools };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, tools: [] as [] };
    }
  },
);

ipcMain.handle(
  "mcp-external-call-tool",
  async (
    _: IpcMainInvokeEvent,
    payload: { cfg: McpServerConfigPayload; toolName: string; args: unknown },
  ) => {
    return externalMcpCallTool(payload.cfg, payload.toolName, payload.args);
  },
);

ipcMain.handle(
  "mcp-external-disconnect",
  async (_: IpcMainInvokeEvent, serverId: string) => {
    try {
      await mcpExternalDisconnect(serverId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
);

ipcMain.handle(
  "ai-list-google-models",
  async (_: IpcMainInvokeEvent, apiKey: string) => {
    try {
      return await listGoogleModelsMain(String(apiKey ?? ""));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  },
);

ipcMain.handle(
  "ai-list-openai-models",
  async (
    _: IpcMainInvokeEvent,
    payload: { baseUrl?: string; apiKey?: string; tlsCaPem?: string },
  ) => {
    try {
      return await listOpenAiCompatibleModelsMain(
        String(payload?.baseUrl ?? ""),
        String(payload?.apiKey ?? ""),
        typeof payload?.tlsCaPem === "string" ? payload.tlsCaPem : undefined,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  },
);

ipcMain.handle(
  "ai-test-chat-hi",
  async (_: IpcMainInvokeEvent, payload: unknown) => {
    const p = payload as {
      provider?: string;
      googleApiKey?: string;
      customBaseUrl?: string;
      customApiKey?: string;
      modelId?: string;
      tlsCaPem?: string;
    };
    const modelId = String(p?.modelId ?? "");
    try {
      if (p?.provider === "custom") {
        return await testOpenAiHiMain(
          String(p?.customBaseUrl ?? ""),
          String(p?.customApiKey ?? ""),
          modelId,
          typeof p?.tlsCaPem === "string" ? p.tlsCaPem : undefined,
        );
      }
      return await testGoogleHiMain(String(p?.googleApiKey ?? ""), modelId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  },
);

ipcMain.handle(
  "ai-chat-proxy-start",
  async (
    event: IpcMainInvokeEvent,
    payload: {
      channel: string;
      url: string;
      headers: Record<string, string>;
      body: string;
      tlsCaPem?: string;
    },
  ) => {
    await proxyOpenAiChatCompletionsStream(
      event.sender,
      payload.channel,
      payload.url,
      payload.headers,
      payload.body,
      typeof payload.tlsCaPem === "string" ? payload.tlsCaPem : undefined,
    );
  },
);
