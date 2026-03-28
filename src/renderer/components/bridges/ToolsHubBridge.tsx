import { useCallback, useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import {
  TOOLS_HUB_CATEGORIES,
  type ToolsHubCategory,
  type ToolsHubItem,
  type ToolsHubToolDetail,
} from "../../shared/tools-catalog";
import { ToolsHubNavFlowDetail } from "../tools-hub/ToolDetailNavFlowViews";
import { ToolsHubIoDetail, ToolsHubPickerDemoDetail } from "../tools-hub/ToolDetailIoViews";
import {
  ToolsHubClickDetail,
  ToolsHubFillDetail,
  ToolsHubGenericDetail,
  ToolsHubPressDetail,
  ToolsHubScrollDetail,
  ToolsHubSessionDetail,
  ToolsHubTypeDetail,
} from "../tools-hub/ToolDetailViews";

const TOOLS_HUB_NAV_FLOW_DETAILS: readonly ToolsHubToolDetail[] = [
  "navigate",
  "navControls",
  "tabControls",
  "wait",
];

type HubView =
  | { kind: "categories" }
  | { kind: "category"; category: ToolsHubCategory }
  | { kind: "toolDetail"; category: ToolsHubCategory; item: ToolsHubItem };

function findToolByIdInCatalog(id: string): { category: ToolsHubCategory; item: ToolsHubItem } | null {
  for (const cat of TOOLS_HUB_CATEGORIES) {
    const item = cat.items.find((it) => it.id === id);
    if (item) return { category: cat, item };
  }
  return null;
}

export function ToolsHubBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<HubView>({ kind: "categories" });
  const [hubOpen, setHubOpen] = useState(() => {
    const el = typeof window !== "undefined" ? document.getElementById("toolsHubRoot") : null;
    return !!(el && el.classList.contains("tools-hub--open"));
  });

  useEffect(() => {
    setHost(document.getElementById("toolsHubRoot"));
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ toolId?: string | null }>).detail;
      setHubOpen(true);
      const tid = d?.toolId;
      if (tid) {
        const found = findToolByIdInCatalog(tid);
        if (found) setView({ kind: "toolDetail", category: found.category, item: found.item });
        else setView({ kind: "categories" });
      } else {
        setView({ kind: "categories" });
      }
    };
    const onClose = () => {
      setHubOpen(false);
      setView({ kind: "categories" });
    };
    window.addEventListener("tools-hub-open", onOpen);
    window.addEventListener("tools-hub-close", onClose);
    return () => {
      window.removeEventListener("tools-hub-open", onOpen);
      window.removeEventListener("tools-hub-close", onClose);
    };
  }, []);

  const toolId = view.kind === "toolDetail" ? view.item.id : "";
  useEffect(() => {
    if (!hubOpen) return;
    const base = window.location.href.replace(/#.*$/, "");
    const hash = view.kind === "toolDetail" ? `#/tools-hub/${encodeURIComponent(toolId)}` : "#/tools-hub";
    window.history.replaceState(null, "", `${base}${hash}`);
  }, [hubOpen, view.kind, toolId]);

  useEffect(() => {
    if (!hubOpen) return;
    let parts: string[] = ["Tool Hub"];
    if (view.kind === "category") parts = ["Tool Hub", view.category.title];
    else if (view.kind === "toolDetail") parts = ["Tool Hub", view.category.title, view.item.label];
    window.dispatchEvent(new CustomEvent("tools-hub-breadcrumb", { detail: { parts } }));
  }, [hubOpen, view]);

  const runCommand = useCallback(
    (command: string) => {
      bridge?.runQuickCommand?.(command, { closeHub: true });
    },
    [bridge],
  );

  const openCategory = useCallback((category: ToolsHubCategory) => {
    setView({ kind: "category", category });
  }, []);

  const backToCategories = useCallback(() => {
    setView({ kind: "categories" });
  }, []);

  const openToolRow = useCallback(
    (category: ToolsHubCategory, item: ToolsHubItem) => {
      if (item.detail) {
        setView({ kind: "toolDetail", category, item });
        return;
      }
      runCommand(item.command);
    },
    [runCommand],
  );

  const backFromToolDetail = useCallback((category: ToolsHubCategory) => {
    setView({ kind: "category", category });
  }, []);

  if (!bridge || !host) return null;

  let body: ReactElement;
  if (view.kind === "categories") {
    body = (
      <div className="tools-hub-inner">
        <header className="tools-hub-header">
          <h1 className="tools-hub-title">Tools &amp; commands</h1>
          <p className="tools-hub-subtitle">Pick a category, then a command to insert or run</p>
        </header>
        <div className="tools-hub-grid" role="navigation" aria-label="Command categories">
          {TOOLS_HUB_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="tools-hub-card"
              onClick={() => openCategory(cat)}
            >
              <span className="tools-hub-card-icon" dangerouslySetInnerHTML={{ __html: cat.iconSvg }} />
              <span className="tools-hub-card-text">
                <span className="tools-hub-card-title">{cat.title}</span>
                {cat.subtitle ? <span className="tools-hub-card-desc">{cat.subtitle}</span> : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (view.kind === "category") {
    body = (
      <div className="tools-hub-inner tools-hub-inner--detail">
        <header className="tools-hub-detail-header">
          <button type="button" className="tools-hub-back" onClick={backToCategories} aria-label="Back to categories">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
          <h2 className="tools-hub-detail-title">{view.category.title}</h2>
        </header>
        <div className="tools-hub-grid" role="navigation" aria-label="Tools in category">
          {view.category.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tools-hub-card"
              onClick={() => openToolRow(view.category, item)}
            >
              <span className="tools-hub-card-icon" dangerouslySetInnerHTML={{ __html: item.iconSvg }} />
              <span className="tools-hub-card-text">
                <span className="tools-hub-card-title">{item.label}</span>
                <span className="tools-hub-card-desc">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    const td = view;
    if (td.item.detail === "scroll") {
      body = (
        <ToolsHubScrollDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "fill") {
      body = (
        <ToolsHubFillDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "type") {
      body = (
        <ToolsHubTypeDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "click") {
      body = (
        <ToolsHubClickDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "press") {
      body = (
        <ToolsHubPressDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail && TOOLS_HUB_NAV_FLOW_DETAILS.includes(td.item.detail)) {
      body = (
        <ToolsHubNavFlowDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "session") {
      body = (
        <ToolsHubSessionDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "io") {
      body = (
        <ToolsHubIoDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "pickerDemo") {
      body = (
        <ToolsHubPickerDemoDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else {
      body = (
        <ToolsHubGenericDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    }
  }

  return createPortal(body, host);
}
