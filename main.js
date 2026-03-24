const path = require("path");
const fs = require("fs");
const os = require("os");

const { app, BrowserWindow, ipcMain, shell, Notification, dialog, webContents } = require("electron/main");

let DataManager, ChromeImporter, FirefoxImporter;
let dataManager, chromeImporter, firefoxImporter;

async function initializeDataManager() {
  DataManager    = require("./data-manager");
  ChromeImporter = require("./chrome-importer");
  FirefoxImporter= require("./firefox-importer");
  dataManager    = new DataManager();
  chromeImporter = new ChromeImporter();
  firefoxImporter= new FirefoxImporter();
  try {
    await dataManager.initialize();
    console.log("Data manager initialized");
  } catch (err) {
    console.error("Data manager init failed:", err);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, contextIsolation: true,
      sandbox: false, webviewTag: true, webSecurity: true,
    },
  });
  mainWindow.loadFile("index.html");
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("maximize",   () => mainWindow?.webContents.send("window-state-changed", "maximized"));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send("window-state-changed", "normal"));
}

const CONSOLE_NOISE = [
  "privacy-pro-eligible", "country.json", "animated-download-icon",
  "Insecure Content-Security-Policy", "preloaded using link preload but not used",
  "credentials mode does not match",
];

app.whenReady().then(async () => {
  await initializeDataManager();
  createWindow();
  app.on("web-contents-created", (_, wc) => {
    wc.on("console-message", (e) => {
      if (CONSOLE_NOISE.some(p => e.message?.includes(p))) e.preventDefault();
    });
  });
  app.on("activate", () => { if (!mainWindow) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ── Window Controls ───────────────────────────────────────────────────────────
ipcMain.handle("window-minimize",    () => mainWindow?.minimize());
ipcMain.handle("window-maximize",    () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle("window-close",       () => mainWindow?.close());
ipcMain.handle("window-is-maximized",() => !!(mainWindow?.isMaximized()));

// ── Shell ─────────────────────────────────────────────────────────────────────
ipcMain.handle("open-external", async (_, url) => {
  try {
    const p = new URL(url);
    if (p.protocol === "https:" || p.protocol === "http:") { await shell.openExternal(url); return { success: true }; }
    return { success: false, error: "Invalid protocol" };
  } catch { return { success: false, error: "Invalid URL" }; }
});

// ── System Info ───────────────────────────────────────────────────────────────
ipcMain.handle("get-system-info", () => ({
  platform: process.platform, arch: process.arch,
  version: process.versions.electron, chrome: process.versions.chrome,
  node: process.versions.node,
  memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
  totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + " GB",
  cpus: os.cpus().length,
}));

// ── Notifications ─────────────────────────────────────────────────────────────
ipcMain.handle("show-notification", (_, data) => {
  if (Notification.isSupported()) {
    new Notification({ title: data?.title || "Orion", body: data?.body || "" }).show();
    return { success: true };
  }
  return { success: false };
});

// ── Screenshot ────────────────────────────────────────────────────────────────
ipcMain.handle("capture-webview", async (_, { webContentsId, rect }) => {
  try {
    const wc = webContents.fromId(webContentsId);
    if (!wc) return { success: false, error: "webContents not found" };
    const img = rect ? await wc.capturePage(rect) : await wc.capturePage();
    return { success: true, dataUrl: img.toDataURL() };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("save-screenshot", async (_, dataUrl) => {
  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const filename = "screenshot-" + Date.now() + ".png";
    const filepath = path.join(app.getPath("downloads"), filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
    return { success: true, path: filepath, filename };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle("show-save-dialog", async (_, options) => dialog.showSaveDialog(mainWindow, options || {}));

// ── Zoom ──────────────────────────────────────────────────────────────────────
ipcMain.handle("set-zoom", (_, level) => { mainWindow?.webContents.setZoomLevel(level); return { success: true }; });

// ── Pass-through stubs ────────────────────────────────────────────────────────
ipcMain.handle("navigate-url",    async (_, url)      => ({ success: true, url }));
ipcMain.handle("fill-form-field", async (_, data)     => ({ success: true, data }));
ipcMain.handle("click-element",   async (_, selector) => ({ success: true, selector }));
ipcMain.handle("execute-script",  async ()            => ({ success: true }));
ipcMain.handle("chat-message",    async (_, message)  => ({ success: true, message }));

// ── Profiles ──────────────────────────────────────────────────────────────────
function getProfilesDir() { return path.join(app.getPath("userData"), "profiles"); }
function ensureProfilesDir() { const d = getProfilesDir(); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

ipcMain.handle("profile-list", () => {
  ensureProfilesDir();
  return fs.readdirSync(getProfilesDir()).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
});
ipcMain.handle("profile-save", (_, { name, data }) => {
  ensureProfilesDir();
  const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "default";
  fs.writeFileSync(path.join(getProfilesDir(), safe + ".json"), JSON.stringify(data, null, 2));
  return { success: true, name: safe };
});
ipcMain.handle("profile-load", (_, name) => {
  const file = path.join(getProfilesDir(), name + ".json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
});
ipcMain.handle("profile-delete", (_, name) => {
  const file = path.join(getProfilesDir(), name + ".json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { success: true };
});

// ── Browser Stats ─────────────────────────────────────────────────────────────
ipcMain.handle("get-browser-stats", async () => {
  if (!chromeImporter || !firefoxImporter)
    return { chrome: { available: false }, firefox: { available: false } };
  try {
    const [chrome, firefox] = await Promise.all([
      chromeImporter.getImportStats(),
      firefoxImporter.getImportStats(),
    ]);
    return { chrome, firefox };
  } catch (err) {
    console.error("get-browser-stats error:", err);
    return { chrome: { available: false }, firefox: { available: false } };
  }
});

// ── Browser Import (full) ─────────────────────────────────────────────────────
ipcMain.handle("browser-import", async () => {
  const result = { bookmarks: [], history: [], cookies: [], passwords: [], autofill: [], sources: [] };
  if (!chromeImporter || !firefoxImporter) return result;

  for (const [importer, label] of [[chromeImporter, "Chrome"], [firefoxImporter, "Firefox"]]) {
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
      if (bm.status   === "fulfilled") result.bookmarks.push(...bm.value.bookmarks);
      if (hist.status === "fulfilled") result.history.push(...hist.value);
      if (ck.status   === "fulfilled") result.cookies.push(...ck.value);
      if (pw.status   === "fulfilled") result.passwords.push(...pw.value);
      if (af.status   === "fulfilled") result.autofill.push(...af.value);
      result.sources.push(label);
    } catch (err) { console.error(`${label} import error:`, err); }
  }

  try {
    if (result.bookmarks.length) await dataManager.saveBookmarks({ version: dataManager.version, bookmarks: result.bookmarks, folders: [] });
    if (result.history.length)   { const h = await dataManager.getHistory(); h.history.push(...result.history); await dataManager.saveHistory(h); }
    if (result.cookies.length)   await dataManager.addCookies(result.cookies);
    if (result.passwords.length) await dataManager.addPasswords(result.passwords);
    if (result.autofill.length)  await dataManager.addAutofill(result.autofill);
    await dataManager.recordImport("all", ["bookmarks","history","cookies","passwords","autofill"],
      result.bookmarks.length + result.history.length + result.cookies.length + result.passwords.length + result.autofill.length);
  } catch (err) { console.error("Failed to save imported data:", err); }

  return result;
});

// ── Selective Import ──────────────────────────────────────────────────────────
ipcMain.handle("import-browser-data", async (_, { browser, dataTypes }) => {
  if (!chromeImporter || !firefoxImporter) return { success: false, error: "Importers not ready" };
  try {
    const importer = browser === "chrome" ? chromeImporter : firefoxImporter;
    const results = { bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0 };

    if (dataTypes.includes("bookmarks")) {
      const data = await importer.importBookmarks();
      await dataManager.saveBookmarks({ version: dataManager.version, bookmarks: data.bookmarks, folders: data.folders });
      results.bookmarks = data.bookmarks.length;
    }
    if (dataTypes.includes("history")) {
      const data = await importer.importHistory();
      const current = await dataManager.getHistory();
      current.history.push(...data);
      await dataManager.saveHistory(current);
      results.history = data.length;
    }
    if (dataTypes.includes("cookies")) {
      const data = await importer.importCookies();
      await dataManager.addCookies(data);
      results.cookies = data.length;
    }
    if (dataTypes.includes("passwords")) {
      const data = await importer.importPasswords();
      await dataManager.addPasswords(data);
      results.passwords = data.length;
    }
    if (dataTypes.includes("autofill")) {
      const data = await importer.importAutofill();
      await dataManager.addAutofill(data);
      results.autofill = data.length;
    }

    await dataManager.recordImport(browser, dataTypes,
      Object.values(results).reduce((a, b) => a + b, 0));

    return { success: true, results };
  } catch (err) {
    console.error("import-browser-data error:", err);
    return { success: false, error: err.message };
  }
});

// ── Data Access ───────────────────────────────────────────────────────────────
ipcMain.handle("get-bookmarks",  async () => { try { return await dataManager.getBookmarks();  } catch { return { version: "1.0.0", bookmarks: [], folders: [] }; } });
ipcMain.handle("get-history",    async () => { try { return await dataManager.getHistory();    } catch { return { version: "1.0.0", history: [] }; } });
ipcMain.handle("get-cookies",    async () => { try { return await dataManager.getCookies();    } catch { return { version: "1.0.0", cookies: [] }; } });
ipcMain.handle("get-passwords",  async () => { try { return await dataManager.getPasswords();  } catch { return { version: "1.0.0", passwords: [] }; } });
ipcMain.handle("get-autofill",   async () => { try { return await dataManager.getAutofill();   } catch { return { version: "1.0.0", autofill: [] }; } });

ipcMain.handle("add-bookmark",      async (_, bm)    => { try { return { success: true, bookmark: await dataManager.addBookmark(bm) };    } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle("add-history-entry", async (_, entry) => { try { await dataManager.addHistoryEntry(entry); return { success: true }; }       catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle("get-data-stats",    async ()         => { try { return await dataManager.getStats(); }                                       catch { return { bookmarks: 0, history: 0, cookies: 0, passwords: 0, autofill: 0, lastImport: null }; } });
ipcMain.handle("clear-all-data",    async ()         => { try { await dataManager.clearAllData(); return { success: true }; }                catch (e) { return { success: false, error: e.message }; } });
