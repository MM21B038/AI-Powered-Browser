import { useCallback, useEffect, useLayoutEffect, useState, type ReactElement } from "react";
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
  ToolsHubRunJsDetail,
  ToolsHubBrowserSearchDetail,
  ToolsHubScientificCalcDetail,
  ToolsHubPythonSandboxDetail,
  ToolsHubUserSkillsDetail,
  ToolsHubScrollDetail,
  ToolsHubSelectDetail,
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
type HubMode = "browser" | "intelligent";

function findToolByIdInCatalog(id: string): { category: ToolsHubCategory; item: ToolsHubItem } | null {
  for (const cat of TOOLS_HUB_CATEGORIES) {
    const item = cat.items.find((it) => it.id === id);
    if (item) return { category: cat, item };
  }
  return null;
}

export function ToolsHubBridge(): ReactElement | null {
  const bridge = typeof window !== "undefined" ? window.legacyBrowser : undefined;
  const [browserHost, setBrowserHost] = useState<HTMLElement | null>(null);
  const [intelligentHost, setIntelligentHost] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<HubView>({ kind: "categories" });
  const [mode, setMode] = useState<HubMode>("browser");
  const [hubOpen, setHubOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const browserEl = document.getElementById("toolsHubRoot");
    const intelligentEl = document.getElementById("intelligentToolsHubRoot");
    return !!(
      (browserEl && browserEl.classList.contains("tools-hub--open")) ||
      (intelligentEl && intelligentEl.classList.contains("tools-hub--open"))
    );
  });

  useLayoutEffect(() => {
    setBrowserHost(document.getElementById("toolsHubRoot"));
    setIntelligentHost(document.getElementById("intelligentToolsHubRoot"));
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ toolId?: string | null; mode?: HubMode }>).detail;
      setHubOpen(true);
      setMode(d?.mode === "intelligent" ? "intelligent" : "browser");
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
  const intelligentSearchTool = findToolByIdInCatalog("browserSearch");
  const intelligentCalcTool = findToolByIdInCatalog("scientificCalc");
  const intelligentPythonTool = findToolByIdInCatalog("pythonSandbox");
  const intelligentUserSkillsTool = findToolByIdInCatalog("userSkills");
  const visibleCategories =
    mode === "intelligent"
      ? TOOLS_HUB_CATEGORIES.map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (it) => it.id === "browserSearch" || it.id === "scientificCalc" || it.id === "pythonSandbox",
          ),
        })).filter((cat) => cat.items.length > 0)
      : TOOLS_HUB_CATEGORIES.map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (it) => it.id !== "browserSearch" && it.id !== "scientificCalc" && it.id !== "pythonSandbox",
          ),
        })).filter((cat) => cat.items.length > 0);
  useEffect(() => {
    if (!hubOpen) return;
    if (mode === "intelligent") return;
    const base = window.location.href.replace(/#.*$/, "");
    const hash = view.kind === "toolDetail" ? `#/tools-hub/${encodeURIComponent(toolId)}` : "#/tools-hub";
    window.history.replaceState(null, "", `${base}${hash}`);
  }, [hubOpen, view.kind, toolId, mode]);

  useEffect(() => {
    if (!hubOpen) return;
    const hubTitle = mode === "intelligent" ? "Intelligent Tool Hub" : "Browser Tool Hub";
    let parts: string[] = [hubTitle];
    if (view.kind === "category") parts = [hubTitle, view.category.title];
    else if (view.kind === "toolDetail") parts = [hubTitle, view.category.title, view.item.label];
    window.dispatchEvent(new CustomEvent("tools-hub-breadcrumb", { detail: { parts } }));
  }, [hubOpen, view, mode]);

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

  const host = mode === "intelligent" ? (intelligentHost ?? browserHost) : browserHost;
  if (!bridge || !host) return null;

  let body: ReactElement;
  if (
    mode === "intelligent" &&
    intelligentSearchTool &&
    intelligentCalcTool &&
    intelligentPythonTool &&
    intelligentUserSkillsTool
  ) {
    const isSearchDetail = view.kind === "toolDetail" && view.item.id === "browserSearch";
    const isCalcDetail = view.kind === "toolDetail" && view.item.id === "scientificCalc";
    const isPythonDetail = view.kind === "toolDetail" && view.item.id === "pythonSandbox";
    const isUserSkillsDetail = view.kind === "toolDetail" && view.item.id === "userSkills";
    body = (
      <div
        className="tools-hub-intelligent-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Intelligent Tool Hub"
        onClick={(e) => {
          if (e.target === e.currentTarget) bridge?.closeToolsHub?.();
        }}
      >
        <div className="tools-hub-intelligent-panel">
          <header className="tools-hub-intelligent-head">
            <div>
              <h1 className="tools-hub-title">Intelligent Tool Hub</h1>
              <p className="tools-hub-subtitle">
                Web search, calculator, Python sandbox, or user SKILL.md skills.
              </p>
            </div>
            <button
              type="button"
              className="browser-chrome-settings-close"
              aria-label="Close Intelligent Tool Hub"
              onClick={() => bridge?.closeToolsHub?.()}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          {isSearchDetail ? (
            <div className="tools-hub-intelligent-body">
              <ToolsHubBrowserSearchDetail
                category={intelligentSearchTool.category}
                item={intelligentSearchTool.item}
                bridge={bridge}
                onBack={() => setView({ kind: "categories" })}
              />
            </div>
          ) : isCalcDetail ? (
            <div className="tools-hub-intelligent-body">
              <ToolsHubScientificCalcDetail
                category={intelligentCalcTool.category}
                item={intelligentCalcTool.item}
                bridge={bridge}
                onBack={() => setView({ kind: "categories" })}
              />
            </div>
          ) : isPythonDetail ? (
            <div className="tools-hub-intelligent-body">
              <ToolsHubPythonSandboxDetail
                category={intelligentPythonTool.category}
                item={intelligentPythonTool.item}
                bridge={bridge}
                onBack={() => setView({ kind: "categories" })}
              />
            </div>
          ) : isUserSkillsDetail ? (
            <div className="tools-hub-intelligent-body">
              <ToolsHubUserSkillsDetail
                category={intelligentUserSkillsTool.category}
                item={intelligentUserSkillsTool.item}
                bridge={bridge}
                onBack={() => setView({ kind: "categories" })}
              />
            </div>
          ) : (
            <div className="tools-hub-intelligent-body tools-hub-intelligent-body--grid">
              <button
                type="button"
                className="tools-hub-card tools-hub-card--single"
                onClick={() =>
                  setView({
                    kind: "toolDetail",
                    category: intelligentSearchTool.category,
                    item: intelligentSearchTool.item,
                  })
                }
              >
                <span
                  className="tools-hub-card-icon"
                  dangerouslySetInnerHTML={{ __html: intelligentSearchTool.item.iconSvg }}
                />
                <span className="tools-hub-card-text">
                  <span className="tools-hub-card-title">{intelligentSearchTool.item.label}</span>
                  <span className="tools-hub-card-desc">{intelligentSearchTool.item.description}</span>
                </span>
              </button>
              <button
                type="button"
                className="tools-hub-card tools-hub-card--single"
                onClick={() =>
                  setView({
                    kind: "toolDetail",
                    category: intelligentCalcTool.category,
                    item: intelligentCalcTool.item,
                  })
                }
              >
                <span
                  className="tools-hub-card-icon"
                  dangerouslySetInnerHTML={{ __html: intelligentCalcTool.item.iconSvg }}
                />
                <span className="tools-hub-card-text">
                  <span className="tools-hub-card-title">{intelligentCalcTool.item.label}</span>
                  <span className="tools-hub-card-desc">{intelligentCalcTool.item.description}</span>
                </span>
              </button>
              <button
                type="button"
                className="tools-hub-card tools-hub-card--single"
                onClick={() =>
                  setView({
                    kind: "toolDetail",
                    category: intelligentPythonTool.category,
                    item: intelligentPythonTool.item,
                  })
                }
              >
                <span
                  className="tools-hub-card-icon"
                  dangerouslySetInnerHTML={{ __html: intelligentPythonTool.item.iconSvg }}
                />
                <span className="tools-hub-card-text">
                  <span className="tools-hub-card-title">{intelligentPythonTool.item.label}</span>
                  <span className="tools-hub-card-desc">{intelligentPythonTool.item.description}</span>
                </span>
              </button>
              <button
                type="button"
                className="tools-hub-card tools-hub-card--single"
                onClick={() =>
                  setView({
                    kind: "toolDetail",
                    category: intelligentUserSkillsTool.category,
                    item: intelligentUserSkillsTool.item,
                  })
                }
              >
                <span
                  className="tools-hub-card-icon"
                  dangerouslySetInnerHTML={{ __html: intelligentUserSkillsTool.item.iconSvg }}
                />
                <span className="tools-hub-card-text">
                  <span className="tools-hub-card-title">{intelligentUserSkillsTool.item.label}</span>
                  <span className="tools-hub-card-desc">{intelligentUserSkillsTool.item.description}</span>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  } else if (view.kind === "categories") {
    body = (
      <div className="tools-hub-inner">
        <header className="tools-hub-header">
          <h1 className="tools-hub-title">{mode === "intelligent" ? "Intelligent Tool Hub" : "Browser Tool Hub"}</h1>
          <p className="tools-hub-subtitle">Pick a category, then a command to insert or run</p>
        </header>
        <div className="tools-hub-grid" role="navigation" aria-label="Command categories">
          {visibleCategories.map((cat) => (
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
          {view.category.items
            .filter((item) =>
              mode === "browser"
                ? item.id !== "browserSearch" && item.id !== "scientificCalc" && item.id !== "pythonSandbox"
                : true,
            )
            .map((item) => (
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
    } else if (td.item.detail === "select") {
      body = (
        <ToolsHubSelectDetail
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
    } else if (td.item.detail === "runJs") {
      body = (
        <ToolsHubRunJsDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "browserSearch") {
      body = (
        <ToolsHubBrowserSearchDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "scientificCalc") {
      body = (
        <ToolsHubScientificCalcDetail
          category={td.category}
          item={td.item}
          bridge={bridge}
          onBack={() => backFromToolDetail(td.category)}
        />
      );
    } else if (td.item.detail === "pythonSandbox") {
      body = (
        <ToolsHubPythonSandboxDetail
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

  return createPortal(
    <div className="tools-hub-portal-shell">
      <div className="tools-hub-portal-body">{body}</div>
    </div>,
    host,
  );
}
