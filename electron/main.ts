import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  Notification,
  dialog,
  webContents,
  type IpcMainInvokeEvent,
  type Rectangle,
} from "electron";
import { DataManager } from "./data-manager";
import { ChromeImporter } from "./chrome-importer";
import { FirefoxImporter } from "./firefox-importer";
import { wireNetworkCapture } from "./network-capture";
import { runRequest } from "./request-service";
import { listCaptures, listTemplates, removeTemplate, upsertTemplate } from "./request-store";
import { getTokens, setToken } from "./security/cookie-token-store";

let mainWindow: BrowserWindow | null = null;
const dataManager = new DataManager();
const chromeImporter = new ChromeImporter();
const firefoxImporter = new FirefoxImporter();
const STARTUP_TRACE_FILE = "startup-trace.log";

// ─────────────────────────────────────────────────────────────
// Background sessions (Playwright-like)
// One hidden/offscreen BrowserWindow per sessionId + partition.
// This allows headless/non-active sessions to navigate/eval/screenshot
// without hijacking the visible renderer <webview>.
// ─────────────────────────────────────────────────────────────
type BgSession = { win: BrowserWindow; sessionId: string };
const backgroundSessions = new Map<string, BgSession>();

function getPartitionForSession(sessionId: string): string {
  return `persist:orion_${sessionId}`;
}

async function waitForDomReady(wc: Electron.WebContents, timeoutMs = 12000): Promise<void> {
  if (wc.isDestroyed()) throw new Error("webContents destroyed");
  // dom-ready can fire very quickly; if the page is already interactive, don't hang.
  // Using isLoading as a cheap guard.
  if (!wc.isLoading()) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("dom-ready timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      wc.removeListener("dom-ready", onReady);
      wc.removeListener("destroyed", onDestroyed);
    };
    const onDestroyed = () => {
      cleanup();
      reject(new Error("webContents destroyed"));
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    wc.once("destroyed", onDestroyed);
    wc.once("dom-ready", onReady);
  });
}

async function waitForDidFinishLoad(wc: Electron.WebContents, timeoutMs = 20000): Promise<void> {
  if (wc.isDestroyed()) throw new Error("webContents destroyed");
  if (!wc.isLoading()) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("did-finish-load timeout"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      wc.removeListener("did-finish-load", onFinish);
      wc.removeListener("did-fail-load", onFail);
      wc.removeListener("destroyed", onDestroyed);
    };
    const onDestroyed = () => {
      cleanup();
      reject(new Error("webContents destroyed"));
    };
    const onFail = (_e: unknown, code: number, desc: string) => {
      cleanup();
      reject(new Error(`did-fail-load ${code}: ${desc}`));
    };
    const onFinish = () => {
      cleanup();
      resolve();
    };
    wc.once("destroyed", onDestroyed);
    wc.once("did-fail-load", onFail as never);
    wc.once("did-finish-load", onFinish);
  });
}

function ensureBackgroundSession(sessionId: string): BgSession {
  const existing = backgroundSessions.get(sessionId);
  if (existing && !existing.win.isDestroyed()) return existing;

  const partition = getPartitionForSession(sessionId);
  traceMain("bg ensure session", { sessionId, partition });

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    webPreferences: {
      offscreen: true,
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.on("closed", () => {
    backgroundSessions.delete(sessionId);
  });
  // Keep a simple, deterministic start page.
  void win.loadURL("about:blank").catch(() => {});

  const s: BgSession = { win, sessionId };
  backgroundSessions.set(sessionId, s);
  return s;
}

function killBackgroundSession(sessionId: string): boolean {
  const s = backgroundSessions.get(sessionId);
  if (!s) return false;
  backgroundSessions.delete(sessionId);
  try {
    if (!s.win.isDestroyed()) s.win.destroy();
  } catch {
    /* ignore */
  }
  return true;
}

async function withBackgroundWebContents<T>(sessionId: string, fn: (wc: Electron.WebContents, win: BrowserWindow) => Promise<T>): Promise<T> {
  const s = ensureBackgroundSession(sessionId);
  const wc = s.win.webContents;
  if (wc.isDestroyed()) throw new Error("webContents destroyed");
  return await fn(wc, s.win);
}

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
  console.log(`[main] ${full}`);
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
  const appName = app.getName().replace(/[^a-zA-Z0-9._-]/g, "_") || "AutonomousBrowser";
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
    appendStartupTrace(`[main] renderer process gone ${JSON.stringify(details)}`);
  });
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    appendStartupTrace(
      `[renderer-console] level=${level} ${sourceId}:${line} ${message}`,
    );
  });
  win.on("closed", () => {
    traceMain("main window closed");
    mainWindow = null;
  });
  win.on("maximize", () => win.webContents.send("window-state-changed", "maximized"));
  win.on("unmaximize", () => win.webContents.send("window-state-changed", "normal"));
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

