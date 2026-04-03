const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

/** @returns {string | null} */
function getSetupExePath() {
  const bundled = path.join(process.resourcesPath, "nsis-setup.exe");
  if (fs.existsSync(bundled)) return bundled;
  if (!app.isPackaged) {
    const distDir = path.join(__dirname, "..", "..", "dist");
    try {
      const names = fs
        .readdirSync(distDir)
        .filter((n) => n.endsWith(".exe") && n.includes("Setup"));
      if (names.length) return path.join(distDir, names[0]);
    } catch {
      /* missing dist */
    }
  }
  return null;
}

function defaultInstallDir() {
  const base = process.env.LOCALAPPDATA || process.env.USERPROFILE || "";
  return path.join(base, "Programs", "Autonomous Browser");
}

/** @param {string} dir */
function normalizeInstallDir(dir) {
  const s = String(dir || "").trim();
  return path.normalize(s);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  let iconPath = path.join(__dirname, "..", "build-resources", "icon.png");
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, "..", "..", "build", "icon.png");
  }
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 560,
    height: 680,
    minWidth: 480,
    minHeight: 560,
    show: false,
    backgroundColor: "#0c0c12",
    autoHideMenuBar: true,
    icon: icon && !icon.isEmpty() ? icon : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5174");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "ui", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.handle("installer:get-default-dir", () => defaultInstallDir());

ipcMain.handle("installer:pick-dir", async () => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const r = await dialog.showOpenDialog(win ?? undefined, {
    title: "Select install folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

ipcMain.handle("installer:run-silent", async (_evt, targetDir) => {
  const setup = getSetupExePath();
  if (!setup) {
    return {
      ok: false,
      message:
        "Installer payload not found. Build the main app first (NSIS Setup.exe in dist/), then rebuild this bootstrapper.",
    };
  }

  const dir = normalizeInstallDir(targetDir);
  if (!dir) {
    return { ok: false, message: "Choose a valid install folder." };
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      message: `Cannot create folder: ${String(/** @type {Error} */ (e).message)}`,
    };
  }

  const args = ["/S", `/D=${dir}`];

  return await new Promise((resolve) => {
    const child = spawn(setup, args, {
      windowsHide: false,
      stdio: "ignore",
    });
    child.on("error", (err) => {
      resolve({ ok: false, message: String(err.message) });
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else {
        resolve({
          ok: false,
          message: `Installer exited with code ${code}. Try another folder or run the NSIS installer manually.`,
        });
      }
    });
  });
});

ipcMain.on("installer:close", () => {
  mainWindow?.close();
});
