import { useEffect, useState, type MouseEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { ImportStatsDetail, ListedBrowserProfile, SystemInfo } from "../../../shared/ipc-types";
import { getElectronApi } from "../../services/electron-api";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

type AppDataStats = {
  bookmarks: number;
  history: number;
  cookies: number;
  passwords: number;
  autofill: number;
  lastImport: { browser?: string; count?: number; timestamp?: number; dataTypes?: string[] } | null;
};

const chromeLogo = (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.35" />
    <path
      fill="currentColor"
      d="M24 10c6.5 0 12 4.2 14 10h-14a10 10 0 0 0-9.2 6L13 16c2.8-3.6 7.2-6 11-6zm-12.5 8.5 5.8 10A10 10 0 0 0 24 34c3.2 0 6-1.5 7.8-3.8l-6.5 11.2C17.8 39.5 14 32.2 14 24c0-2 .3-3.9.5-5.5zm25 3A10 10 0 0 1 24 38c-2.2 0-4.3-.7-6-2l14.5-25A15.9 15.9 0 0 1 38 24c0 2.6-.6 5-1.5 7.5z"
    />
  </svg>
);

const firefoxLogo = (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="currentColor"
      d="M24 8c-6 0-11 3.5-13.5 8.5 1-1 2.5-2 4-2.5-.5 1.5-.8 3-.8 4.8 0 6.2 4.5 11.2 10.3 12.2-.5-1.2-.8-2.5-.8-3.8 0-5 4-9 9-9 5 0 9 4 9 9 0 4.5-3.2 8.2-7.5 8.8C35 39 40 32.5 40 25c0-9-7-17-16-17z"
      opacity="0.9"
    />
  </svg>
);

function formatImportLine(s: ImportStatsDetail | null): string {
  if (!s?.available) return "No data found for this profile.";
  const b = s.bookmarks ?? 0;
  const h = s.history ?? 0;
  const c = s.cookies ?? 0;
  const p = s.passwords ?? 0;
  const a = s.autofill ?? 0;
  return `${b} bookmarks · ${h} history · ${c} cookies · ${p} passwords · ${a} autofill rows`;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps): ReactElement | null {
  const [homePage, setHomePage] = useState("");
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [browser, setBrowser] = useState<"" | "chrome" | "firefox">("");
  const [profilePath, setProfilePath] = useState("");
  const [chromeProfiles, setChromeProfiles] = useState<ListedBrowserProfile[]>([]);
  const [firefoxProfiles, setFirefoxProfiles] = useState<ListedBrowserProfile[]>([]);
  const [impBm, setImpBm] = useState(true);
  const [impHist, setImpHist] = useState(true);
  const [impCookies, setImpCookies] = useState(false);
  const [impPw, setImpPw] = useState(false);
  const [impAf, setImpAf] = useState(false);
  const [sourceStatsLine, setSourceStatsLine] = useState("");
  const [appStats, setAppStats] = useState<AppDataStats | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [progress, setProgress] = useState({ show: false, pct: 0, text: "" });
  const [activeTheme, setActiveTheme] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("theme")) || "dark",
  );

  useEffect(() => {
    if (!open) return;
    const hp = window.legacyBrowser?.getHomePage?.() ?? "";
    setHomePage(hp);
    setActiveTheme(localStorage.getItem("theme") || "dark");
    const api = getElectronApi();
    if (!api) return;
    void api.getSystemInfo().then(setSys);
    void api.listBrowserProfiles().then((lists) => {
      setChromeProfiles(lists.chrome);
      setFirefoxProfiles(lists.firefox);
    });
    void api.getDataStats().then((raw) => {
      const d = raw as AppDataStats;
      setAppStats(d);
    });
  }, [open]);

  useEffect(() => {
    if (!browser) return;
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    if (!list.length) return;
    const ok = list.some((p) => p.path === profilePath);
    if (!profilePath || !ok) setProfilePath(list[0].path);
  }, [browser, chromeProfiles, firefoxProfiles, profilePath]);

  useEffect(() => {
    if (!open || !browser) {
      setSourceStatsLine("");
      return;
    }
    const api = getElectronApi();
    if (!api) return;
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    const path = profilePath || list[0]?.path || "";
    if (!path) {
      setSourceStatsLine("No profile folders detected for this browser.");
      return;
    }
    let cancelled = false;
    void api.getImportStats({ browser, profilePath: path }).then((s) => {
      if (!cancelled) setSourceStatsLine(formatImportLine(s));
    });
    return () => {
      cancelled = true;
    };
  }, [open, browser, profilePath, chromeProfiles, firefoxProfiles]);

  if (!open) return null;

  const bridge = window.legacyBrowser;
  const api = getElectronApi();

  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const applyTheme = (name: string) => {
    bridge?.applyTheme?.(name);
    setActiveTheme(name);
  };

  const selectBrowser = (b: "chrome" | "firefox") => {
    setBrowser(b);
    const list = b === "chrome" ? chromeProfiles : firefoxProfiles;
    setProfilePath(list[0]?.path ?? "");
  };

  const startImport = async () => {
    if (!api) return;
    if (!browser) {
      bridge?.showToast?.("Select a browser source");
      return;
    }
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    const path = profilePath || list[0]?.path;
    if (!path) {
      bridge?.showToast?.("No profile path available — install the browser or pick another source");
      return;
    }
    const dataTypes: Array<"bookmarks" | "history" | "cookies" | "passwords" | "autofill"> = [];
    if (impBm) dataTypes.push("bookmarks");
    if (impHist) dataTypes.push("history");
    if (impCookies) dataTypes.push("cookies");
    if (impPw) dataTypes.push("passwords");
    if (impAf) dataTypes.push("autofill");
    if (dataTypes.length === 0) {
      bridge?.showToast?.("Select at least one data type");
      return;
    }
    setImportBusy(true);
    setProgress({ show: true, pct: 0, text: "Starting import..." });
    try {
      const result = (await api.importBrowserData({ browser, dataTypes, profilePath: path })) as {
        success: boolean;
        error?: string;
        results?: Record<string, number>;
      };
      setProgress({ show: false, pct: 0, text: "" });
      if (result.success && result.results) {
        const r = result.results;
        const n =
          (r.bookmarks ?? 0) +
          (r.history ?? 0) +
          (r.cookies ?? 0) +
          (r.passwords ?? 0) +
          (r.autofill ?? 0);
        bridge?.showToast?.(`Imported ${n} items (${Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ")})`);
        void api.getDataStats().then((raw) => setAppStats(raw as AppDataStats));
        const s = await api.getImportStats({ browser, profilePath: path });
        setSourceStatsLine(formatImportLine(s));
      } else {
        throw new Error(result.error || "Import failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bridge?.showToast?.(`Import failed: ${msg}`);
      setProgress({ show: false, pct: 0, text: "" });
    } finally {
      setImportBusy(false);
    }
  };

  const profileList = browser === "chrome" ? chromeProfiles : firefoxProfiles;

  return createPortal(
    <>
      <div
        className="settings-overlay"
        style={{ display: "block" }}
        onClick={onOverlayClick}
        role="presentation"
      />
      <div className="settings-panel" style={{ display: "flex" }} onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M2 2L12 12M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">Theme</label>
            <div className="theme-grid">
              {(["dark", "aurora", "ocean", "ember"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`theme-card${activeTheme === t ? " active" : ""}`}
                  data-theme={t}
                  onClick={() => applyTheme(t)}
                >
                  <div className={`theme-preview ${t}-preview`} />
                  <span>{t === "dark" ? "Void" : t[0].toUpperCase() + t.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Import from your device</label>
            <p className="settings-hint">
              Pick the browser engine, then the exact profile folder (Chrome can have many). Passwords are
              imported as metadata where the OS still encrypts secrets.
            </p>
            {appStats ? (
              <div className="settings-import-app-summary">
                <span className="settings-import-app-title">Already in this app</span>
                <span className="settings-import-app-counts">
                  {appStats.bookmarks} bookmarks · {appStats.history} history · {appStats.cookies} cookies ·{" "}
                  {appStats.passwords} passwords · {appStats.autofill} autofill
                </span>
                {appStats.lastImport ? (
                  <span className="settings-import-last">
                    Last import: {appStats.lastImport.browser ?? "?"} ·{" "}
                    {appStats.lastImport.timestamp
                      ? new Date(appStats.lastImport.timestamp).toLocaleString()
                      : ""}{" "}
                    ({(appStats.lastImport.dataTypes ?? []).join(", ")})
                  </span>
                ) : (
                  <span className="settings-import-last muted">No import recorded yet</span>
                )}
              </div>
            ) : null}
            <div className="settings-browser-pick">
              <button
                type="button"
                className={`settings-browser-card${browser === "chrome" ? " active" : ""}`}
                onClick={() => selectBrowser("chrome")}
              >
                <span className="settings-browser-icon">{chromeLogo}</span>
                <span className="settings-browser-name">Google Chrome</span>
                <span className="settings-browser-sub">Chromium profiles on this PC</span>
              </button>
              <button
                type="button"
                className={`settings-browser-card${browser === "firefox" ? " active" : ""}`}
                onClick={() => selectBrowser("firefox")}
              >
                <span className="settings-browser-icon">{firefoxLogo}</span>
                <span className="settings-browser-name">Mozilla Firefox</span>
                <span className="settings-browser-sub">Firefox profile folders</span>
              </button>
            </div>
            {browser ? (
              <>
                <label className="settings-label settings-label-mt" htmlFor="profileSelectReact">
                  Profile folder
                </label>
                <select
                  id="profileSelectReact"
                  className="settings-select"
                  value={profilePath || profileList[0]?.path || ""}
                  onChange={(e) => setProfilePath(e.target.value)}
                >
                  {profileList.length === 0 ? (
                    <option value="">No profiles found</option>
                  ) : (
                    profileList.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.label}
                      </option>
                    ))
                  )}
                </select>
                <div className="import-options settings-import-options-grid">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={impBm} onChange={(e) => setImpBm(e.target.checked)} />
                    <span>Bookmarks</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={impHist} onChange={(e) => setImpHist(e.target.checked)} />
                    <span>History</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={impCookies} onChange={(e) => setImpCookies(e.target.checked)} />
                    <span>Cookies</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={impPw} onChange={(e) => setImpPw(e.target.checked)} />
                    <span>Passwords</span>
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={impAf} onChange={(e) => setImpAf(e.target.checked)} />
                    <span>Autofill</span>
                  </label>
                </div>
                <div className="settings-source-stats">{sourceStatsLine}</div>
                <div className="import-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!browser || importBusy || profileList.length === 0}
                    onClick={() => void startImport()}
                  >
                    Import selected data
                  </button>
                </div>
              </>
            ) : null}
            <div className="import-progress" style={{ display: progress.show ? "block" : "none" }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
              </div>
              <div className="progress-text">{progress.text}</div>
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label" htmlFor="homePageInputReact">
              Home Page
            </label>
            <input
              id="homePageInputReact"
              type="text"
              className="settings-input"
              placeholder="https://duckduckgo.com"
              value={homePage}
              onChange={(e) => setHomePage(e.target.value)}
              onBlur={() => bridge?.setHomePage?.(homePage.trim())}
            />
          </div>
          <div className="settings-section">
            <label className="settings-label">System Info</label>
            <div className="sysinfo-grid">
              <div className="sysinfo-item">
                <span className="si-label">Electron</span>
                <span className="si-val">{sys?.version ?? "—"}</span>
              </div>
              <div className="sysinfo-item">
                <span className="si-label">Chrome</span>
                <span className="si-val">{sys?.chrome ?? "—"}</span>
              </div>
              <div className="sysinfo-item">
                <span className="si-label">Node</span>
                <span className="si-val">{sys?.node ?? "—"}</span>
              </div>
              <div className="sysinfo-item">
                <span className="si-label">Memory</span>
                <span className="si-val">{sys?.memory ?? "—"}</span>
              </div>
              <div className="sysinfo-item">
                <span className="si-label">Platform</span>
                <span className="si-val">{sys?.platform ?? "—"}</span>
              </div>
              <div className="sysinfo-item">
                <span className="si-label">CPUs</span>
                <span className="si-val">{sys?.cpus ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Keyboard Shortcuts</label>
            <div className="shortcuts-list">
              <div className="shortcut-row">
                <kbd>Ctrl+T</kbd>
                <span>New Tab</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+W</kbd>
                <span>Close Tab</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+L</kbd>
                <span>Focus Address Bar</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+F</kbd>
                <span>Find in Page</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+R / F5</kbd>
                <span>Reload</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+Shift+S</kbd>
                <span>Screenshot</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+= / Ctrl+-</kbd>
                <span>Zoom In/Out</span>
              </div>
              <div className="shortcut-row">
                <kbd>Ctrl+0</kbd>
                <span>Reset Zoom</span>
              </div>
              <div className="shortcut-row">
                <kbd>F12</kbd>
                <span>DevTools</span>
              </div>
              <div className="shortcut-row">
                <kbd>Alt+Left / Alt+Right</kbd>
                <span>Back / Forward</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
