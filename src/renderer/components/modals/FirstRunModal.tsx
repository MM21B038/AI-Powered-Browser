import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { getElectronApi } from "../../services/electron-api";

type FirstRunModalProps = {
  open: boolean;
  onDismiss: () => void;
};

export function FirstRunModal({ open, onDismiss }: FirstRunModalProps): ReactElement | null {
  const [chromeText, setChromeText] = useState("Checking...");
  const [firefoxText, setFirefoxText] = useState("Checking...");
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const api = getElectronApi();
    if (!api) return;
    void api.getBrowserStats().then((stats) => {
      setChromeText(
        stats.chrome.available
          ? `${stats.chrome.bookmarks ?? 0} bookmarks, ${stats.chrome.history ?? 0} history items`
          : "Chrome not found or no data available",
      );
      setFirefoxText(
        stats.firefox.available
          ? `${stats.firefox.bookmarks ?? 0} bookmarks, ${stats.firefox.history ?? 0} history items`
          : "Firefox not found or no data available",
      );
    });
  }, [open]);

  const quickImport = async (browser: "chrome" | "firefox") => {
    const api = getElectronApi();
    if (!api) return;
    setImporting(browser);
    try {
      const result = (await api.importBrowserData({
        browser,
        dataTypes: ["bookmarks", "history", "cookies"],
      })) as {
        success: boolean;
        error?: string;
        results?: { bookmarks: number; history: number; cookies: number };
      };
      if (result.success && result.results) {
        const r = result.results;
        window.legacyBrowser?.showToast?.(
          `Successfully imported ${(r.bookmarks ?? 0) + (r.history ?? 0) + (r.cookies ?? 0)} items from ${browser}`,
        );
        onDismiss();
      } else {
        throw new Error(result.error || "Import failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.legacyBrowser?.showToast?.(`Import failed: ${msg}`);
    } finally {
      setImporting(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" style={{ display: "flex" }}>
      <div className="modal-box first-run-modal">
        <div className="modal-header">
          <h2>Welcome to Autonomous Browser</h2>
          <p className="modal-subtitle">Let&apos;s get you set up with your existing browser data</p>
        </div>
        <div className="modal-body">
          <div className="welcome-section">
            <div className="welcome-icon">🚀</div>
            <h3>Import Your Data</h3>
            <p>
              Bring your bookmarks, history, and preferences from Chrome or Firefox to get started
              quickly.
            </p>
          </div>
          <div className="import-preview">
            <div className="browser-option" data-browser="chrome">
              <div className="browser-icon">🌐</div>
              <div className="browser-info">
                <h4>Google Chrome</h4>
                <p>{chromeText}</p>
              </div>
              <button
                type="button"
                className="btn-secondary import-option-btn"
                disabled={!!importing}
                onClick={() => void quickImport("chrome")}
              >
                {importing === "chrome" ? "Importing..." : "Import from Chrome"}
              </button>
            </div>
            <div className="browser-option" data-browser="firefox">
              <div className="browser-icon">🦊</div>
              <div className="browser-info">
                <h4>Mozilla Firefox</h4>
                <p>{firefoxText}</p>
              </div>
              <button
                type="button"
                className="btn-secondary import-option-btn"
                disabled={!!importing}
                onClick={() => void quickImport("firefox")}
              >
                {importing === "firefox" ? "Importing..." : "Import from Firefox"}
              </button>
            </div>
          </div>
          <div className="skip-section">
            <button type="button" className="btn-link" onClick={onDismiss}>
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
