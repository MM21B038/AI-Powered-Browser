import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useUiStore } from "../state/ui-store";

const POLL_MS = 200;
const HOST_WAIT_MS = 1200;
const HOST_RETRY_MS = 32;

export function NavChromeBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const workbenchOpen = useUiStore((s) => s.requestWorkbenchOpen);
  const toggleRequestWorkbench = useUiStore((s) => s.toggleRequestWorkbench);
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  const [findHost, setFindHost] = useState<HTMLElement | null>(null);
  const [nav, setNav] = useState<LegacyNavState | null>(null);
  const [address, setAddress] = useState("");
  const [findQuery, setFindQuery] = useState("");

  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const navEl = document.getElementById("reactNavHost");
      const findEl = document.getElementById("reactFindHost");
      if (navEl) setNavHost(navEl);
      if (findEl) setFindHost(findEl);
      if (navEl && findEl) {
        window.clearInterval(id);
        return;
      }
      if (Date.now() - t0 >= HOST_WAIT_MS) window.clearInterval(id);
    }, HOST_RETRY_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!bridge?.getNavState) return;
    const sync = () => {
      const n = bridge.getNavState();
      setNav(n);
      setAddress((cur) =>
        document.activeElement?.id === "react-nav-address-input" ? cur : n.address,
      );
      setFindQuery((cur) =>
        document.activeElement?.id === "react-nav-find-input" ? cur : n.findQuery,
      );
    };
    sync();
    const t = window.setInterval(sync, POLL_MS);
    return () => window.clearInterval(t);
  }, [bridge]);

  useEffect(() => {
    const onFocusAddr = () => {
      const el = document.getElementById("react-nav-address-input");
      el?.focus();
      (el as HTMLInputElement | null)?.select();
    };
    const onToggleFind = () => bridge?.toggleFind?.();
    const onFocusFind = () => {
      const el = document.getElementById("react-nav-find-input");
      el?.focus();
      (el as HTMLInputElement | null)?.select();
    };
    const onCloseFind = () => setFindQuery("");
    window.addEventListener("react-nav-focus-address", onFocusAddr);
    window.addEventListener("react-nav-toggle-find", onToggleFind);
    window.addEventListener("react-nav-focus-find", onFocusFind);
    window.addEventListener("react-nav-close-find", onCloseFind);
    return () => {
      window.removeEventListener("react-nav-focus-address", onFocusAddr);
      window.removeEventListener("react-nav-toggle-find", onToggleFind);
      window.removeEventListener("react-nav-focus-find", onFocusFind);
      window.removeEventListener("react-nav-close-find", onCloseFind);
    };
  }, [bridge]);

  if (!bridge || !navHost || !nav) return null;

  const navRow = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <div className="nav-controls flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="nav-btn"
          title="Back (Alt+Left)"
          disabled={!nav.canGoBack}
          onClick={() => bridge.back()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M10 3L5 8L10 13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="nav-btn"
          title="Forward (Alt+Right)"
          disabled={!nav.canGoForward}
          onClick={() => bridge.forward()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M6 3L11 8L6 13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="nav-btn"
          title={nav.isLoading ? "Stop" : "Reload (F5)"}
          onClick={() => bridge.reloadOrStop?.()}
        >
          {nav.isLoading ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M13.657 6A6 6 0 1 0 12 11.196"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M14 2.5V6.5H10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="address-bar-wrapper min-w-0 flex-1" id="reactAddressBarWrapper">
        <div className={nav.securityIconClass} id="reactSecurityIcon">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M6 1L1.5 3V6.5C1.5 9 3.5 11 6 11.5C8.5 11 10.5 9 10.5 6.5V3L6 1Z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </div>
        <input
          id="react-nav-address-input"
          type="text"
          className="address-bar"
          placeholder="Search or enter address..."
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              bridge.navigate(address);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
        <div className="address-bar-actions">
          {address ? (
            <button
              type="button"
              className="addr-action-btn"
              title="Clear"
              style={{ display: "flex" }}
              onClick={() => {
                setAddress("");
                document.getElementById("react-nav-address-input")?.focus();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="nav-actions flex shrink-0 flex-wrap items-center gap-1">
        <button
          type="button"
          className={"nav-btn" + (nav.isBookmarked ? " nav-btn-bookmarked" : "")}
          title="Bookmark"
          onClick={() => bridge.clickUi?.("bookmarkStarBtn")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 1L10 6H15L11 9.5L12.5 15L8 12L3.5 15L5 9.5L1 6H6L8 1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className="nav-btn" title="Home" onClick={() => bridge.goHome?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 7L8 2L14 7V14H10V10H6V14H2V7Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          id="reactScreenshotNavBtn"
          className="nav-btn"
          title="Screenshot"
          onClick={() => bridge.openScreenshotMenu?.()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 3L6 1H10L11 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="nav-btn" title="Find in Page" onClick={() => bridge.toggleFind?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={"nav-btn" + (workbenchOpen ? " nav-btn-workbench-active" : "")}
          title="Request workbench — HTTP templates and replay"
          aria-expanded={workbenchOpen}
          aria-pressed={workbenchOpen}
          onClick={() => toggleRequestWorkbench()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 6.5h10M3 9.5h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 7l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="nav-btn" title="Zoom Out" onClick={() => bridge.zoomOut?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 6.5H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="zoom-level">{nav.zoomPercent}%</span>
        <button type="button" className="nav-btn" title="Zoom In" onClick={() => bridge.zoomIn?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6.5 4.5V8.5M4.5 6.5H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="nav-btn ai-chat-toggle" title="AI Assistant" onClick={() => bridge.clickUi?.("aiChatToggleBtn")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3 3v-3H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="5.5" cy="6.5" r="0.9" fill="currentColor" />
            <circle cx="8" cy="6.5" r="0.9" fill="currentColor" />
            <circle cx="10.5" cy="6.5" r="0.9" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="nav-btn" title="DevTools" onClick={() => bridge.openDevTools?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M5 5L2 8L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 5L14 8L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 3L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );

  const findBar =
    findHost && nav.findActive ? (
      <div className="find-bar flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.5 }} aria-hidden>
          <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 9L13 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="react-nav-find-input"
          type="text"
          className="find-input"
          placeholder="Find in page..."
          value={findQuery}
          onChange={(e) => {
            const q = e.target.value;
            setFindQuery(q);
            bridge.findInPageQuery?.(q);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") bridge.findNext?.();
            if (e.key === "Escape") bridge.closeFind?.();
          }}
        />
        <span
          className="find-count"
          style={{
            color: nav.findMatchText && nav.findMatchText !== "No results" ? "var(--accent)" : "var(--danger)",
          }}
        >
          {nav.findMatchText}
        </span>
        <button type="button" className="find-nav-btn" title="Previous" onClick={() => bridge.findPrev?.()}>
          ↑
        </button>
        <button type="button" className="find-nav-btn" title="Next" onClick={() => bridge.findNext?.()}>
          ↓
        </button>
        <button type="button" className="find-close-btn" onClick={() => bridge.closeFind?.()}>
          ×
        </button>
      </div>
    ) : null;

  return (
    <>
      {createPortal(navRow, navHost)}
      {findHost && findBar ? createPortal(findBar, findHost) : null}
    </>
  );
}
