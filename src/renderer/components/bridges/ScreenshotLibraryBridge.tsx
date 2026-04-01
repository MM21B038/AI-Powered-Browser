import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  loadScreenshotLibrary,
  removeScreenshotLibraryEntriesByIds,
  type ScreenshotLibraryEntry,
} from "../../services/screenshot-library-store";
import {
  formatScreenshotTileTime,
  groupScreenshotLibraryByDay,
} from "../../services/screenshot-library-date-groups";

const PAGE_SIZE = 40;
const SCROLL_LOAD_THRESHOLD_PX = 200;

function modeLabel(mode: ScreenshotLibraryEntry["mode"]): string {
  switch (mode) {
    case "viewport":
      return "Viewport";
    case "fullpage":
      return "Full page";
    case "region":
      return "Region";
    case "element":
      return "Element";
    case "background":
      return "Background session";
    default:
      return String(mode);
  }
}

function truncateUrl(url: string, max = 52): string {
  const t = (url || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function copyImageDataUrl(dataUrl: string): Promise<boolean> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const type = blob.type || "image/png";
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return true;
  } catch {
    try {
      const r = await window.electronAPI?.copyScreenshotDataUrlToClipboard?.(dataUrl);
      return !!(r && r.success);
    } catch {
      return false;
    }
  }
}