process.on("uncaughtException", (err) => {
  appendStartupTrace(`[main] uncaughtException ${err?.stack || String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  appendStartupTrace(`[main] unhandledRejection ${String(reason)}`);
});

ipcMain.handle("debug-log", (_: IpcMainInvokeEvent, payload: { source?: string; message?: string; data?: unknown }) => {
  const source = payload?.source || "renderer";
  const message = payload?.message || "";
  appendStartupTrace(
    `[${source}] ${message}${payload?.data !== undefined ? ` ${JSON.stringify(payload.data)}` : ""}`,
  );
  return { success: true };
});

ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-maximize", () => (mainWindow?.isMaximized() ? mainWindow?.unmaximize() : mainWindow?.maximize()));
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

ipcMain.handle("show-notification", (_: IpcMainInvokeEvent, data: { title?: string; body?: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title: data?.title || "Autonomous Browser", body: data?.body || "" }).show();
    return { success: true };
  }
  return { success: false };
});

// ── Background session IPC (Playwright-like) ──────────────────
ipcMain.handle("bg-session-ensure", async (_: IpcMainInvokeEvent, payload: { sessionId: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    ensureBackgroundSession(sessionId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-session-kill", async (_: IpcMainInvokeEvent, payload: { sessionId: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    const ok = killBackgroundSession(sessionId);
    return { success: ok, error: ok ? undefined : "not found" };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-goto", async (_: IpcMainInvokeEvent, payload: { sessionId: string; url: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    const url = String(payload?.url || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    if (!url) return { success: false, error: "url required" };
    await withBackgroundWebContents(sessionId, async (_wc, win) => {
      await win.loadURL(url);
      return true;
    });
    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-eval", async (_: IpcMainInvokeEvent, payload: { sessionId: string; script: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    const script = String(payload?.script || "");
    if (!sessionId) return { success: false, error: "sessionId required" };
    const data = await withBackgroundWebContents(sessionId, async (wc) => {
      await waitForDomReady(wc, 12000);
      return await wc.executeJavaScript(script, true);
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-url", async (_: IpcMainInvokeEvent, payload: { sessionId: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    const url = await withBackgroundWebContents(sessionId, async (wc) => wc.getURL());
    return { success: true, data: { url } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-title", async (_: IpcMainInvokeEvent, payload: { sessionId: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    const title = await withBackgroundWebContents(sessionId, async (wc) => wc.getTitle());
    return { success: true, data: { title } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("bg-screenshot", async (_: IpcMainInvokeEvent, payload: { sessionId: string }) => {
  try {
    const sessionId = String(payload?.sessionId || "").trim();
    if (!sessionId) return { success: false, error: "sessionId required" };
    const dataUrl = await withBackgroundWebContents(sessionId, async (wc) => {
      await waitForDidFinishLoad(wc, 20000).catch(() => {});
      const img = await wc.capturePage();
      return img.toDataURL();
    });
    return { success: true, data: { dataUrl } };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("capture-webview", async (_: IpcMainInvokeEvent, payload: { webContentsId: number; rect?: Rectangle }) => {
  try {
    const wc = webContents.fromId(payload.webContentsId);
    if (!wc) return { success: false, error: "webContents not found" };
    const img = payload.rect ? await wc.capturePage(payload.rect) : await wc.capturePage();
    return { success: true, dataUrl: img.toDataURL() };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("save-screenshot", async (_: IpcMainInvokeEvent, dataUrl: string) => {
  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(app.getPath("downloads"), filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
    return { success: true, path: filepath, filename };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("show-save-dialog", (_: IpcMainInvokeEvent, options) => dialog.showSaveDialog(mainWindow!, options || {}));
ipcMain.handle("set-zoom", (_: IpcMainInvokeEvent, level: number) => {
  mainWindow?.webContents.setZoomLevel(level);
  return { success: true };
});

ipcMain.handle("navigate-url", async (_: IpcMainInvokeEvent, url: string) => ({ success: true, url }));
ipcMain.handle("fill-form-field", async (_: IpcMainInvokeEvent, data) => ({ success: true, data }));
ipcMain.handle("click-element", async (_: IpcMainInvokeEvent, selector: string) => ({ success: true, selector }));
ipcMain.handle("execute-script", async () => ({ success: true }));
ipcMain.handle("chat-message", async (_: IpcMainInvokeEvent, message: string) => ({ success: true, message }));
ipcMain.handle("automation-command", async (_: IpcMainInvokeEvent, command) => ({ success: false, kind: "action", op: "ipc", error: "Use renderer bridge legacyBrowser.runAutomationCommand", data: command }));
ipcMain.handle("automation-line", async (_: IpcMainInvokeEvent, line: string) => ({ success: false, kind: "info", op: "ipc-line", error: "Use renderer bridge legacyBrowser.dispatchAutomationLine", data: { line } }));

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
ipcMain.handle("profile-save", (_: IpcMainInvokeEvent, payload: { name: string; data: unknown }) => {
  ensureProfilesDir();
  const raw = payload.name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
  const safe = raw || `profile_${Date.now()}`;
  fs.writeFileSync(path.join(getProfilesDir(), `${safe}.json`), JSON.stringify(payload.data, null, 2));
  return { success: true, name: safe };
});
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
    const [chrome, firefox] = await Promise.all([chromeImporter.getImportStats(), firefoxImporter.getImportStats()]);
    return { chrome, firefox };
  } catch {
    return { chrome: { available: false }, firefox: { available: false } };
  }
});

ipcMain.handle(
  "get-import-stats",
  async (_: IpcMainInvokeEvent, payload: { browser: "chrome" | "firefox"; profilePath?: string }) => {
    try {
      const imp = payload.browser === "chrome" ? chromeImporter : firefoxImporter;
      return await imp.getImportStats(payload.profilePath);
    } catch {
      return { available: false, bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0, browser: null };
    }
  },
);

ipcMain.handle("list-browser-profiles", async () => {
  try {
    const [chromeList, ffList] = await Promise.all([
      chromeImporter.findAllProfiles(),
      firefoxImporter.findAllProfiles(),
    ]);
    const chrome = (chromeList as { browser: string; path: string }[]).map((p) => {
      const folder = path.basename(p.path);
      return {
        path: p.path,
        engine: p.browser,
        label: `${p.browser} · ${folder}`,
      };
    });
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
  } = { bookmarks: [], history: [], cookies: [], passwords: [], autofill: [], sources: [] };
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
      if (bm.status === "fulfilled") result.bookmarks.push(...bm.value.bookmarks);
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
    payload: { browser: "chrome" | "firefox"; dataTypes: string[]; profilePath?: string },
  ) => {
  const importer = payload.browser === "chrome" ? chromeImporter : firefoxImporter;
  const profilePath = payload.profilePath;
  const results = { bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0 };
  try {
    if (payload.dataTypes.includes("bookmarks")) {
      const data = await importer.importBookmarks(profilePath);
      await dataManager.saveBookmarks({ version: dataManager.version, bookmarks: data.bookmarks, folders: data.folders });
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
    await dataManager.recordImport(payload.browser, payload.dataTypes, Object.values(results).reduce((a, b) => a + b, 0));
    return { success: true, results };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle("get-bookmarks", async () => dataManager.getBookmarks());
ipcMain.handle("get-history", async () => dataManager.getHistory());
ipcMain.handle("get-cookies", async () => dataManager.getCookies());
ipcMain.handle("get-passwords", async () => dataManager.getPasswords());
ipcMain.handle("get-autofill", async () => dataManager.getAutofill());
ipcMain.handle("add-bookmark", async (_: IpcMainInvokeEvent, bookmark) => ({ success: true, bookmark: await dataManager.addBookmark(bookmark) }));
ipcMain.handle("add-history-entry", async (_: IpcMainInvokeEvent, entry) => {
  await dataManager.addHistoryEntry(entry);
  return { success: true };
});
ipcMain.handle("get-data-stats", async () => dataManager.getStats());
ipcMain.handle("clear-all-data", async () => {
  await dataManager.clearAllData();
  return { success: true };
});

ipcMain.handle("request-save-template", async (_: IpcMainInvokeEvent, tpl) => upsertTemplate(tpl));
ipcMain.handle("request-list-templates", async () => listTemplates());
ipcMain.handle("request-delete-template", async (_: IpcMainInvokeEvent, id: string) => {
  await removeTemplate(id);
  return { success: true };
});
ipcMain.handle("request-run", async (_: IpcMainInvokeEvent, input) => runRequest(input));
ipcMain.handle("request-list-captures", async (_: IpcMainInvokeEvent, limit?: number) => listCaptures(limit ?? 100));
ipcMain.handle("cookie-profile-set-token", async (_: IpcMainInvokeEvent, payload: { profile: string; name: string; value: string }) => {
  await setToken(payload.profile, payload.name, payload.value);
  return { success: true };
});
ipcMain.handle("cookie-profile-get-tokens", async (_: IpcMainInvokeEvent, profile: string) => getTokens(profile));
