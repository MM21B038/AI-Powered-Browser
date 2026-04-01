import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

const POLL_MS = 350;

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m active`;
  if (m > 0) return `${m}m ${s}s active`;
  return `${s}s active`;
}

export function SessionsPanelBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [sessions, setSessions] = useState<
    Array<{ id: string; headless: boolean; isActive: boolean; activeForMs: number }>
  >([]);
  const [sessionPanel, setSessionPanel] = useState<"create" | "manage">("create");

  useEffect(() => {
    setHost(document.getElementById("sessionsPanelRoot"));
  }, []);

  useEffect(() => {
    if (!bridge?.getSessions) return;
    const tick = () => {
      const ssRaw = bridge.getSessions?.();
      const ss = Array.isArray(ssRaw) ? ssRaw : [];
      setSessions(
        ss
          .filter((s) => s && typeof s.id === "string")
          .map((s) => ({
            id: s.id,
            headless: !!s.headless,
            isActive: !!s.isActive,
            activeForMs: Number(s.activeForMs || 0),
          })),
      );
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [bridge]);

  if (!bridge || !host) return null;

  const body = (
    <div className="sessions-panel-inner">
      <div className="session-picker-tabs">
        <button
          type="button"
          className={"session-picker-tab" + (sessionPanel === "create" ? " active" : "")}
          onClick={() => setSessionPanel("create")}
        >
          Create new session
        </button>
        <button
          type="button"
          className={"session-picker-tab" + (sessionPanel === "manage" ? " active" : "")}
          onClick={() => setSessionPanel("manage")}
        >
          Manage sessions
        </button>
      </div>
      <div className="session-picker-list">
        {sessionPanel === "create" ? (
          <>
            <button
              type="button"
              className="session-picker-create"
              onClick={() => {
                void window.electronAPI?.debugLog?.({
                  source: "sessions-panel",
                  message: "create_visible_session_click",
                });
                const s = bridge.createSession?.(false);
                if (s?.id) {
                  void window.electronAPI?.debugLog?.({
                    source: "sessions-panel",
                    message: "create_visible_session_created",
                    data: s,
                  });
                  bridge.switchSessionById?.(s.id);
                }
                setSessionPanel("manage");
              }}
            >
              Create visible session
            </button>
            <button
              type="button"
              className="session-picker-create"
              onClick={() => {
                const s = bridge.createSession?.(true);
                void window.electronAPI?.debugLog?.({
                  source: "sessions-panel",
                  message: "create_headless_session_created",
                  data: s,
                });
                setSessionPanel("manage");
              }}
            >
              Create headless session
            </button>
          </>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className={"session-picker-item" + (s.isActive ? " active" : "")}>
              <div className="session-picker-meta">
                <span className="session-picker-id">{s.id}</span>
                <span className="session-picker-badge">{s.headless ? "headless" : "visible"}</span>
                <span className="session-picker-age">{formatMs(s.activeForMs)}</span>
              </div>
              <div className="session-picker-actions">
                {!s.headless ? (
                  <button
                    type="button"
                    className="session-picker-open"
                    onClick={() => {
                      void window.electronAPI?.debugLog?.({
                        source: "sessions-panel",
                        message: "open_session_click",
                        data: { sessionId: s.id },
                      });
                      bridge.switchSessionById?.(s.id);
                    }}
                  >
                    Open session
                  </button>
                ) : null}
                <button
                  type="button"
                  className="session-picker-delete"
                  onClick={() => {
                    void window.electronAPI?.debugLog?.({
                      source: "sessions-panel",
                      message: "delete_session_click",
                      data: { sessionId: s.id, isActive: s.isActive, headless: s.headless },
                    });
                    bridge.killSessionById?.(s.id);
                  }}
                  disabled={s.isActive}
                  aria-label={
                    s.isActive ? "Active default or current session cannot be deleted now." : "Delete session"
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return createPortal(body, host);
}
