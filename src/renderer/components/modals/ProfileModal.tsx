import { useCallback, useEffect, useState, type MouseEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { getElectronApi } from "../../services/electron-api";

type ProfileModalProps = {
  open: boolean;
  onComplete: () => void;
};

export function ProfileModal({ open, onComplete }: ProfileModalProps): ReactElement | null {
  const [names, setNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    const api = getElectronApi();
    if (!api) return;
    const list = await api.profileList();
    setNames(list.filter((n) => n.toLowerCase() !== "default"));
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const bridge = window.legacyBrowser;

  const onCreate = async () => {
    const n = newName.trim();
    if (!n) return;
    await bridge?.createProfileFromName?.(n);
    onComplete();
  };

  const onLoad = async (name: string) => {
    await bridge?.loadProfileByName?.(name);
    onComplete();
  };

  const onDelete = async (name: string, e: MouseEvent) => {
    e.stopPropagation();
    const api = getElectronApi();
    if (!api) return;
    await api.profileDelete(name);
    await refresh();
  };

  return createPortal(
    <div className="modal-overlay" style={{ display: "flex" }}>
      <div className="modal-box" id="profileModalReact">
        <div className="modal-header">
          <div className="modal-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="var(--accent)" strokeWidth="1.5" />
              <path
                d="M12 2C12 2 8 7 8 12C8 17 12 22 12 22"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <path
                d="M12 2C12 2 16 7 16 12C16 17 12 22 12 22"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
              <path d="M2 12H22" stroke="var(--accent)" strokeWidth="1.5" />
            </svg>
          </div>
          <h2 className="modal-title">Butcher Browser</h2>
          <p className="modal-subtitle">Create a named profile or load one you saved. The built-in &quot;default&quot; slot is not listed.</p>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <label className="modal-label" htmlFor="newProfileNameReact">
              New Profile
            </label>
            <div className="modal-input-row">
              <input
                id="newProfileNameReact"
                type="text"
                className="modal-input"
                placeholder="Profile name..."
                maxLength={40}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCreate();
                }}
              />
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                disabled={!newName.trim()}
                onClick={() => void onCreate()}
              >
                Create &amp; Start
              </button>
            </div>
          </div>
          <div className="modal-divider">
            <span>or load existing</span>
          </div>
          <div className="modal-section">
            <label className="modal-label">Saved Profiles</label>
            <div className="modal-profiles-list">
              {names.length === 0 ? (
                <div className="modal-empty">No profiles yet</div>
              ) : (
                names.map((name) => (
                  <div key={name} className="modal-profile-row">
                    <div className="modal-profile-icon">👤</div>
                    <span className="modal-profile-name">{name}</span>
                    <button
                      type="button"
                      className="modal-btn modal-btn-sm modal-btn-primary"
                      onClick={() => void onLoad(name)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="modal-btn modal-btn-sm modal-btn-danger"
                      onClick={(e) => void onDelete(name, e)}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
