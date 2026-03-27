import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type DragGhost = {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  favicon: string | null;
  loading: boolean;
};

const POLL_MS = 250;
const DRAG_THRESHOLD_PX = 6;
const HOST_RETRY_MS = 32;

function findDropTarget(
  clientX: number,
  draggingId: number,
): { tabId: number; side: "left" | "right" } | null {
  const host = document.getElementById("reactTabStripHost");
  if (!host) return null;
  for (const el of host.querySelectorAll(".tab")) {
    const tid = Number(el.getAttribute("data-tab-id"));
    if (!Number.isFinite(tid) || tid === draggingId) continue;
    const rect = el.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) {
      const mid = rect.left + rect.width / 2;
      return { tabId: tid, side: clientX < mid ? "left" : "right" };
    }
  }
  return null;
}

const closeSvg = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
    <path
      d="M2 2L8 8M8 2L2 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const plusSvg = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const defaultFaviconSvg = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
  </svg>
);

export function TabsBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<LegacyTabSnapshot[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ tabId: number; side: "left" | "right" } | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const [surface, setSurface] = useState("webview");
  const [sessions, setSessions] = useState<Array<{ id: string; headless: boolean; isActive: boolean; activeForMs: number }>>([]);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [sessionPanel, setSessionPanel] = useState<"create" | "manage">("create");

  const dragRef = useRef<{
    tabId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const ghostOffsetRef = useRef({ ox: 0, oy: 0, w: 0, h: 0 });

  useEffect(() => {
    const id = window.setInterval(() => {
      let el = document.getElementById("reactTabStripHost");
      if (!el) {
        // Self-heal: create tab portal host if kernel host wiring didn't run yet.
        const tabBar = document.getElementById("tabBar");
        const legacyArea = document.getElementById("tabScrollArea");
        if (tabBar) {
          if (legacyArea) {
            legacyArea.style.cssText =
              "display:none;width:0;height:0;overflow:hidden;padding:0;margin:0;border:0;min-height:0;flex:0;min-width:0;";
          }
          const created = document.createElement("div");
          created.id = "reactTabStripHost";
          created.className = "tab-scroll-area";
          tabBar.appendChild(created);
          el = created;
        }
      }
      if (el) {
        setHost(el);
        window.clearInterval(id);
      }
    }, HOST_RETRY_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    const sync = () => {
      const state = bridge.getState?.() ?? { activeTabId: null, activeSessionId: "" };
      const tabRows = Array.isArray(bridge.getTabs?.()) ? bridge.getTabs() : [];
      setTabs(tabRows);
      setActiveTabId(typeof state.activeTabId === "number" ? state.activeTabId : null);
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
      const s = document.getElementById("browserSection")?.getAttribute("data-surface") ?? "webview";
      setSurface(s);
    };
    sync();
    const id = window.setInterval(sync, POLL_MS);
    return () => window.clearInterval(id);
  }, [bridge]);

  const ensureWebviewSurface = () => {
    if (!bridge) return;
    if (surface !== "webview") bridge.clickUi?.("railWebviewBtn");
  };

  const onTabMouseDown = (tabId: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tab-close")) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    ghostOffsetRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height };
    dragRef.current = { tabId, startX: e.clientX, startY: e.clientY, dragging: false };

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dist = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
      if (!d.dragging && dist > DRAG_THRESHOLD_PX) {
        d.dragging = true;
        setDraggingId(d.tabId);
        const tab = bridge?.getTabs().find((t) => t.id === d.tabId);
        const { ox, oy, w, h } = ghostOffsetRef.current;
        setDragGhost({
          x: ev.clientX - ox,
          y: ev.clientY - oy,
          w,
          h,
          title: tab?.title ?? "Tab",
          favicon: tab?.favicon ?? null,
          loading: !!tab?.loading,
        });
      }
      if (d.dragging) {
        const { ox, oy } = ghostOffsetRef.current;
        setDragGhost((g) =>
          g
            ? { ...g, x: ev.clientX - ox, y: ev.clientY - oy }
            : g,
        );
        setDropHint(findDropTarget(ev.clientX, d.tabId));
      }
    };

    const onUp = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!bridge) return;
      if (d.dragging) {
        const hint = findDropTarget(ev.clientX, d.tabId);
        if (hint) bridge.reorderTabs(d.tabId, hint.tabId, hint.side);
      } else {
        ensureWebviewSurface();
        bridge.switchTabById(d.tabId);
      }
      dragRef.current = null;
      setDraggingId(null);
      setDropHint(null);
      setDragGhost(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!bridge || !host) return null;
  const surfaceTabNeeded = surface !== "webview";
  const surfaceTabTitle = "Workspace";
  const surfaceTab = surfaceTabNeeded ? (
    <div role="tab" aria-selected tabIndex={0} className="tab tab-surface active" data-tab-id="surface">
      <div className="tab-favicon">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </div>
      <span className="tab-title">{surfaceTabTitle}</span>
    </div>
  ) : null;

  const strip = (
    <>
      <button
        type="button"
        className="session-picker-btn"
        title="Select session"
        onClick={() => {
          setSessionPanel("create");
          setSessionMenuOpen((v) => !v);
        }}
      >
        Sessions
      </button>
      {surfaceTab}
      {tabs.map((tab) => {
        const isActive = surface === "webview" && tab.id === activeTabId;
        const isDragging = draggingId === tab.id;
        let extra = "";
        if (dropHint && dropHint.tabId === tab.id) {
          extra = dropHint.side === "left" ? " tab-drop-before" : " tab-drop-after";
        }
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            data-tab-id={tab.id}
            className={
              "tab flex shrink-0 items-center gap-1.5" +
              (isActive ? " active" : "") +
              (isDragging ? " tab-dragging" : "") +
              extra
            }
            onMouseDown={(e) => onTabMouseDown(tab.id, e)}
          >
            <div className="tab-favicon">
              {tab.loading ? (
                <div className="tab-spinner" />
              ) : tab.favicon ? (
                <img src={tab.favicon} width={14} height={14} alt="" />
              ) : (
                defaultFaviconSvg
              )}
            </div>
            <span className="tab-title">{tab.title}</span>
            <button
              type="button"
              className="tab-close"
              title="Close tab"
              aria-label={`Close ${tab.title}`}
              onClick={(ev) => {
                ev.stopPropagation();
                bridge.closeTabById(tab.id);
              }}
            >
              {closeSvg}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="add-tab-btn flex shrink-0 items-center justify-center"
        title="New Tab (Ctrl+T)"
        onClick={() => {
          ensureWebviewSurface();
          bridge.newTab();
        }}
      >
        {plusSvg}
      </button>
    </>
  );

  const ghostEl =
    dragGhost &&
    createPortal(
      <div
        className="tab-strip-drag-ghost"
        style={{
          position: "fixed",
          left: dragGhost.x,
          top: dragGhost.y,
          width: dragGhost.w,
          minHeight: dragGhost.h,
          zIndex: 100000,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <div className="tab-strip-drag-ghost-inner">
          <div className="tab-favicon">
            {dragGhost.loading ? (
              <div className="tab-spinner" />
            ) : dragGhost.favicon ? (
              <img src={dragGhost.favicon} width={14} height={14} alt="" />
            ) : (
              defaultFaviconSvg
            )}
          </div>
          <span className="tab-title">{dragGhost.title}</span>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      {createPortal(strip, host)}
      {ghostEl}
      {sessionMenuOpen
        ? createPortal(
            <div className="session-picker-modal" role="dialog" aria-label="Sessions">
              <div className="session-picker-head">
                <strong>Sessions</strong>
                <button type="button" className="session-picker-close" onClick={() => setSessionMenuOpen(false)}>
                  Close
                </button>
              </div>
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
                  Manage session
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
                          source: "tabs-bridge",
                          message: "create_visible_session_click",
                        });
                        const s = bridge.createSession?.(false);
                        if (s?.id) {
                          void window.electronAPI?.debugLog?.({
                            source: "tabs-bridge",
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
                          source: "tabs-bridge",
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
                                source: "tabs-bridge",
                                message: "open_session_click",
                                data: { sessionId: s.id },
                              });
                              bridge.switchSessionById?.(s.id);
                              setSessionMenuOpen(false);
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
                              source: "tabs-bridge",
                              message: "delete_session_click",
                              data: { sessionId: s.id, isActive: s.isActive, headless: s.headless },
                            });
                            bridge.killSessionById?.(s.id);
                          }}
                          disabled={s.isActive}
                          title={s.isActive ? "Active default/current session cannot be deleted now." : "Delete session"}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m active`;
  if (m > 0) return `${m}m ${s}s active`;
  return `${s}s active`;
}
