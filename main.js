const path = require("path");
const fs = require("fs");
const os = require("os");

const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const Notification = electron.Notification;
const dialog = electron.dialog;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on(
    "maximize",
    () =>
      mainWindow &&
      mainWindow.webContents.send("window-state-changed", "maximized"),
  );
  mainWindow.on(
    "unmaximize",
    () =>
      mainWindow &&
      mainWindow.webContents.send("window-state-changed", "normal"),
  );
}

// Noise patterns from webview guest pages we don't want polluting the console
const CONSOLE_NOISE = [
  "privacy-pro-eligible",
  "country.json",
  "animated-download-icon",
  "Insecure Content-Security-Policy",
  "preloaded using link preload but not used",
  "credentials mode does not match",
];

app.whenReady().then(() => {
  createWindow();

  app.on("web-contents-created", (_, wc) => {
    wc.on("console-message", (e) => {
      if (CONSOLE_NOISE.some((p) => e.message && e.message.includes(p)))
        e.preventDefault();
    });
  });

  app.on("activate", () => {
    if (!mainWindow) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Window Controls ───────────────────────────────────────────────────────────
ipcMain.handle("window-minimize", () => mainWindow && mainWindow.minimize());
ipcMain.handle("window-maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle("window-close", () => mainWindow && mainWindow.close());
ipcMain.handle(
  "window-is-maximized",
  () => !!(mainWindow && mainWindow.isMaximized()),
);

// ── Shell ─────────────────────────────────────────────────────────────────────
ipcMain.handle("open-external", async (event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: "Invalid protocol" };
  } catch (e) {
    return { success: false, error: "Invalid URL" };
  }
});

// ── System Info ───────────────────────────────────────────────────────────────
ipcMain.handle("get-system-info", () => ({
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
  totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + " GB",
  cpus: os.cpus().length,
}));

// ── Notifications ─────────────────────────────────────────────────────────────
ipcMain.handle("show-notification", (event, data) => {
  const title = data && data.title ? data.title : "Butcher";
  const body = data && data.body ? data.body : "";
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return { success: true };
  }
  return { success: false };
});

// ── Screenshot ────────────────────────────────────────────────────────────────
ipcMain.handle("capture-webview", async (event, { webContentsId, rect }) => {
  try {
    const { webContents } = require("electron");
    const wc = webContents.fromId(webContentsId);
    if (!wc) return { success: false, error: "webContents not found" };
    const img = rect ? await wc.capturePage(rect) : await wc.capturePage();
    return { success: true, dataUrl: img.toDataURL() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("save-screenshot", async (event, dataUrl) => {
  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const downloads = app.getPath("downloads");
    const filename = "screenshot-" + Date.now() + ".png";
    const filepath = path.join(downloads, filename);
    fs.writeFileSync(filepath, Buffer.from(base64, "base64"));
    return { success: true, path: filepath, filename: filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Save Dialog ───────────────────────────────────────────────────────────────
ipcMain.handle("show-save-dialog", async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options || {});
});

// ── Zoom ──────────────────────────────────────────────────────────────────────
ipcMain.handle("set-zoom", (event, level) => {
  if (mainWindow) mainWindow.webContents.setZoomLevel(level);
  return { success: true };
});

// ── Pass-through stubs ────────────────────────────────────────────────────────
ipcMain.handle("navigate-url", async (e, url) => ({ success: true, url }));
ipcMain.handle("fill-form-field", async (e, data) => ({ success: true, data }));
ipcMain.handle("click-element", async (e, selector) => ({
  success: true,
  selector,
}));
ipcMain.handle("execute-script", async (e, script) => ({ success: true }));
ipcMain.handle("chat-message", async (e, message) => ({
  success: true,
  message,
}));

// ── Profiles ──────────────────────────────────────────────────────────────────
const PROFILES_DIR = path.join(app.getPath("userData"), "profiles");

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

ipcMain.handle("profile-list", () => {
  ensureProfilesDir();
  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));
});

ipcMain.handle("profile-save", (e, { name, data }) => {
  ensureProfilesDir();
  const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "default";
  fs.writeFileSync(path.join(PROFILES_DIR, safe + ".json"), JSON.stringify(data, null, 2));
  return { success: true, name: safe };
});

ipcMain.handle("profile-load", (e, name) => {
  const file = path.join(PROFILES_DIR, name + ".json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
});

ipcMain.handle("profile-delete", (e, name) => {
  const file = path.join(PROFILES_DIR, name + ".json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { success: true };
});

// ── Browser Import ────────────────────────────────────────────────────────────
function flattenChromeBookmarks(node, out = []) {
  if (!node) return out;
  if (node.type === "url") out.push({ title: node.name || node.url, url: node.url, addedAt: Date.now() });
  if (node.children) node.children.forEach(c => flattenChromeBookmarks(c, out));
  return out;
}

ipcMain.handle("browser-import", async () => {
  const result = { bookmarks: [], history: [], passwords: [], sources: [] };
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  const chromeBrowsers = [
    { name: "Chrome", bm: path.join(local, "Google", "Chrome", "User Data", "Default", "Bookmarks") },
    { name: "Edge",   bm: path.join(local, "Microsoft", "Edge", "User Data", "Default", "Bookmarks") },
    { name: "Brave",  bm: path.join(local, "BraveSoftware", "Brave-Browser", "User Data", "Default", "Bookmarks") },
  ];

  for (const { name, bm } of chromeBrowsers) {
    try {
      if (fs.existsSync(bm)) {
        const data = JSON.parse(fs.readFileSync(bm, "utf8"));
        Object.values(data.roots || {}).forEach(r => flattenChromeBookmarks(r, result.bookmarks));
        if (!result.sources.includes(name)) result.sources.push(name);
      }
    } catch {}
    // Note Chrome passwords (DPAPI encrypted — not readable without native module)
    try {
      const loginData = path.join(path.dirname(bm), "Login Data");
      if (fs.existsSync(loginData) && !result.passwords.find(p => p.username.includes(name))) {
        result.passwords.push({
          url: "",
          username: `[${name} passwords detected]`,
          password: "[encrypted by Windows DPAPI]",
          note: `${name} encrypts passwords with Windows DPAPI. Use the browser's built-in export to access them.`,
        });
      }
    } catch {}
  }

  // Firefox via better-sqlite3 (optional — graceful fallback if not installed)
  const ffProfiles = path.join(roaming, "Mozilla", "Firefox", "Profiles");
  try {
    if (fs.existsSync(ffProfiles)) {
      for (const d of fs.readdirSync(ffProfiles)) {
        const placesPath = path.join(ffProfiles, d, "places.sqlite");
        if (!fs.existsSync(placesPath)) continue;
        try {
          const Database = require("better-sqlite3");
          const tmpPath = path.join(app.getPath("temp"), "places_tmp_" + Date.now() + ".sqlite");
          fs.copyFileSync(placesPath, tmpPath);
          const db = new Database(tmpPath, { readonly: true });
          db.prepare(
            "SELECT b.title, p.url FROM moz_bookmarks b JOIN moz_places p ON b.fk=p.id WHERE b.type=1 AND p.url NOT LIKE 'place:%' LIMIT 500"
          ).all().forEach(r => result.bookmarks.push({ title: r.title || r.url, url: r.url, addedAt: Date.now() }));
          db.prepare(
            "SELECT title, url, last_visit_date FROM moz_places WHERE visit_count>0 AND url NOT LIKE 'place:%' ORDER BY last_visit_date DESC LIMIT 500"
          ).all().forEach(r => result.history.push({ title: r.title || r.url, url: r.url, visitedAt: r.last_visit_date ? Math.round(r.last_visit_date / 1000) : Date.now() }));
          db.close();
          try { fs.unlinkSync(tmpPath); } catch {}
          if (!result.sources.includes("Firefox")) result.sources.push("Firefox");
        } catch {}

        // Firefox passwords (logins.json — metadata readable, passwords NSS-encrypted)
        try {
          const loginsPath = path.join(ffProfiles, d, "logins.json");
          if (fs.existsSync(loginsPath)) {
            const data = JSON.parse(fs.readFileSync(loginsPath, "utf8"));
            (data.logins || []).forEach(l => {
              result.passwords.push({
                url: l.hostname || "",
                username: "[encrypted by Firefox]",
                password: "[encrypted by Firefox]",
                note: "Firefox encrypts passwords with NSS. Export from Firefox directly to view them.",
              });
            });
          }
        } catch {}
      }
    }
  } catch {}

  // Deduplicate bookmarks by URL
  const seen = new Set();
  result.bookmarks = result.bookmarks.filter(b => {
    if (!b.url || seen.has(b.url)) return false;
    seen.add(b.url); return true;
  });

  return result;
});
