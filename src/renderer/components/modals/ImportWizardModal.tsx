import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { BrowserImportStats } from "../../../shared/ipc-types";
import { getElectronApi } from "../../services/electron-api";

type ImportWizardModalProps = {
  open: boolean;
  onSkip: () => void;
};

export function ImportWizardModal({ open, onSkip }: ImportWizardModalProps): ReactElement | null {
  const [stats, setStats] = useState<{
    chrome: BrowserImportStats;
    firefox: BrowserImportStats;
  } | null>(null);
  const [selected, setSelected] = useState<"chrome" | "firefox" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const api = getElectronApi();
    if (!api) return;
    void api.getBrowserStats().then(setStats);
  }, [open]);

  const onImport = async () => {
    const api = getElectronApi();
    if (!api || !selected) return;
    setBusy(true);
    try {
      const result = await api.browserImport();
      const r = result as {
        sources?: string[];
        bookmarks?: unknown[];
        history?: unknown[];
        cookies?: unknown[];
      };
      if (r.sources && r.sources.length > 0) {
        window.legacyBrowser?.showToast?.(
          `Successfully imported ${r.bookmarks?.length ?? 0} bookmarks, ${r.history?.length ?? 0} history items, and ${r.cookies?.length ?? 0} cookies`,
        );
        localStorage.setItem("hasImported", "true");
        onSkip();
      } else {
        throw new Error("No data imported");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.legacyBrowser?.showToast?.(`Import failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open || !stats) return null;

  const raw = [
    { id: "chrome" as const, label: "Chrome", icon: "🌐", s: stats.chrome },
    { id: "firefox" as const, label: "Firefox", icon: "🦊", s: stats.firefox },
  ];
  const cards = raw.filter((c) => c.s.available);

  return createPortal(
    <div className="import-wizard" style={{ display: "flex" }}>
      <div className="import-wizard-content">
        <div className="import-wizard-header">
          <h2>Welcome to Autonomous Browser</h2>
          <p>Import your data from other browsers to get started</p>
        </div>
        <div className="import-browser-list">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`browser-import-card${selected === c.id ? " selected" : ""}`}
              data-browser={c.id}
              onClick={() => setSelected(c.id)}
            >
              <div className="browser-icon">{c.icon}</div>
              <div className="browser-info">
                <h3>{c.label}</h3>
                <p>Import bookmarks, history, and cookies</p>
              </div>
              <div className="browser-stats">
                <div className="stat">
                  <strong>{c.s.bookmarks ?? 0}</strong> bookmarks
                </div>
                <div className="stat">
                  <strong>{c.s.history ?? 0}</strong> history
                </div>
                <div className="stat">
                  <strong>{c.s.cookies ?? 0}</strong> cookies
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="import-actions">
          <button type="button" className="import-skip-btn" onClick={onSkip}>
            Skip for now
          </button>
          <button
            type="button"
            className="import-start-btn"
            disabled={!selected || busy}
            onClick={() => void onImport()}
          >
            {busy ? "Importing..." : "Import Selected"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
