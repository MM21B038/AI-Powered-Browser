import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";

type BgSession = { win: BrowserWindow; sessionId: string };

export function registerBackgroundSessionIpc(ipcMain: IpcMain, trace?: (message: string, extra?: unknown) => void): void {
  const backgroundSessions = new Map<string, BgSession>();

  function getPartitionForSession(sessionId: string): string {
    return `persist:orion_${sessionId}`;
  }

  async function waitForDomReady(wc: Electron.WebContents, timeoutMs = 12000): Promise<void> {
    if (wc.isDestroyed()) throw new Error("webContents destroyed");
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
    trace?.("bg ensure session", { sessionId, partition });

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

  async function withBackgroundWebContents<T>(
    sessionId: string,
    fn: (wc: Electron.WebContents, win: BrowserWindow) => Promise<T>,
  ): Promise<T> {
    const s = ensureBackgroundSession(sessionId);
    const wc = s.win.webContents;
    if (wc.isDestroyed()) throw new Error("webContents destroyed");
    return await fn(wc, s.win);
  }

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
}