export function ScreenshotLibraryBridge(): ReactElement | null {
  const bridge =
    typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<ScreenshotLibraryEntry[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailDataUrl, setDetailDataUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const galleryScrollRef = useRef<HTMLDivElement>(null);

  const refreshItems = useCallback(() => {
    setItems(loadScreenshotLibrary());
  }, []);

  useEffect(() => {
    setHost(document.getElementById("screenshotsListHost"));
  }, []);

  useEffect(() => {
    if (!bridge?.getState?.()?.useReactSidePanelsUi) return;
    refreshItems();
    const onLib = () => refreshItems();
    window.addEventListener("orion-screenshot-library-changed", onLib);
    return () => window.removeEventListener("orion-screenshot-library-changed", onLib);
  }, [bridge, refreshItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.filename.toLowerCase().includes(q) ||
        it.url.toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q),
    );
  }, [items, query]);

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const daySections = useMemo(
    () => groupScreenshotLibraryByDay(visibleItems),
    [visibleItems],
  );

  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, Math.max(0, filtered.length)));
  }, [query, items, filtered.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const it of visibleItems) {
        if (cancelled) return;
        const r = await window.electronAPI.readScreenshotFile(it.path);
        if (cancelled || !r?.success || !r.data?.dataUrl) continue;
        setThumbs((prev) => {
          if (prev[it.id]) return prev;
          return { ...prev, [it.id]: r.data!.dataUrl };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visibleItems]);

  const onGalleryScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (
        el.scrollTop + el.clientHeight >=
        el.scrollHeight - SCROLL_LOAD_THRESHOLD_PX
      ) {
        setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
      }
    },
    [filtered.length],
  );

  const detailEntry = useMemo(
    () => (detailId ? items.find((i) => i.id === detailId) ?? null : null),
    [detailId, items],
  );

  useEffect(() => {
    if (!detailEntry) {
      setDetailDataUrl(null);
      return;
    }
    const cached = thumbs[detailEntry.id];
    if (cached) {
      setDetailDataUrl(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await window.electronAPI.readScreenshotFile(detailEntry.path);
      if (cancelled || !r?.success || !r.data?.dataUrl) return;
      setDetailDataUrl(r.data.dataUrl);
      setThumbs((prev) => ({ ...prev, [detailEntry.id]: r.data!.dataUrl }));
    })();
    return () => {
      cancelled = true;
    };
  }, [detailEntry, thumbs]);

  useEffect(() => {
    if (!detailId) {
      window.dispatchEvent(
        new CustomEvent("orion-screenshot-crumbs", {
          detail: { parts: ["Screenshot Library"] },
        }),
      );
      return;
    }
    const e = items.find((i) => i.id === detailId);
    const name = e?.filename || "Image";
    window.dispatchEvent(
      new CustomEvent("orion-screenshot-crumbs", {
        detail: { parts: ["Screenshot Library", name] },
      }),
    );
  }, [detailId, items]);

  const deleteByIds = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids);
      const paths = items
        .filter((it) => idSet.has(it.id))
        .map((it) => it.path);
      for (const p of paths) {
        try {
          await window.electronAPI.deleteScreenshotFile(p);
        } catch {
          /* ignore per file */
        }
      }
      removeScreenshotLibraryEntriesByIds(idSet);
      refreshItems();
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      if (detailId && idSet.has(detailId)) {
        setDetailId(null);
      }
      setThumbs((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      window.dispatchEvent(new CustomEvent("orion-screenshot-library-changed"));
    },
    [items, detailId, refreshItems],
  );

  if (!bridge || !host) return null;
  if (!bridge.getState?.()?.useReactSidePanelsUi) return null;

  const openPage = (url: string) => {
    const u = (url || "").trim();
    if (!u) return;
    bridge.navigateToUrl?.(u);
    bridge.closeSidePanels?.();
  };

  const toolbar = !detailId ? (
    <div className="screenshot-lib-toolbar">
      <input
        type="search"
        className="screenshot-lib-search"
        placeholder="Search by name, URL, or title…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search screenshots"
      />
      <div className="screenshot-lib-toolbar-actions">
        <button
          type="button"
          className="screenshot-lib-btn"
          onClick={() => setSelected(new Set(filtered.map((i) => i.id)))}
        >
          Select all
        </button>
        <button
          type="button"
          className="screenshot-lib-btn"
          onClick={() => setSelected(new Set())}
        >
          Clear
        </button>
        <button
          type="button"
          className="screenshot-lib-btn screenshot-lib-btn--danger"
          disabled={selected.size === 0}
          onClick={() => void deleteByIds([...selected])}
        >
          Delete selected
        </button>
      </div>
    </div>
  ) : null;

  const renderTile = (it: ScreenshotLibraryEntry) => {
    const checked = selected.has(it.id);
    const thumb = thumbs[it.id];
    return (
      <div
        key={it.id}
        className={`screenshot-lib-tile${checked ? " screenshot-lib-tile--selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setDetailId(it.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailId(it.id);
          }
        }}
      >
        <label
          className="screenshot-lib-tile-check"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setSelected((s) => {
                const n = new Set(s);
                if (e.target.checked) n.add(it.id);
                else n.delete(it.id);
                return n;
              });
            }}
            aria-label={`Select ${it.filename}`}
          />
        </label>
        <div className="screenshot-lib-tile-thumb-wrap">
          {thumb ? (
            <img className="screenshot-lib-tile-thumb" src={thumb} alt="" />
          ) : (
            <div className="screenshot-lib-tile-placeholder" aria-hidden />
          )}
        </div>
        <div className="screenshot-lib-tile-meta">
          <span className="screenshot-lib-tile-name">{it.filename}</span>
          <span className="screenshot-lib-tile-time">
            {formatScreenshotTileTime(it.takenAt)}
          </span>
        </div>
      </div>
    );
  };

  const listBody =
    filtered.length === 0 ? (
      <div className="side-empty">
        <div className="side-empty-title">No screenshots yet</div>
        <div className="side-empty-hint">
          Use the camera menu in the toolbar to capture the viewport, full page, or a region.
        </div>
      </div>
    ) : (
      <div
        ref={galleryScrollRef}
        className="screenshot-lib-scroll"
        onScroll={onGalleryScroll}
      >
        {daySections.map((section) => (
          <section
            key={section.dayKey}
            className="screenshot-lib-section"
            aria-labelledby={`screenshot-section-${section.dayKey}`}
          >
            <div className="screenshot-lib-section-head">
              <h3
                className="screenshot-lib-section-title"
                id={`screenshot-section-${section.dayKey}`}
              >
                {section.label}
              </h3>
            </div>
            <div className="screenshot-lib-grid">{section.items.map(renderTile)}</div>
          </section>
        ))}
        {visibleCount < filtered.length ? (
          <div className="screenshot-lib-load-hint" aria-hidden>
            Scroll for more…
          </div>
        ) : null}
      </div>
    );

  const detailView =
    detailId && detailEntry ? (
      <div className="screenshot-lib-detail">
        <div className="screenshot-lib-detail-top">
          <button
            type="button"
            className="screenshot-lib-back"
            onClick={() => setDetailId(null)}
          >
            Back to library
          </button>
        </div>
        <div className="screenshot-lib-detail-body">
          <div className="screenshot-lib-detail-left">
            {detailDataUrl ? (
              <img
                className="screenshot-lib-detail-img"
                src={detailDataUrl}
                alt={detailEntry.filename}
              />
            ) : (
              <div className="screenshot-lib-detail-loading">Loading…</div>
            )}
          </div>
          <div className="screenshot-lib-detail-right">
            <h3 className="screenshot-lib-detail-title">{detailEntry.filename}</h3>
            <dl className="screenshot-lib-dl">
              <dt>Taken</dt>
              <dd>{new Date(detailEntry.takenAt).toLocaleString()}</dd>
              <dt>Capture</dt>
              <dd>{modeLabel(detailEntry.mode)}</dd>
              {(detailEntry.width != null || detailEntry.height != null) && (
                <>
                  <dt>Size</dt>
                  <dd>
                    {detailEntry.width ?? "?"} × {detailEntry.height ?? "?"}{" "}
                    px
                  </dd>
                </>
              )}
              <dt>Page title</dt>
              <dd>{detailEntry.title || "—"}</dd>
              <dt>URL</dt>
              <dd className="screenshot-lib-url-dd">
                <span
                  {...(detailEntry.url
                    ? { "aria-label": detailEntry.url }
                    : {})}
                >
                  {detailEntry.url ? truncateUrl(detailEntry.url) : "—"}
                </span>
              </dd>
              <dt>File</dt>
              <dd className="screenshot-lib-path-dd">
                <span aria-label={detailEntry.path}>{detailEntry.path}</span>
              </dd>
            </dl>
            <div className="screenshot-lib-detail-actions">
              <button
                type="button"
                className="screenshot-lib-icon-btn"
                aria-label="Open page in browser"
                disabled={!detailEntry.url?.trim()}
                onClick={() => openPage(detailEntry.url)}
              >
                <svg
                  className="screenshot-lib-action-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15 3h6v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 14L21 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="screenshot-lib-icon-btn"
                aria-label="Copy image to clipboard"
                disabled={!detailDataUrl}
                onClick={() => {
                  if (detailDataUrl)
                    void copyImageDataUrl(detailDataUrl).then((ok) => {
                      if (ok) bridge.showToast?.("Copied image to clipboard");
                      else bridge.showToast?.("Could not copy image");
                    });
                }}
              >
                <svg
                  className="screenshot-lib-action-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <rect
                    x="9"
                    y="9"
                    width="13"
                    height="13"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="screenshot-lib-icon-btn screenshot-lib-icon-btn--danger"
                aria-label="Delete screenshot"
                onClick={() => void deleteByIds([detailEntry.id])}
              >
                <svg
                  className="screenshot-lib-action-svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 11v6M14 11v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const body = detailView ?? (
    <>
      {toolbar}
      {listBody}
    </>
  );

  return createPortal(<div className="screenshot-lib-root">{body}</div>, host);
}
