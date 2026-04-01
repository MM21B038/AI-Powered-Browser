import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

const POLL_MS = 350;

type BookmarkRow = { title: string; url: string };
type HistoryRow = { url: string; title: string; visitedAt: number };
type PasswordRow = { url: string; username: string; password: string; note?: string };

function faviconUrlForHostname(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16`;
}

export function SidePanelsBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [hosts, setHosts] = useState<{
    bookmarks: HTMLElement | null;
    history: HTMLElement | null;
    passwords: HTMLElement | null;
  }>({ bookmarks: null, history: null, passwords: null });
  const [snap, setSnap] = useState<{
    profile: LegacyProfileSnapshot;
    bmQ: string;
    histQ: string;
    pwQ: string;
  } | null>(null);

  useEffect(() => {
    setHosts({
      bookmarks: document.getElementById("bookmarksList"),
      history: document.getElementById("historyList"),
      passwords: document.getElementById("passwordsList"),
    });
  }, []);

  useEffect(() => {
    if (!bridge?.getProfileSnapshot || !bridge.getState) return;
    const tick = () => {
      if (!bridge.getState?.()?.useReactSidePanelsUi) return;
      const profile = bridge.getProfileSnapshot!();
      const bmQ =
        (document.getElementById("bookmarkSearch") as HTMLInputElement | null)?.value ?? "";
      const histQ =
        (document.getElementById("historySearch") as HTMLInputElement | null)?.value ?? "";
      const pwQ =
        (document.getElementById("passwordSearch") as HTMLInputElement | null)?.value ?? "";
      setSnap({ profile, bmQ, histQ, pwQ });
    };
    tick();
    const t = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(t);
  }, [bridge]);

  if (!bridge || !snap) return null;
  if (!bridge.getState?.()?.useReactSidePanelsUi) return null;
  const { bookmarks: bmHost, history: histHost, passwords: pwHost } = hosts;
  if (!bmHost || !histHost || !pwHost) return null;

  const bookmarks = snap.profile.bookmarks as BookmarkRow[];
  const history = snap.profile.history as HistoryRow[];
  const passwords = snap.profile.passwords as PasswordRow[];

  const bmLower = snap.bmQ.toLowerCase();
  const bmItems = bmLower
    ? bookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(bmLower) || b.url.toLowerCase().includes(bmLower),
      )
    : bookmarks;

  const histLower = snap.histQ.toLowerCase();
  const histItems = (histLower
    ? history.filter(
        (h) =>
          h.title.toLowerCase().includes(histLower) || h.url.toLowerCase().includes(histLower),
      )
    : history
  ).slice(0, 300);

  const pwLower = snap.pwQ.toLowerCase();
  const pwItems = pwLower
    ? passwords.filter(
        (pw) =>
          pw.url.toLowerCase().includes(pwLower) || pw.username.toLowerCase().includes(pwLower),
      )
    : passwords;

  const bookmarksBody =
    bmItems.length === 0 ? (
      <div className="side-empty">
        <div className="side-empty-title">No bookmarks yet</div>
        <div className="side-empty-hint">Use the star in the toolbar to save the current page.</div>
      </div>
    ) : (
      bmItems.map((b) => {
        let hostname = "";
        try {
          hostname = new URL(b.url).hostname;
        } catch {
          /* ignore */
        }
        return (
          <div key={`${b.url}\0${b.title}`} className="side-item">
            <img
              className="side-favicon"
              src={faviconUrlForHostname(hostname)}
              alt=""
              width={14}
              height={14}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div
              className="side-item-info"
              role="button"
              tabIndex={0}
              onClick={() => {
                bridge.navigateToUrl?.(b.url);
                bridge.closeSidePanels?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  bridge.navigateToUrl?.(b.url);
                  bridge.closeSidePanels?.();
                }
              }}
            >
              <div className="side-item-title">{b.title}</div>
              <div className="side-item-url">{b.url}</div>
            </div>
            <button
              type="button"
              className="side-item-del"
              aria-label="Remove bookmark"
              onClick={(e) => {
                e.stopPropagation();
                bridge.removeBookmarkByUrl?.(b.url);
              }}
            >
              ✕
            </button>
          </div>
        );
      })
    );

  const historyBody =
    histItems.length === 0 ? (
      <div className="side-empty">
        <div className="side-empty-title">No history yet</div>
        <div className="side-empty-hint">Pages you open will show up here.</div>
      </div>
    ) : (
      histItems.map((h) => {
        let hostname = "";
        try {
          hostname = new URL(h.url).hostname;
        } catch {
          /* ignore */
        }
        const date = new Date(h.visitedAt).toLocaleDateString();
        return (
          <div key={`${h.url}\0${h.visitedAt}`} className="side-item">
            <img
              className="side-favicon"
              src={faviconUrlForHostname(hostname)}
              alt=""
              width={14}
              height={14}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div
              className="side-item-info"
              role="button"
              tabIndex={0}
              onClick={() => {
                bridge.navigateToUrl?.(h.url);
                bridge.closeSidePanels?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  bridge.navigateToUrl?.(h.url);
                  bridge.closeSidePanels?.();
                }
              }}
            >
              <div className="side-item-title">{h.title}</div>
              <div className="side-item-url">{h.url}</div>
            </div>
            <span className="side-item-date">{date}</span>
          </div>
        );
      })
    );

  const passwordsBody =
    pwItems.length === 0 ? (
      <div className="side-empty">
        <div className="side-empty-title">No saved passwords</div>
        <div className="side-empty-hint">Import from another browser or use + to add an entry.</div>
      </div>
    ) : (
      pwItems.map((pw) => {
        const isEncrypted =
          pw.password.startsWith("[encrypted") || pw.password.startsWith("[");
        return (
          <div key={`${pw.url}\0${pw.username}`} className="side-item pw-item">
            <div className="pw-icon">🔑</div>
            <div className="side-item-info">
              <div className="side-item-title">{pw.url || "Unknown site"}</div>
              <div className="side-item-url">{pw.username}</div>
              {pw.note ? <div className="pw-note">{pw.note}</div> : null}
            </div>
            <div className="pw-actions">
              {!isEncrypted ? (
                <>
                  <button
                    type="button"
                    className="pw-copy-btn"
                    aria-label="Copy username"
                    onClick={() => {
                      void navigator.clipboard.writeText(pw.username).then(() => {
                        bridge.showToast?.("📋 Username copied");
                      });
                    }}
                  >
                    👤
                  </button>
                  <button
                    type="button"
                    className="pw-copy-btn"
                    aria-label="Copy password"
                    onClick={() => {
                      void navigator.clipboard.writeText(pw.password).then(() => {
                        bridge.showToast?.("📋 Password copied");
                      });
                    }}
                  >
                    🔒
                  </button>
                  <button
                    type="button"
                    className="pw-del-btn"
                    aria-label="Delete password entry"
                    onClick={() => bridge.deletePasswordEntry?.(pw.url, pw.username)}
                  >
                    ✕
                  </button>
                </>
              ) : null}
            </div>
          </div>
        );
      })
    );

  return (
    <>
      {createPortal(bookmarksBody, bmHost)}
      {createPortal(historyBody, histHost)}
      {createPortal(passwordsBody, pwHost)}
    </>
  );
}
