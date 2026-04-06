import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type {
  ImportStatsDetail,
  ListedBrowserProfile,
  McpBridgeState,
  SystemInfo,
} from "../../../shared/ipc-types";

function IconRefresh(): ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
    </svg>
  );
}

function IconTrash(): ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 1 1 2 0v2" />
      <path d="M13 6V4a1 1 0 1 1 2 0v2" />
    </svg>
  );
}
import type { McpRemoteTransport } from "../../../shared/mcp-external-types";
import {
  MCP_BROWSER_TOOL_NAMES,
  MCP_INTELLIGENT_TOOL_NAMES,
} from "../../../shared/mcp-tool-registry";
import { getElectronApi } from "../../services/electron-api";
import {
  AI_PROVIDER_SELECT_OPTIONS,
  BUTCHER_BUILTIN_MCP_ID,
  INTELLIGENT_BUILTIN_MCP_ID,
  createEmptyMcpServer,
  loadIntelligentSettings,
  mcpServerHasConnectionParams,
  parseAiProvider,
  resolveOpenAiCompatibleBaseUrl,
  saveIntelligentSettings,
  type IntelligentSettingsState,
  type McpServerConfig,
} from "../../state/session-settings-store";
import {
  listGoogleModels,
  listOpenAiCompatibleModels,
  testChatHi,
} from "../../services/ai-models";

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Intelligent settings modal: left nav targets (IDs match section card `id`). */
const INTELLIGENT_SETTINGS_SECTIONS: readonly {
  id: string;
  label: string;
  hint: string;
  icon:
    | "appearance"
    | "ai"
    | "mcp-browser-bridge"
    | "mcp-intelligent-bridge"
    | "mcp-tools";
}[] = [
  {
    id: "iw-settings-appearance",
    label: "Appearance",
    hint: "Theme and appearance",
    icon: "appearance",
  },
  { id: "iw-settings-ai", label: "AI", hint: "AI provider and keys", icon: "ai" },
  {
    id: "iw-settings-mcp-browser-bridge",
    label: "Browser MCP",
    hint: "Browser Server bridge",
    icon: "mcp-browser-bridge",
  },
  {
    id: "iw-settings-mcp-intelligent-bridge",
    label: "Intelligent MCP",
    hint: "Intelligent Server bridge",
    icon: "mcp-intelligent-bridge",
  },
  {
    id: "iw-settings-mcp-tools",
    label: "MCP tools",
    hint: "MCP servers and tools",
    icon: "mcp-tools",
  },
];

/** Theme IDs shown first in intelligent Appearance; order matches presets. */
const INTELLIGENT_THEME_IDS = [
  "dark",
  "ink",
  "aurora",
  "ocean",
  "ember",
  "neon",
  "forest",
  "sunset",
  "lavender",
  "prism",
  "minimal",
] as const;

const INTELLIGENT_THEME_PREVIEW_COUNT = 3;

const INTELLIGENT_THEME_PREVIEW_LIST = INTELLIGENT_THEME_IDS.slice(
  0,
  INTELLIGENT_THEME_PREVIEW_COUNT,
);
const INTELLIGENT_THEME_REST_LIST = INTELLIGENT_THEME_IDS.slice(
  INTELLIGENT_THEME_PREVIEW_COUNT,
);

function intelligentThemeDisplayName(
  t: (typeof INTELLIGENT_THEME_IDS)[number],
): string {
  if (t === "dark") return "Void";
  if (t === "ink") return "Ink";
  if (t === "prism") return "Prism";
  return t[0].toUpperCase() + t.slice(1);
}

function IntelligentSettingsNavIcon({
  kind,
}: {
  kind: (typeof INTELLIGENT_SETTINGS_SECTIONS)[number]["icon"];
}): ReactElement {
  const s = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "appearance":
      return (
        <svg {...s}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "ai":
      return (
        <svg {...s}>
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          <path d="M5 19h14" opacity="0.85" />
        </svg>
      );
    case "mcp-browser-bridge":
      return (
        <svg {...s}>
          <circle cx="10.5" cy="12" r="6.5" />
          <path d="M4 12h13M10.5 5.5v13" />
          <path d="M8.3 6.4a9.6 9.6 0 0 0 0 11.2M12.7 6.4a9.6 9.6 0 0 1 0 11.2" />
          <rect x="15.6" y="9.9" width="5.1" height="4.2" rx="1" />
          <path d="M20.7 11h1.4M20.7 13h1.4" />
        </svg>
      );
    case "mcp-intelligent-bridge":
      return (
        <svg {...s}>
          <rect x="4" y="6.2" width="13" height="10.3" rx="2.5" />
          <circle cx="8.8" cy="11.4" r="1" />
          <circle cx="12.2" cy="11.4" r="1" />
          <path d="M7.7 14.1h5.6" />
          <path d="M10.5 3.8v2.4M7.6 4.9h5.8" />
          <rect x="17.2" y="9.9" width="4.6" height="4.2" rx="1" />
          <path d="M21.8 11h1.2M21.8 13h1.2" />
        </svg>
      );
    case "mcp-tools":
      return (
        <svg {...s}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    default:
      return <svg {...s}><circle cx="12" cy="12" r="3" /></svg>;
  }
}

/** Scroll target within the settings body only — avoids scrolling ancestor nodes (which hides the modal header). */
function scrollElementIntoSettingsScrollRoot(
  scrollRoot: HTMLElement,
  target: HTMLElement,
  behavior: ScrollBehavior,
) {
  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const pad = 8;
  const nextTop =
    scrollRoot.scrollTop + (targetRect.top - rootRect.top) - pad;
  scrollRoot.scrollTo({ top: Math.max(0, nextTop), behavior });
}

/**
 * Scroll-spy: which intelligent section should be active in the side nav.
 * Uses visible height inside the scroll root for all sections (not IntersectionObserver’s
 * partial entry batches). Near max scroll, pins the last section so the final block wins.
 */
function computeActiveIntelligentSectionId(
  root: HTMLElement,
  sectionsInOrder: readonly { id: string }[],
): string | null {
  if (sectionsInOrder.length === 0) return null;
  const epsilon = 4;
  const canScroll = root.scrollHeight > root.clientHeight + 1;
  const atBottom =
    canScroll &&
    root.scrollHeight - root.scrollTop - root.clientHeight <= epsilon;
  if (atBottom) {
    return sectionsInOrder[sectionsInOrder.length - 1]?.id ?? null;
  }

  const rootRect = root.getBoundingClientRect();
  let bestId: string | null = null;
  let bestH = -1;
  for (const s of sectionsInOrder) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const top = Math.max(r.top, rootRect.top);
    const bottom = Math.min(r.bottom, rootRect.bottom);
    const h = Math.max(0, bottom - top);
    if (h > bestH) {
      bestH = h;
      bestId = s.id;
    }
  }
  return bestId;
}

/** One-line summary for a collapsed MCP server row. */
function mcpServerSubtitle(m: McpServerConfig): string {
  if (m.serverMode === "remote") {
    const u = (m.url || "").trim();
    return u ? truncateText(u, 54) : "Remote — URL not set";
  }
  const cmd = (m.command || "").trim();
  if (!cmd) return "Stdio — command not set";
  const argsOneLine = (m.args || "").replace(/\s+/g, " ").trim();
  const extra =
    argsOneLine && argsOneLine !== "[]"
      ? ` ${truncateText(argsOneLine, 36)}`
      : "";
  return truncateText(`${cmd}${extra}`, 58);
}

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Rail → browser chrome only; chat gear → intelligent (theme, AI, MCP). */
  panel?: "browser" | "intelligent";
  /** `workspace` = full main column; `sidePanel` = webview column like bookmarks/history. */
  layout?: "modal" | "workspace" | "sidePanel";
  /** Wider centered modal for assistant settings. */
  modalSize?: "default" | "xl";
  /** Bumps when kernel re-dispatches open while React `open` may still be true — re-sync `data-settings-open` / overlay host. */
  domSyncEpoch?: number;
};

type AppDataStats = {
  bookmarks: number;
  history: number;
  cookies: number;
  passwords: number;
  autofill: number;
  lastImport: {
    browser?: string;
    count?: number;
    timestamp?: number;
    dataTypes?: string[];
  } | null;
};

const chromeLogo = (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
    <circle
      cx="24"
      cy="24"
      r="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      opacity="0.35"
    />
    <path
      fill="currentColor"
      d="M24 10c6.5 0 12 4.2 14 10h-14a10 10 0 0 0-9.2 6L13 16c2.8-3.6 7.2-6 11-6zm-12.5 8.5 5.8 10A10 10 0 0 0 24 34c3.2 0 6-1.5 7.8-3.8l-6.5 11.2C17.8 39.5 14 32.2 14 24c0-2 .3-3.9.5-5.5zm25 3A10 10 0 0 1 24 38c-2.2 0-4.3-.7-6-2l14.5-25A15.9 15.9 0 0 1 38 24c0 2.6-.6 5-1.5 7.5z"
    />
  </svg>
);

const firefoxLogo = (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="currentColor"
      d="M24 8c-6 0-11 3.5-13.5 8.5 1-1 2.5-2 4-2.5-.5 1.5-.8 3-.8 4.8 0 6.2 4.5 11.2 10.3 12.2-.5-1.2-.8-2.5-.8-3.8 0-5 4-9 9-9 5 0 9 4 9 9 0 4.5-3.2 8.2-7.5 8.8C35 39 40 32.5 40 25c0-9-7-17-16-17z"
      opacity="0.9"
    />
  </svg>
);

function formatImportLine(s: ImportStatsDetail | null): string {
  if (!s?.available) return "No data found for this profile.";
  const b = s.bookmarks ?? 0;
  const h = s.history ?? 0;
  const c = s.cookies ?? 0;
  const p = s.passwords ?? 0;
  const a = s.autofill ?? 0;
  return `${b} bookmarks · ${h} history · ${c} cookies · ${p} passwords · ${a} autofill rows`;
}

export function SettingsPanel({
  open,
  onClose,
  panel = "browser",
  layout = "modal",
  modalSize = "default",
  domSyncEpoch = 0,
}: SettingsPanelProps): ReactElement | null {
  const [homePage, setHomePage] = useState("");
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [browser, setBrowser] = useState<"" | "chrome" | "firefox">("");
  const [profilePath, setProfilePath] = useState("");
  const [chromeProfiles, setChromeProfiles] = useState<ListedBrowserProfile[]>(
    [],
  );
  const [firefoxProfiles, setFirefoxProfiles] = useState<
    ListedBrowserProfile[]
  >([]);
  const [impBm, setImpBm] = useState(true);
  const [impHist, setImpHist] = useState(true);
  const [impCookies, setImpCookies] = useState(false);
  const [impPw, setImpPw] = useState(false);
  const [impAf, setImpAf] = useState(false);
  const [sourceStatsLine, setSourceStatsLine] = useState("");
  const [appStats, setAppStats] = useState<AppDataStats | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [progress, setProgress] = useState({ show: false, pct: 0, text: "" });
  const [activeTheme, setActiveTheme] = useState(
    () =>
      (typeof localStorage !== "undefined" && localStorage.getItem("theme")) ||
      "dark",
  );
  const [intelligentSettings, setIntelligentSettings] =
    useState<IntelligentSettingsState>(() => loadIntelligentSettings());
  const intelligentHydratedRef = useRef(false);
  /** Matches last persisted intelligent JSON (disk or explicit save) to avoid debounced save + global events on every open. */
  const intelligentDiskJsonRef = useRef<string>("");
  const [mcpBridge, setMcpBridge] = useState<McpBridgeState | null>(null);
  const [mcpPortDraft, setMcpPortDraft] = useState("");
  const [mcpIntelligentPortDraft, setMcpIntelligentPortDraft] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelTestBusy, setModelTestBusy] = useState(false);
  const [aiModelActionFeedback, setAiModelActionFeedback] = useState<
    string | null
  >(null);
  const googleApiKeyInputRef = useRef<HTMLInputElement>(null);
  const customApiKeyInputRef = useRef<HTMLInputElement>(null);
  const customBaseUrlInputRef = useRef<HTMLInputElement>(null);
  const [modelListFilter, setModelListFilter] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [expandedMcpServerIds, setExpandedMcpServerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [reloadingMcpServerIds, setReloadingMcpServerIds] = useState<
    Set<string>
  >(() => new Set());

  /** Scroll container for intelligent suite (`.settings-dashboard`, the element that scrolls). */
  const intelligentScrollRootRef = useRef<HTMLDivElement>(null);
  const intelligentNavTrackRef = useRef<HTMLDivElement>(null);
  const intelligentNavButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Skip scroll-spy updates right after programmatic nav scroll (avoids highlight fighting smooth scroll). */
  const intelligentNavIoSkipUntilRef = useRef(0);
  const intelligentSettingsOpenWasFalseRef = useRef(true);
  const [activeIntelligentSectionId, setActiveIntelligentSectionId] = useState<
    string | null
  >(null);
  const [intelligentNavIndicator, setIntelligentNavIndicator] = useState({
    top: 0,
    height: 0,
  });
  const [intelligentThemeGridExpanded, setIntelligentThemeGridExpanded] =
    useState(false);

  const notifyAiModelAction = (msg: string) => {
    setAiModelActionFeedback(msg);
    window.dispatchEvent(
      new CustomEvent("legacy-toast", { detail: { msg, duration: 4500 } }),
    );
    window.legacyBrowser?.showToast?.(msg, 4500);
  };

  useLayoutEffect(() => {
    const host = document.getElementById("webviewOverlayHost");
    if (layout === "workspace") {
      if (host) host.setAttribute("aria-hidden", "true");
      window.legacyBrowser?.syncRailAndWebview?.();
      return;
    }
    if (layout === "sidePanel") {
      if (open) {
        document
          .getElementById("appContainer")
          ?.removeAttribute("data-settings-open");
        if (host) host.setAttribute("aria-hidden", "true");
      }
      window.legacyBrowser?.syncRailAndWebview?.();
      return;
    }
    const shell = document.getElementById("appContainer");
    if (shell) shell.toggleAttribute("data-settings-open", open);
    if (host) host.setAttribute("aria-hidden", open ? "false" : "true");
    window.legacyBrowser?.syncRailAndWebview?.();
  }, [open, layout, domSyncEpoch]);

  useLayoutEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("react-settings-mounted"));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) {
      intelligentHydratedRef.current = false;
      setExpandedMcpServerIds(new Set());
      setModelPickerOpen(false);
      return;
    }
    const hp = window.legacyBrowser?.getHomePage?.() ?? "";
    setHomePage(hp);
    setActiveTheme(localStorage.getItem("theme") || "dark");
    const loaded = loadIntelligentSettings();
    setIntelligentSettings(loaded);
    intelligentDiskJsonRef.current = JSON.stringify(loaded);
    if (panel === "intelligent") {
      setExpandedMcpServerIds(
        new Set(
          loaded.mcpServers
            .filter((m) => !mcpServerHasConnectionParams(m))
            .map((m) => m.id),
        ),
      );
    }
    intelligentHydratedRef.current = true;
    const api = getElectronApi();
    if (!api) return;
    void api.getSystemInfo().then(setSys);
    void api.listBrowserProfiles().then((lists) => {
      setChromeProfiles(lists.chrome);
      setFirefoxProfiles(lists.firefox);
    });
    void api.getDataStats().then((raw) => {
      const d = raw as AppDataStats;
      setAppStats(d);
    });
    if (panel === "intelligent") {
      void api.mcpBridgeGetState().then((s) => {
        setMcpBridge(s);
        setMcpPortDraft(String(s.port));
        setMcpIntelligentPortDraft(String(s.intelligentPort));
      });
    }
    return () => {
      intelligentHydratedRef.current = false;
    };
  }, [open, panel]);

  useEffect(() => {
    if (!open || !intelligentHydratedRef.current || panel !== "intelligent")
      return;
    const json = JSON.stringify(intelligentSettings);
    if (json === intelligentDiskJsonRef.current) return;
    const t = window.setTimeout(() => {
      saveIntelligentSettings(intelligentSettings);
      intelligentDiskJsonRef.current = json;
    }, 400);
    return () => window.clearTimeout(t);
  }, [open, panel, intelligentSettings]);

  useEffect(() => {
    if (!browser) return;
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    if (!list.length) return;
    const ok = list.some((p) => p.path === profilePath);
    if (!profilePath || !ok) setProfilePath(list[0].path);
  }, [browser, chromeProfiles, firefoxProfiles, profilePath]);

  useEffect(() => {
    if (!open || !browser) {
      setSourceStatsLine("");
      return;
    }
    const api = getElectronApi();
    if (!api) return;
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    const path = profilePath || list[0]?.path || "";
    if (!path) {
      setSourceStatsLine("No profile folders detected for this browser.");
      return;
    }
    let cancelled = false;
    void api.getImportStats({ browser, profilePath: path }).then((s) => {
      if (!cancelled) setSourceStatsLine(formatImportLine(s));
    });
    return () => {
      cancelled = true;
    };
  }, [open, browser, profilePath, chromeProfiles, firefoxProfiles]);

  useEffect(() => {
    if (open && panel === "intelligent") {
      setModelListFilter("");
      setModelPickerOpen(false);
      /* Always start collapsed (3 + “more”). Do not auto-expand when the active
         theme is outside the preview list — that forced all themes to show. */
      setIntelligentThemeGridExpanded(false);
    }
  }, [open, panel]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const onDoc: EventListener = (ev) => {
      const e = ev as globalThis.MouseEvent;
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [modelPickerOpen]);

  const modelIdsForPicker = useMemo(() => {
    const fromCache = intelligentSettings.cachedModelIds;
    const sel = intelligentSettings.intelligentSelectedModelId.trim();
    if (fromCache.length > 0) {
      if (sel && !fromCache.includes(sel)) return [sel, ...fromCache];
      return fromCache;
    }
    return sel ? [sel] : [];
  }, [
    intelligentSettings.cachedModelIds,
    intelligentSettings.intelligentSelectedModelId,
  ]);

  const filteredModelIds = useMemo(() => {
    const q = modelListFilter.trim().toLowerCase();
    if (!q) return modelIdsForPicker;
    return modelIdsForPicker.filter((id) => id.toLowerCase().includes(q));
  }, [modelIdsForPicker, modelListFilter]);

  const scrollIntelligentSection = useCallback((id: string) => {
    setActiveIntelligentSectionId(id);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    intelligentNavIoSkipUntilRef.current = Date.now() + (reduce ? 80 : 550);
    const target = document.getElementById(id);
    if (!target) return;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const tryScroll = () => {
      const root = intelligentScrollRootRef.current;
      if (root && root.contains(target)) {
        scrollElementIntoSettingsScrollRoot(root, target, behavior);
        return true;
      }
      return false;
    };
    if (!tryScroll()) {
      window.requestAnimationFrame(() => {
        void tryScroll();
      });
    }
  }, []);

  useEffect(() => {
    if (panel !== "intelligent") return;
    if (open) {
      if (intelligentSettingsOpenWasFalseRef.current) {
        setActiveIntelligentSectionId(INTELLIGENT_SETTINGS_SECTIONS[0]?.id ?? null);
      }
      intelligentSettingsOpenWasFalseRef.current = false;
    } else {
      intelligentSettingsOpenWasFalseRef.current = true;
    }
  }, [open, panel]);

  useEffect(() => {
    if (!open || panel !== "intelligent") return;

    let cancelled = false;
    let raf = 0;
    let attachRaf = 0;
    let scheduled = false;
    let attachedRoot: HTMLElement | null = null;

    const run = () => {
      if (cancelled) return;
      if (Date.now() < intelligentNavIoSkipUntilRef.current) return;
      const root = intelligentScrollRootRef.current;
      if (!root) return;
      const id = computeActiveIntelligentSectionId(
        root,
        INTELLIGENT_SETTINGS_SECTIONS,
      );
      if (id) setActiveIntelligentSectionId(id);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    };

    const tryAttach = () => {
      if (cancelled) return;
      const root = intelligentScrollRootRef.current;
      if (!root) {
        attachRaf = requestAnimationFrame(tryAttach);
        return;
      }
      attachedRoot = root;
      root.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      schedule();
    };

    tryAttach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(attachRaf);
      if (attachedRoot) {
        attachedRoot.removeEventListener("scroll", schedule);
        attachedRoot = null;
      }
      window.removeEventListener("resize", schedule);
    };
  }, [open, panel]);

  useLayoutEffect(() => {
    if (!open || panel !== "intelligent" || !activeIntelligentSectionId) return;
    const track = intelligentNavTrackRef.current;
    const idx = INTELLIGENT_SETTINGS_SECTIONS.findIndex(
      (s) => s.id === activeIntelligentSectionId,
    );
    const btn = intelligentNavButtonRefs.current[idx];
    if (!track || !btn) return;
    setIntelligentNavIndicator({
      top: btn.offsetTop,
      height: btn.offsetHeight,
    });
  }, [open, panel, activeIntelligentSectionId]);

  const onIntelligentNavKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const sections = INTELLIGENT_SETTINGS_SECTIONS;
      const last = sections.length - 1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(index + 1, last);
        scrollIntelligentSection(sections[next].id);
        intelligentNavButtonRefs.current[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(index - 1, 0);
        scrollIntelligentSection(sections[prev].id);
        intelligentNavButtonRefs.current[prev]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        scrollIntelligentSection(sections[0].id);
        intelligentNavButtonRefs.current[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        scrollIntelligentSection(sections[last].id);
        intelligentNavButtonRefs.current[last]?.focus();
      }
    },
    [scrollIntelligentSection],
  );

  if (!open) return null;

  const bridge = window.legacyBrowser;
  const api = getElectronApi();

  const saveAssistantSettingsNow = () => {
    saveIntelligentSettings(intelligentSettings);
    intelligentDiskJsonRef.current = JSON.stringify(intelligentSettings);
    bridge?.showToast?.("Assistant settings saved");
  };

  const reloadAssistantSettingsFromDisk = () => {
    if (
      !window.confirm(
        "Reload saved assistant settings from disk? Unsaved changes in this panel (including MCP servers) will be lost.",
      )
    ) {
      return;
    }
    const reloaded = loadIntelligentSettings();
    setIntelligentSettings(reloaded);
    intelligentDiskJsonRef.current = JSON.stringify(reloaded);
    setExpandedMcpServerIds(
      new Set(
        reloaded.mcpServers
          .filter((m) => !mcpServerHasConnectionParams(m))
          .map((m) => m.id),
      ),
    );
    bridge?.showToast?.("Reloaded saved settings");
  };

  const reloadMcpServer = async (id: string) => {
    if (!api) {
      bridge?.showToast?.("MCP reload failed: bridge not ready");
      return;
    }
    setReloadingMcpServerIds((prev) => new Set(prev).add(id));
    try {
      // force disconnect; next list from AI modal or tool use will reconnect.
      const res = await api.mcpExternalDisconnect(id);
      if (res.ok) {
        bridge?.showToast?.("MCP server reload requested");
      } else {
        bridge?.showToast?.(`MCP reload failed: ${res.error ?? "unknown"}`);
      }
    } catch (err) {
      bridge?.showToast?.(
        `MCP reload failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setReloadingMcpServerIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const applyTheme = (name: string) => {
    bridge?.applyTheme?.(name);
    setActiveTheme(name);
  };

  /** Model / provider only — API key typing stays debounced to avoid spamming localStorage + chat reloads. */
  const AI_SETTINGS_IMMEDIATE_PERSIST = new Set([
    "browserSelectedModelId",
    "intelligentSelectedModelId",
    "cachedModelIds",
    "aiProvider",
  ]);

  const updateIntelligentSettings = (
    patch: Partial<IntelligentSettingsState>,
  ) => {
    setIntelligentSettings((prev) => {
      const next = { ...prev, ...patch };
      if (
        Object.keys(patch).some((k) => AI_SETTINGS_IMMEDIATE_PERSIST.has(k))
      ) {
        saveIntelligentSettings(next);
        intelligentDiskJsonRef.current = JSON.stringify(next);
      }
      return next;
    });
  };

  const updateMcp = (id: string, patch: Partial<McpServerConfig>) => {
    setIntelligentSettings((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    }));
    const api = getElectronApi();
    if (api) void api.mcpExternalDisconnect(id);
  };

  const removeMcp = (id: string) => {
    setIntelligentSettings((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.filter((m) => m.id !== id),
    }));
    const api = getElectronApi();
    if (api) void api.mcpExternalDisconnect(id);

    setExpandedMcpServerIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const addMcp = () => {
    const fresh = createEmptyMcpServer();
    setIntelligentSettings((prev) => ({
      ...prev,
      mcpServers: [...prev.mcpServers, fresh],
    }));
    setExpandedMcpServerIds((prev) => new Set(prev).add(fresh.id));
  };

  const toggleMcpServerExpanded = (id: string) => {
    setExpandedMcpServerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMcpServer = (id: string) => {
    saveIntelligentSettings(intelligentSettings);
    intelligentDiskJsonRef.current = JSON.stringify(intelligentSettings);
    const row = intelligentSettings.mcpServers.find((x) => x.id === id);
    const label = row?.name?.trim() || row?.id || "MCP server";
    bridge?.showToast?.(`Saved “${label}”`);
    const api = getElectronApi();
    if (api) void api.mcpExternalDisconnect(id);
    setExpandedMcpServerIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const selectBrowser = (b: "chrome" | "firefox") => {
    setBrowser(b);
    const list = b === "chrome" ? chromeProfiles : firefoxProfiles;
    setProfilePath(list[0]?.path ?? "");
  };

  const startImport = async () => {
    if (!api) return;
    if (!browser) {
      bridge?.showToast?.("Select a browser source");
      return;
    }
    const list = browser === "chrome" ? chromeProfiles : firefoxProfiles;
    const path = profilePath || list[0]?.path;
    if (!path) {
      bridge?.showToast?.(
        "No profile path available — install the browser or pick another source",
      );
      return;
    }
    const dataTypes: Array<
      "bookmarks" | "history" | "cookies" | "passwords" | "autofill"
    > = [];
    if (impBm) dataTypes.push("bookmarks");
    if (impHist) dataTypes.push("history");
    if (impCookies) dataTypes.push("cookies");
    if (impPw) dataTypes.push("passwords");
    if (impAf) dataTypes.push("autofill");
    if (dataTypes.length === 0) {
      bridge?.showToast?.("Select at least one data type");
      return;
    }
    setImportBusy(true);
    setProgress({ show: true, pct: 0, text: "Starting import..." });
    try {
      const result = (await api.importBrowserData({
        browser,
        dataTypes,
        profilePath: path,
      })) as {
        success: boolean;
        error?: string;
        results?: Record<string, number>;
      };
      setProgress({ show: false, pct: 0, text: "" });
      if (result.success && result.results) {
        const r = result.results;
        const n =
          (r.bookmarks ?? 0) +
          (r.history ?? 0) +
          (r.cookies ?? 0) +
          (r.passwords ?? 0) +
          (r.autofill ?? 0);
        bridge?.showToast?.(
          `Imported ${n} items (${Object.entries(r)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")})`,
        );
        void api.getDataStats().then((raw) => setAppStats(raw as AppDataStats));
        const s = await api.getImportStats({ browser, profilePath: path });
        setSourceStatsLine(formatImportLine(s));
      } else {
        throw new Error(result.error || "Import failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bridge?.showToast?.(`Import failed: ${msg}`);
      setProgress({ show: false, pct: 0, text: "" });
    } finally {
      setImportBusy(false);
    }
  };

  const profileList = browser === "chrome" ? chromeProfiles : firefoxProfiles;

  const copyMcpClientSnippet = async () => {
    if (!mcpBridge || !api) return;
    const snippet = JSON.stringify(
      {
        mcpServers: {
          browserServer: {
            command: "node",
            args: [mcpBridge.stdioServerPath],
            env: {
              BUTCHER_MCP_PORT: String(mcpBridge.port),
              BUTCHER_MCP_TOKEN: mcpBridge.token,
            },
          },
          intelligentServer: {
            command: "node",
            args: [mcpBridge.intelligentStdioServerPath],
            env: {
              INTELLIGENT_MCP_PORT: String(mcpBridge.intelligentPort),
              INTELLIGENT_MCP_TOKEN: mcpBridge.intelligentToken,
            },
          },
        },
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(snippet);
      bridge?.showToast?.("MCP config JSON copied");
    } catch {
      bridge?.showToast?.("Copy failed");
    }
  };

  const copyBrowserMcpClientSnippet = async () => {
    if (!mcpBridge || !api) return;
    const snippet = JSON.stringify(
      {
        mcpServers: {
          browserServer: {
            command: "node",
            args: [mcpBridge.stdioServerPath],
            env: {
              BUTCHER_MCP_PORT: String(mcpBridge.port),
              BUTCHER_MCP_TOKEN: mcpBridge.token,
            },
          },
        },
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(snippet);
      bridge?.showToast?.("Browser Server MCP JSON copied");
    } catch {
      bridge?.showToast?.("Copy failed");
    }
  };

  const copyIntelligentMcpClientSnippet = async () => {
    if (!mcpBridge || !api) return;
    const snippet = JSON.stringify(
      {
        mcpServers: {
          intelligentServer: {
            command: "node",
            args: [mcpBridge.intelligentStdioServerPath],
            env: {
              INTELLIGENT_MCP_PORT: String(mcpBridge.intelligentPort),
              INTELLIGENT_MCP_TOKEN: mcpBridge.intelligentToken,
            },
          },
        },
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(snippet);
      bridge?.showToast?.("Intelligent Server MCP JSON copied");
    } catch {
      bridge?.showToast?.("Copy failed");
    }
  };

  const applyMcpPort = async () => {
    if (!api) return;
    const n = Number.parseInt(mcpPortDraft.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      bridge?.showToast?.("Invalid port");
      return;
    }
    const s = await api.mcpBridgeSetPort(n);
    setMcpBridge(s);
    setMcpPortDraft(String(s.port));
    bridge?.showToast?.("Port updated");
  };

  const applyIntelligentMcpPort = async () => {
    if (!api) return;
    const n = Number.parseInt(mcpIntelligentPortDraft.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      bridge?.showToast?.("Invalid intelligent MCP port");
      return;
    }
    const s = await api.mcpIntelligentBridgeSetPort(n);
    setMcpBridge(s);
    setMcpIntelligentPortDraft(String(s.intelligentPort));
    bridge?.showToast?.("Intelligent MCP port updated");
  };

  const portalTarget =
    layout === "workspace"
      ? document.getElementById("settingsWorkspaceRoot")
      : layout === "sidePanel"
        ? document.getElementById("browserSettingsPanelRoot")
        : (document.getElementById("webviewOverlayHost") ?? document.body);

  if (!portalTarget) return null;

  return createPortal(
    <>
      {layout === "modal" ? (
        <div
          className="settings-overlay"
          style={{ display: "block" }}
          onClick={onOverlayClick}
          role="presentation"
        />
      ) : null}
      <div
        className={`settings-panel${
          layout === "workspace"
            ? " settings-panel--workspace"
            : layout === "sidePanel"
              ? " settings-panel--side"
              : layout === "modal" && modalSize === "xl"
                ? " settings-panel--modal-xl"
                : ""
        }`}
        style={{ display: "flex" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <div className="settings-header-text">
            <h3>{panel === "browser" ? "Browser" : "Intelligent"}</h3>
            <p className="settings-header-sub">
              {panel === "browser"
                ? layout === "sidePanel"
                  ? "Theme, import, home page, system info, and shortcuts"
                  : "Import, home page, and shortcuts"
                : "Theme, AI provider, and MCP servers"}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 2L10 10M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="settings-body">
          {panel === "browser" ? (
            <div
              className="settings-dashboard settings-dashboard--browser-only"
              role="region"
              aria-label="Browser settings"
            >
              <div className="settings-card settings-card--import">
                <div className="settings-card-head">
                  <div className="settings-card-title">Import</div>
                  <div className="settings-card-sub">
                    Bring your data from installed browsers
                  </div>
                </div>
                <div className="settings-section">
                  <p className="settings-hint">
                    Pick the browser engine, then the exact profile folder
                    (Chrome can have many). Passwords are imported as metadata
                    where the OS still encrypts secrets.
                  </p>
                  {appStats ? (
                    <div className="settings-import-app-summary">
                      <span className="settings-import-app-title">
                        Already in this app
                      </span>
                      <span className="settings-import-app-counts">
                        {appStats.bookmarks} bookmarks · {appStats.history}{" "}
                        history · {appStats.cookies} cookies ·{" "}
                        {appStats.passwords} passwords · {appStats.autofill}{" "}
                        autofill
                      </span>
                      {appStats.lastImport ? (
                        <span className="settings-import-last">
                          Last import: {appStats.lastImport.browser ?? "?"} ·{" "}
                          {appStats.lastImport.timestamp
                            ? new Date(
                                appStats.lastImport.timestamp,
                              ).toLocaleString()
                            : ""}{" "}
                          ({(appStats.lastImport.dataTypes ?? []).join(", ")})
                        </span>
                      ) : (
                        <span className="settings-import-last muted">
                          No import recorded yet
                        </span>
                      )}
                    </div>
                  ) : null}
                  <div className="settings-browser-pick">
                    <button
                      type="button"
                      className={`settings-browser-card${browser === "chrome" ? " active" : ""}`}
                      onClick={() => selectBrowser("chrome")}
                    >
                      <span className="settings-browser-icon">
                        {chromeLogo}
                      </span>
                      <span className="settings-browser-name">
                        Google Chrome
                      </span>
                      <span className="settings-browser-sub">
                        Chromium profiles on this PC
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`settings-browser-card${browser === "firefox" ? " active" : ""}`}
                      onClick={() => selectBrowser("firefox")}
                    >
                      <span className="settings-browser-icon">
                        {firefoxLogo}
                      </span>
                      <span className="settings-browser-name">
                        Mozilla Firefox
                      </span>
                      <span className="settings-browser-sub">
                        Firefox profile folders
                      </span>
                    </button>
                  </div>
                  {browser ? (
                    <>
                      <label
                        className="settings-label settings-label-mt"
                        htmlFor="profileSelectReact"
                      >
                        Profile folder
                      </label>
                      <select
                        id="profileSelectReact"
                        className="settings-select"
                        value={profilePath || profileList[0]?.path || ""}
                        onChange={(e) => setProfilePath(e.target.value)}
                      >
                        {profileList.length === 0 ? (
                          <option value="">No profiles found</option>
                        ) : (
                          profileList.map((p) => (
                            <option key={p.path} value={p.path}>
                              {p.label}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="import-options settings-import-options-grid">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={impBm}
                            onChange={(e) => setImpBm(e.target.checked)}
                          />
                          <span>Bookmarks</span>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={impHist}
                            onChange={(e) => setImpHist(e.target.checked)}
                          />
                          <span>History</span>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={impCookies}
                            onChange={(e) => setImpCookies(e.target.checked)}
                          />
                          <span>Cookies</span>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={impPw}
                            onChange={(e) => setImpPw(e.target.checked)}
                          />
                          <span>Passwords</span>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={impAf}
                            onChange={(e) => setImpAf(e.target.checked)}
                          />
                          <span>Autofill</span>
                        </label>
                      </div>
                      <div className="settings-source-stats">
                        {sourceStatsLine}
                      </div>
                      <div className="import-actions">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={
                            !browser || importBusy || profileList.length === 0
                          }
                          onClick={() => void startImport()}
                        >
                          Import selected data
                        </button>
                      </div>
                    </>
                  ) : null}
                  <div
                    className="import-progress"
                    style={{ display: progress.show ? "block" : "none" }}
                  >
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <div className="progress-text">{progress.text}</div>
                  </div>
                </div>
              </div>

              <div className="settings-card settings-card--home">
                <div className="settings-card-head">
                  <div className="settings-card-title">Home</div>
                  <div className="settings-card-sub">Start page URL</div>
                </div>
                <div className="settings-section">
                  <label
                    className="settings-label"
                    htmlFor="homePageInputReact"
                  >
                    Home Page
                  </label>
                  <input
                    id="homePageInputReact"
                    type="text"
                    className="settings-input"
                    placeholder="https://duckduckgo.com"
                    value={homePage}
                    onChange={(e) => setHomePage(e.target.value)}
                    onBlur={() => bridge?.setHomePage?.(homePage.trim())}
                  />
                </div>
              </div>

              <div className="settings-card settings-card--system">
                <div className="settings-card-head">
                  <div className="settings-card-title">System</div>
                  <div className="settings-card-sub">Runtime details</div>
                </div>
                <div className="settings-section">
                  <div className="sysinfo-grid">
                    <div className="sysinfo-item">
                      <span className="si-label">Electron</span>
                      <span className="si-val">{sys?.version ?? "—"}</span>
                    </div>
                    <div className="sysinfo-item">
                      <span className="si-label">Chrome</span>
                      <span className="si-val">{sys?.chrome ?? "—"}</span>
                    </div>
                    <div className="sysinfo-item">
                      <span className="si-label">Node</span>
                      <span className="si-val">{sys?.node ?? "—"}</span>
                    </div>
                    <div className="sysinfo-item">
                      <span className="si-label">Memory</span>
                      <span className="si-val">{sys?.memory ?? "—"}</span>
                    </div>
                    <div className="sysinfo-item">
                      <span className="si-label">Platform</span>
                      <span className="si-val">{sys?.platform ?? "—"}</span>
                    </div>
                    <div className="sysinfo-item">
                      <span className="si-label">CPUs</span>
                      <span className="si-val">{sys?.cpus ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-card settings-card--shortcuts">
                <div className="settings-card-head">
                  <div className="settings-card-title">Shortcuts</div>
                  <div className="settings-card-sub">Keyboard controls</div>
                </div>
                <div className="settings-section">
                  <div className="shortcuts-list">
                    <div className="shortcut-row">
                      <kbd>Ctrl+T</kbd>
                      <span>New Tab</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+W</kbd>
                      <span>Close Tab</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+L</kbd>
                      <span>Focus Address Bar</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+F</kbd>
                      <span>Find in Page</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+R / F5</kbd>
                      <span>Reload</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+Shift+S</kbd>
                      <span>Screenshot</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+= / Ctrl+-</kbd>
                      <span>Zoom In/Out</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Ctrl+0</kbd>
                      <span>Reset Zoom</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>F12</kbd>
                      <span>DevTools</span>
                    </div>
                    <div className="shortcut-row">
                      <kbd>Alt+Left / Alt+Right</kbd>
                      <span>Back / Forward</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={intelligentScrollRootRef}
              className="settings-dashboard settings-dashboard--intelligent-suite settings-dashboard--intelligent-suite-with-nav"
              role="region"
              aria-label="Intelligent workspace settings"
            >
              <nav
                className="settings-intelligent-nav settings-intelligent-nav--icons"
                aria-label="Workspace settings sections"
              >
                <div
                  className="settings-intelligent-nav__track"
                  ref={intelligentNavTrackRef}
                >
                  <div
                    className="settings-intelligent-nav__indicator"
                    aria-hidden
                    style={{
                      transform: `translateY(${intelligentNavIndicator.top}px)`,
                      height:
                        intelligentNavIndicator.height > 0
                          ? intelligentNavIndicator.height
                          : undefined,
                    }}
                  />
                  {INTELLIGENT_SETTINGS_SECTIONS.map((s, i) => (
                    <button
                      key={s.id}
                      ref={(el) => {
                        intelligentNavButtonRefs.current[i] = el;
                      }}
                      type="button"
                      className={`settings-intelligent-nav__btn${
                        activeIntelligentSectionId === s.id ||
                        (activeIntelligentSectionId === null && i === 0)
                          ? " settings-intelligent-nav__btn--active"
                          : ""
                      }`}
                      aria-current={
                        activeIntelligentSectionId === s.id ||
                        (activeIntelligentSectionId === null && i === 0)
                          ? "true"
                          : undefined
                      }
                      aria-label={s.label}
                      aria-description={s.hint}
                      tabIndex={
                        activeIntelligentSectionId === s.id ||
                        (activeIntelligentSectionId === null && i === 0)
                          ? 0
                          : -1
                      }
                      onClick={() => scrollIntelligentSection(s.id)}
                      onKeyDown={(e) => onIntelligentNavKeyDown(e, i)}
                    >
                      <span className="settings-intelligent-nav__btn-icon">
                        <IntelligentSettingsNavIcon kind={s.icon} />
                      </span>
                    </button>
                  ))}
                </div>
              </nav>
              <div className="settings-intelligent-nav-content">
              <div
                className="settings-card settings-card--appearance settings-intelligent-section-anchor"
                id="iw-settings-appearance"
              >
                <div className="settings-card-head">
                  <div className="settings-card-title">Appearance</div>
                  <div className="settings-card-sub">Theme presets</div>
                </div>
                <div className="settings-section">
                  <label className="settings-label">Theme</label>
                  {!intelligentThemeGridExpanded ? (
                    <div className="theme-grid theme-grid--intelligent-settings theme-grid--intelligent-settings--collapsed">
                      {INTELLIGENT_THEME_PREVIEW_LIST.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`theme-card${
                            activeTheme === t ? " active" : ""
                          }`}
                          data-theme={t}
                          onClick={() => applyTheme(t)}
                        >
                          <div className={`theme-preview ${t}-preview`} />
                          <span>{intelligentThemeDisplayName(t)}</span>
                        </button>
                      ))}
                      {INTELLIGENT_THEME_REST_LIST.length > 0 ? (
                        <button
                          type="button"
                          className="theme-card theme-card--more"
                          onClick={() => setIntelligentThemeGridExpanded(true)}
                          aria-expanded="false"
                          aria-controls="intelligent-theme-grid-expanded"
                          id="intelligent-theme-grid-expand"
                        >
                          <span className="theme-card__more-glyph" aria-hidden>
                            +
                          </span>
                          <span className="theme-card__more-label">
                            {INTELLIGENT_THEME_REST_LIST.length} more
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      id="intelligent-theme-grid-expanded"
                      className="theme-grid theme-grid--intelligent-settings theme-grid--intelligent-settings--expanded"
                      role="region"
                      aria-label="All theme presets"
                    >
                      {INTELLIGENT_THEME_IDS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`theme-card${
                            activeTheme === t ? " active" : ""
                          }`}
                          data-theme={t}
                          onClick={() => applyTheme(t)}
                        >
                          <div className={`theme-preview ${t}-preview`} />
                          <span>{intelligentThemeDisplayName(t)}</span>
                        </button>
                      ))}
                      {INTELLIGENT_THEME_PREVIEW_LIST.includes(
                        activeTheme as (typeof INTELLIGENT_THEME_IDS)[number],
                      ) ? (
                        <button
                          type="button"
                          className="theme-grid__collapse"
                          onClick={() => setIntelligentThemeGridExpanded(false)}
                        >
                          Show fewer themes
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="settings-card settings-card--intelligent-ai settings-intelligent-section-anchor"
                id="iw-settings-ai"
              >
                <div className="settings-card-head">
                  <div className="settings-card-title">AI</div>
                  <div className="settings-card-sub">Provider and API keys</div>
                </div>
                <div className="settings-section">
                  <p className="settings-hint settings-hint--compact">
                    Keys are stored only on this device in local storage.
                  </p>
                  <label
                    className="settings-label settings-label-mt"
                    htmlFor="aiProviderSelectReact"
                  >
                    Provider
                  </label>
                  <select
                    id="aiProviderSelectReact"
                    className="settings-input"
                    value={intelligentSettings.aiProvider}
                    onChange={(e) =>
                      updateIntelligentSettings({
                        aiProvider: parseAiProvider(e.target.value),
                      })
                    }
                  >
                    {AI_PROVIDER_SELECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="settings-hint settings-hint--compact">
                    {
                      AI_PROVIDER_SELECT_OPTIONS.find(
                        (o) => o.value === intelligentSettings.aiProvider,
                      )?.description
                    }
                  </p>
                  {intelligentSettings.aiProvider === "google" ? (
                    <>
                      <label
                        className="settings-label settings-label-mt"
                        htmlFor="googleApiKeyReact"
                      >
                        API key
                      </label>
                      <input
                        ref={googleApiKeyInputRef}
                        id="googleApiKeyReact"
                        type="password"
                        className="settings-input"
                        autoComplete="off"
                        placeholder="AIza…"
                        value={intelligentSettings.googleApiKey}
                        onChange={(e) =>
                          updateIntelligentSettings({
                            googleApiKey: e.target.value,
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      {intelligentSettings.aiProvider === "custom" ? (
                        <>
                          <label
                            className="settings-label settings-label-mt"
                            htmlFor="customBaseUrlReact"
                          >
                            Base URL (optional)
                          </label>
                          <input
                            ref={customBaseUrlInputRef}
                            id="customBaseUrlReact"
                            type="url"
                            className="settings-input"
                            placeholder="https://api.openai.com/v1"
                            value={intelligentSettings.customBaseUrl}
                            onChange={(e) =>
                              updateIntelligentSettings({
                                customBaseUrl: e.target.value.trim(),
                              })
                            }
                          />
                        </>
                      ) : (
                        <p className="settings-hint settings-hint--compact settings-label-mt">
                          Chat endpoint:{" "}
                          <code className="settings-code-inline">
                            {resolveOpenAiCompatibleBaseUrl(
                              intelligentSettings.aiProvider,
                              intelligentSettings.customBaseUrl,
                            )}
                            /v1/chat/completions
                          </code>
                        </p>
                      )}
                      <label
                        className="settings-label settings-label-mt"
                        htmlFor="customApiKeyReact"
                      >
                        API key
                      </label>
                      <input
                        ref={customApiKeyInputRef}
                        id="customApiKeyReact"
                        type="password"
                        className="settings-input"
                        autoComplete="off"
                        placeholder="sk-…"
                        value={intelligentSettings.customApiKey}
                        onChange={(e) =>
                          updateIntelligentSettings({
                            customApiKey: e.target.value,
                          })
                        }
                      />
                      {intelligentSettings.aiProvider === "custom" ? (
                        <>
                          <label
                            className="settings-label settings-label-mt"
                            htmlFor="customTlsCaPemReact"
                          >
                            Custom TLS CA (PEM, optional)
                          </label>
                          <p className="settings-hint settings-hint--compact">
                            For private or corporate HTTPS (self‑signed or internal
                            CA). Pasted certificate is trusted in addition to the
                            system store; stored only on this device.
                          </p>
                          <textarea
                            id="customTlsCaPemReact"
                            className="settings-textarea settings-textarea--mono"
                            rows={5}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder={
                              "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                            }
                            value={intelligentSettings.customTlsCaPem}
                            onChange={(e) =>
                              updateIntelligentSettings({
                                customTlsCaPem: e.target.value,
                              })
                            }
                          />
                        </>
                      ) : null}
                    </>
                  )}
                  <label className="settings-label settings-label-mt">
                    Model
                  </label>
                  <p className="settings-hint settings-hint--compact settings-model-picker-intro">
                    Applies to the <strong>AI Assistant</strong> workspace. The{" "}
                    <strong>Browser agent</strong> keeps a separate model in its
                    chat toolbar.
                  </p>
                  <p className="settings-hint settings-hint--compact">
                    Use the dropdown to search loaded models, or set the ID
                    manually below.
                  </p>
                  <div className="settings-model-actions">
                    <button
                      type="button"
                      className="btn-secondary btn-secondary--compact"
                      disabled={modelsLoading}
                      onClick={() => {
                        void (async () => {
                          setModelsLoading(true);
                          setAiModelActionFeedback(null);
                          try {
                            const googleKey =
                              googleApiKeyInputRef.current?.value?.trim() ||
                              intelligentSettings.googleApiKey.trim();
                            const customKey =
                              customApiKeyInputRef.current?.value?.trim() ||
                              intelligentSettings.customApiKey.trim();
                            const customBase =
                              customBaseUrlInputRef.current?.value?.trim() ||
                              intelligentSettings.customBaseUrl.trim();
                            let ids: string[];
                            if (intelligentSettings.aiProvider === "google") {
                              ids = (await listGoogleModels(googleKey)).map(
                                (m) => m.id,
                              );
                            } else {
                              const listBase = resolveOpenAiCompatibleBaseUrl(
                                intelligentSettings.aiProvider,
                                customBase,
                              );
                              ids = (
                                await listOpenAiCompatibleModels(
                                  listBase,
                                  customKey,
                                  intelligentSettings.aiProvider === "custom"
                                    ? intelligentSettings.customTlsCaPem.trim() ||
                                      undefined
                                    : undefined,
                                )
                              ).map((m) => m.id);
                            }
                            updateIntelligentSettings({
                              googleApiKey: googleKey,
                              customApiKey: customKey,
                              customBaseUrl: customBase,
                              cachedModelIds: ids,
                              intelligentSelectedModelId:
                                intelligentSettings.intelligentSelectedModelId ||
                                ids[0] ||
                                "",
                            });
                            notifyAiModelAction(`Loaded ${ids.length} models.`);
                          } catch (e) {
                            notifyAiModelAction(
                              e instanceof Error ? e.message : String(e),
                            );
                          } finally {
                            setModelsLoading(false);
                          }
                        })();
                      }}
                    >
                      {modelsLoading ? "Loading…" : "Load models"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-secondary--compact"
                      disabled={
                        modelTestBusy ||
                        !intelligentSettings.intelligentSelectedModelId.trim()
                      }
                      onClick={() => {
                        void (async () => {
                          setModelTestBusy(true);
                          setAiModelActionFeedback(null);
                          try {
                            const googleKey =
                              googleApiKeyInputRef.current?.value?.trim() ||
                              intelligentSettings.googleApiKey.trim();
                            const customKey =
                              customApiKeyInputRef.current?.value?.trim() ||
                              intelligentSettings.customApiKey.trim();
                            const customBase =
                              customBaseUrlInputRef.current?.value?.trim() ||
                              intelligentSettings.customBaseUrl.trim();
                            const modelId =
                              intelligentSettings.intelligentSelectedModelId.trim();
                            if (!modelId) {
                              notifyAiModelAction(
                                "Choose a model from the list or enter a model ID below.",
                              );
                              return;
                            }
                            const r = await testChatHi(
                              intelligentSettings.aiProvider,
                              {
                                googleApiKey: googleKey,
                                customBaseUrl: customBase,
                                customApiKey: customKey,
                                modelId,
                                ...(intelligentSettings.aiProvider === "custom" &&
                                intelligentSettings.customTlsCaPem.trim()
                                  ? {
                                      tlsCaPem: intelligentSettings.customTlsCaPem,
                                    }
                                  : {}),
                              },
                            );
                            notifyAiModelAction(
                              `Test reply: ${r.reply.slice(0, 200)}${r.reply.length > 200 ? "…" : ""}`,
                            );
                          } catch (e) {
                            notifyAiModelAction(
                              e instanceof Error ? e.message : String(e),
                            );
                          } finally {
                            setModelTestBusy(false);
                          }
                        })();
                      }}
                    >
                      {modelTestBusy ? "Testing…" : "Test (hi)"}
                    </button>
                  </div>
                  <div className="settings-model-picker">
                    <div
                      className="settings-model-dropdown"
                      ref={modelDropdownRef}
                    >
                      <button
                        type="button"
                        className="settings-model-dropdown__trigger"
                        aria-expanded={modelPickerOpen}
                        aria-haspopup="listbox"
                        disabled={modelIdsForPicker.length === 0}
                        onClick={() => {
                          if (modelIdsForPicker.length === 0) return;
                          setModelPickerOpen((v) => !v);
                        }}
                      >
                        <span className="settings-model-dropdown__value">
                          {intelligentSettings.intelligentSelectedModelId.trim() ||
                            (modelIdsForPicker.length === 0
                              ? "Load models to enable picker…"
                              : "Choose model…")}
                        </span>
                        <span
                          className="settings-model-dropdown__caret"
                          aria-hidden
                        >
                          ▾
                        </span>
                      </button>
                      {modelPickerOpen && modelIdsForPicker.length > 0 ? (
                        <div className="settings-model-dropdown__menu">
                          <input
                            type="search"
                            className="settings-input settings-model-dropdown__search"
                            placeholder="Search models…"
                            aria-label="Search models"
                            value={modelListFilter}
                            onChange={(e) => setModelListFilter(e.target.value)}
                            autoComplete="off"
                            autoFocus
                          />
                          <div
                            className="settings-model-dropdown__list"
                            role="listbox"
                            aria-label="Models"
                          >
                            {filteredModelIds.length === 0 ? (
                              <p className="settings-model-dropdown__empty">
                                No matches.
                              </p>
                            ) : (
                              filteredModelIds.map((id, idx) => {
                                const active =
                                  id === intelligentSettings.intelligentSelectedModelId;
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    id={`settings-model-opt-${idx}`}
                                    role="option"
                                    aria-selected={active}
                                    className={`settings-model-dropdown__opt${active ? " settings-model-dropdown__opt--active" : ""}`}
                                    onClick={() => {
                                      updateIntelligentSettings({
                                        intelligentSelectedModelId: id,
                                      });
                                      setModelPickerOpen(false);
                                      setModelListFilter("");
                                    }}
                                  >
                                    <span
                                      className="settings-model-dropdown__check"
                                      aria-hidden
                                    >
                                      {active ? "✓" : ""}
                                    </span>
                                    <span className="settings-model-dropdown__id">
                                      {id}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {modelIdsForPicker.length === 0 ? (
                      <p className="settings-muted settings-hint--compact settings-model-picker__empty-hint">
                        No list yet — use <strong>Load models</strong>, or enter
                        an ID below.
                      </p>
                    ) : null}
                    <label
                      className="settings-label settings-label-mt settings-model-picker__manual-label"
                      htmlFor="modelManualIdReact"
                    >
                      Model ID (manual)
                    </label>
                    <input
                      id="modelManualIdReact"
                      type="text"
                      className="settings-input settings-input--mono"
                      placeholder="e.g. gemini-2.0-flash, gpt-4o-mini"
                      value={intelligentSettings.intelligentSelectedModelId}
                      onChange={(e) =>
                        updateIntelligentSettings({
                          intelligentSelectedModelId: e.target.value,
                        })
                      }
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  {aiModelActionFeedback ? (
                    <p
                      className="settings-hint settings-hint--compact"
                      role="status"
                    >
                      {aiModelActionFeedback}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                className="settings-card settings-card--butcher-mcp settings-intelligent-section-anchor"
                id="iw-settings-mcp-browser-bridge"
              >
                <div className="settings-card-head">
                  <div className="settings-card-title">Browser Server MCP bridge</div>
                  <div className="settings-card-sub">Browser Server on dedicated port/token</div>
                </div>
                <div className="settings-section">
                  {mcpBridge ? (
                    <>
                      <label className="settings-label settings-label-mt" htmlFor="mcpBridgeToggle">
                        Bridge runtime (both built-in servers)
                      </label>
                      <label className="checkbox-label" htmlFor="mcpBridgeToggle">
                        <input
                          id="mcpBridgeToggle"
                          type="checkbox"
                          checked={mcpBridge.enabled}
                          onChange={async (e) => {
                            if (!api) return;
                            const s = await api.mcpBridgeSetEnabled(e.target.checked);
                            setMcpBridge(s);
                          }}
                        />
                        <span>
                          Browser bridge on 127.0.0.1 —{" "}
                          {mcpBridge.listeningPort != null
                            ? `active (port ${mcpBridge.listeningPort})`
                            : mcpBridge.enabled
                              ? "starting…"
                              : "off"}
                        </span>
                      </label>
                      <label className="settings-label settings-label-mt" htmlFor="mcpPortDraft">
                        Browser server port
                      </label>
                      <div className="settings-ai-provider" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          id="mcpPortDraft"
                          type="number"
                          min={1}
                          max={65535}
                          className="settings-input"
                          style={{ maxWidth: 120 }}
                          value={mcpPortDraft}
                          onChange={(e) => setMcpPortDraft(e.target.value)}
                        />
                        <button type="button" className="btn-secondary btn-secondary--compact" onClick={() => void applyMcpPort()}>
                          Apply
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt" htmlFor="mcpTokenDisplay">
                        Browser token
                      </label>
                      <div className="settings-ai-provider" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          id="mcpTokenDisplay"
                          type="text"
                          readOnly
                          className="settings-input settings-input--mono"
                          value={mcpBridge.token}
                          style={{ flex: 1, minWidth: 200 }}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-secondary--compact"
                          onClick={async () => {
                            if (!api) return;
                            const s = await api.mcpBridgeRegenerateToken();
                            setMcpBridge(s);
                            bridge?.showToast?.("New token saved — update Browser MCP env");
                          }}
                        >
                          Regenerate
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt" htmlFor="mcpStdioPath">
                        Browser stdio script path
                      </label>
                      <input
                        id="mcpStdioPath"
                        type="text"
                        readOnly
                        className="settings-input settings-input--mono"
                        value={mcpBridge.stdioServerPath}
                      />
                      <div className="import-actions" style={{ marginTop: 12 }}>
                        <button type="button" className="btn-primary" onClick={() => void copyBrowserMcpClientSnippet()}>
                          Copy Browser MCP JSON
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt">Browser Server tools</label>
                      <ul className="settings-mcp-tool-list" aria-label="Browser Server MCP tool names">
                        {MCP_BROWSER_TOOL_NAMES.map((name) => (
                          <li key={name}>
                            <code className="settings-code-inline">{name}</code>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="settings-muted">Loading bridge…</p>
                  )}
                </div>
              </div>

              <div
                className="settings-card settings-card--butcher-mcp settings-intelligent-section-anchor"
                id="iw-settings-mcp-intelligent-bridge"
              >
                <div className="settings-card-head">
                  <div className="settings-card-title">Intelligent Server MCP bridge</div>
                  <div className="settings-card-sub">Intelligent Server on dedicated port/token</div>
                </div>
                <div className="settings-section">
                  {mcpBridge ? (
                    <>
                      <p className="settings-hint settings-hint--compact">
                        Intelligent bridge on 127.0.0.1 —{" "}
                        {mcpBridge.intelligentListeningPort != null
                          ? `active (port ${mcpBridge.intelligentListeningPort})`
                          : mcpBridge.enabled
                            ? "starting…"
                            : "off"}
                      </p>
                      <label className="settings-label settings-label-mt" htmlFor="mcpIntelligentPortDraft">
                        Intelligent server port
                      </label>
                      <div className="settings-ai-provider" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          id="mcpIntelligentPortDraft"
                          type="number"
                          min={1}
                          max={65535}
                          className="settings-input"
                          style={{ maxWidth: 120 }}
                          value={mcpIntelligentPortDraft}
                          onChange={(e) => setMcpIntelligentPortDraft(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-secondary--compact"
                          onClick={() => void applyIntelligentMcpPort()}
                        >
                          Apply
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt" htmlFor="mcpIntelligentTokenDisplay">
                        Intelligent token
                      </label>
                      <div className="settings-ai-provider" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          id="mcpIntelligentTokenDisplay"
                          type="text"
                          readOnly
                          className="settings-input settings-input--mono"
                          value={mcpBridge.intelligentToken}
                          style={{ flex: 1, minWidth: 200 }}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-secondary--compact"
                          onClick={async () => {
                            if (!api) return;
                            const s = await api.mcpIntelligentBridgeRegenerateToken();
                            setMcpBridge(s);
                            bridge?.showToast?.("New intelligent token saved — update MCP env");
                          }}
                        >
                          Regenerate
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt" htmlFor="mcpIntelligentStdioPath">
                        Intelligent stdio script path
                      </label>
                      <input
                        id="mcpIntelligentStdioPath"
                        type="text"
                        readOnly
                        className="settings-input settings-input--mono"
                        value={mcpBridge.intelligentStdioServerPath}
                      />
                      <div className="import-actions" style={{ marginTop: 12, gap: 8 }}>
                        <button type="button" className="btn-primary" onClick={() => void copyIntelligentMcpClientSnippet()}>
                          Copy Intelligent MCP JSON
                        </button>
                        <button type="button" className="btn-secondary btn-secondary--compact" onClick={() => void copyMcpClientSnippet()}>
                          Copy Both MCP JSON
                        </button>
                      </div>
                      <label className="settings-label settings-label-mt">Intelligent Server tools</label>
                      <ul className="settings-mcp-tool-list" aria-label="Intelligent server tool names">
                        {MCP_INTELLIGENT_TOOL_NAMES.map((name) => (
                          <li key={name}>
                            <code className="settings-code-inline">{name}</code>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="settings-muted">Loading bridge…</p>
                  )}
                </div>
              </div>

              <div
                className="settings-card settings-card--mcp settings-intelligent-section-anchor"
                id="iw-settings-mcp-tools"
              >
                <div className="settings-card-head">
                  <div className="settings-card-title">MCP tools</div>
                  <div className="settings-card-sub">
                    Model Context Protocol: local stdio servers or remote HTTP
                    (Streamable HTTP / SSE)
                  </div>
                </div>
                <div className="settings-section">
                  <div className="settings-subsection-head settings-subsection-head--mcp">
                    <p
                      className="settings-hint settings-hint--compact"
                      style={{ margin: 0, flex: "1 1 220px" }}
                    >
                      Local: <code className="settings-code-inline">args</code>{" "}
                      / <code className="settings-code-inline">env</code> as
                      JSON. Remote: optional{" "}
                      <code className="settings-code-inline">headers</code>{" "}
                      JSON; requests run from the app (use HTTPS).
                    </p>
                    <div
                      className="settings-mcp-config-actions"
                      role="group"
                      aria-label="MCP server list"
                    >
                      <button
                        type="button"
                        className="btn-secondary btn-secondary--compact"
                        onClick={addMcp}
                      >
                        Add server
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-secondary--compact"
                        onClick={saveAssistantSettingsNow}
                      >
                        Save now
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-secondary--compact"
                        onClick={reloadAssistantSettingsFromDisk}
                      >
                        Reload saved
                      </button>
                    </div>
                  </div>
                  <p className="settings-muted settings-mcp-autosave-hint">
                    Each row can be expanded to edit;{" "}
                    <strong>Save server</strong> writes that MCP to disk and
                    collapses it. Global <strong>Save now</strong> /{" "}
                    <strong>Reload saved</strong> still apply to all assistant
                    settings.
                  </p>
                  <div className="settings-butcher-builtin">
                    <div className="settings-butcher-builtin-title">
                      Browser Server (this app)
                    </div>
                    <p className="settings-hint settings-hint--compact">
                      Built-in browser automation tools (in-process). Toggle per
                      workspace for the AI assistant.
                    </p>
                    <div className="settings-butcher-builtin-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            intelligentSettings.mcpTogglesBrowser
                              .connectionEnabled[BUTCHER_BUILTIN_MCP_ID] !==
                            false
                          }
                          onChange={(e) =>
                            updateIntelligentSettings({
                              mcpTogglesBrowser: {
                                ...intelligentSettings.mcpTogglesBrowser,
                                connectionEnabled: {
                                  ...intelligentSettings.mcpTogglesBrowser
                                    .connectionEnabled,
                                  [BUTCHER_BUILTIN_MCP_ID]: e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        <span>Enabled in Browser workspace</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            intelligentSettings.mcpTogglesIntelligent
                              .connectionEnabled[BUTCHER_BUILTIN_MCP_ID] !==
                            false
                          }
                          onChange={(e) =>
                            updateIntelligentSettings({
                              mcpTogglesIntelligent: {
                                ...intelligentSettings.mcpTogglesIntelligent,
                                connectionEnabled: {
                                  ...intelligentSettings.mcpTogglesIntelligent
                                    .connectionEnabled,
                                  [BUTCHER_BUILTIN_MCP_ID]: e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        <span>Enabled in Intelligent workspace</span>
                      </label>
                    </div>
                  </div>
                  <div className="settings-butcher-builtin">
                    <div className="settings-butcher-builtin-title">
                      Intelligent Server (this app)
                    </div>
                    <p className="settings-hint settings-hint--compact">
                      Built-in intelligent tools (in-process). Toggle per
                      workspace for the AI assistant.
                    </p>
                    <div className="settings-butcher-builtin-row">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            intelligentSettings.mcpTogglesBrowser
                              .connectionEnabled[INTELLIGENT_BUILTIN_MCP_ID] !==
                            false
                          }
                          onChange={(e) =>
                            updateIntelligentSettings({
                              mcpTogglesBrowser: {
                                ...intelligentSettings.mcpTogglesBrowser,
                                connectionEnabled: {
                                  ...intelligentSettings.mcpTogglesBrowser
                                    .connectionEnabled,
                                  [INTELLIGENT_BUILTIN_MCP_ID]:
                                    e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        <span>Enabled in Browser workspace</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={
                            intelligentSettings.mcpTogglesIntelligent
                              .connectionEnabled[INTELLIGENT_BUILTIN_MCP_ID] !==
                            false
                          }
                          onChange={(e) =>
                            updateIntelligentSettings({
                              mcpTogglesIntelligent: {
                                ...intelligentSettings.mcpTogglesIntelligent,
                                connectionEnabled: {
                                  ...intelligentSettings.mcpTogglesIntelligent
                                    .connectionEnabled,
                                  [INTELLIGENT_BUILTIN_MCP_ID]:
                                    e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        <span>Enabled in Intelligent workspace</span>
                      </label>
                    </div>
                  </div>
                  {intelligentSettings.mcpServers.length === 0 ? (
                    <p className="settings-muted">No MCP servers configured.</p>
                  ) : (
                    <ul className="mcp-server-list">
                      {intelligentSettings.mcpServers.map((m) => {
                        const expanded = expandedMcpServerIds.has(m.id);
                        const modeLabel =
                          m.serverMode === "remote" ? "Remote" : "Stdio";
                        return (
                          <li key={m.id} className="mcp-server-card">
                            <div
                              className={`mcp-server-card__summary${expanded ? " mcp-server-card__summary--open" : ""}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleMcpServerExpanded(m.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleMcpServerExpanded(m.id);
                                }
                              }}
                            >
                              <div className="mcp-server-card__summary-text">
                                <div className="mcp-server-card__summary-top">
                                  <span className="mcp-server-card__summary-name">
                                    {m.name.trim() || "Untitled server"}
                                  </span>
                                  <span className="mcp-server-card__summary-badge">
                                    {modeLabel}
                                  </span>
                                </div>
                                <p className="mcp-server-card__summary-meta">
                                  {mcpServerSubtitle(m)}
                                </p>
                              </div>
                              <div className="mcp-server-card__summary-toolbar">
                                <button
                                  type="button"
                                  className="btn-icon btn-icon-secondary"
                                  aria-label={`Reload ${m.name || "MCP server"}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await reloadMcpServer(m.id);
                                  }}
                                >
                                  {reloadingMcpServerIds.has(m.id) ? (
                                    <span className="spinner" aria-hidden />
                                  ) : (
                                    <IconRefresh />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="btn-icon btn-icon-danger"
                                  aria-label={`Delete ${m.name || "MCP server"}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeMcp(m.id);
                                  }}
                                >
                                  <IconTrash />
                                </button>
                                <span
                                  className="mcp-server-card__summary-chevron"
                                  aria-hidden
                                />
                              </div>
                            </div>
                            {expanded ? (
                              <div className="mcp-server-card__body">
                                <label
                                  className="settings-label"
                                  htmlFor={`mcp-label-${m.id}`}
                                >
                                  Display name
                                </label>
                                <input
                                  id={`mcp-label-${m.id}`}
                                  type="text"
                                  className="settings-input"
                                  placeholder="Label"
                                  aria-label="MCP label"
                                  value={m.name}
                                  onChange={(e) =>
                                    updateMcp(m.id, { name: e.target.value })
                                  }
                                />
                                <label
                                  className="settings-label"
                                  htmlFor={`mcp-mode-${m.id}`}
                                >
                                  Connection type
                                </label>
                                <select
                                  id={`mcp-mode-${m.id}`}
                                  className="settings-input"
                                  value={m.serverMode}
                                  onChange={(e) =>
                                    updateMcp(m.id, {
                                      serverMode:
                                        e.target.value === "remote"
                                          ? "remote"
                                          : "stdio",
                                    })
                                  }
                                >
                                  <option value="stdio">
                                    Local command (stdio)
                                  </option>
                                  <option value="remote">
                                    Remote URL (HTTP)
                                  </option>
                                </select>
                                {m.serverMode === "remote" ? (
                                  <>
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-url-${m.id}`}
                                    >
                                      MCP URL
                                    </label>
                                    <input
                                      id={`mcp-url-${m.id}`}
                                      type="url"
                                      className="settings-input settings-input--mono"
                                      placeholder="https://host.example/mcp"
                                      value={m.url}
                                      onChange={(e) =>
                                        updateMcp(m.id, { url: e.target.value })
                                      }
                                    />
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-headers-${m.id}`}
                                    >
                                      Headers (JSON object)
                                    </label>
                                    <textarea
                                      id={`mcp-headers-${m.id}`}
                                      className="settings-textarea settings-textarea--mono"
                                      rows={2}
                                      placeholder='{"Authorization":"Bearer …"}'
                                      value={m.headers}
                                      onChange={(e) =>
                                        updateMcp(m.id, {
                                          headers: e.target.value,
                                        })
                                      }
                                    />
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-rt-${m.id}`}
                                    >
                                      Remote transport
                                    </label>
                                    <select
                                      id={`mcp-rt-${m.id}`}
                                      className="settings-input"
                                      value={m.remoteTransport}
                                      onChange={(e) =>
                                        updateMcp(m.id, {
                                          remoteTransport: e.target
                                            .value as McpRemoteTransport,
                                        })
                                      }
                                    >
                                      <option value="auto">
                                        Auto (Streamable HTTP, then SSE)
                                      </option>
                                      <option value="streamableHttp">
                                        Streamable HTTP
                                      </option>
                                      <option value="sse">SSE (legacy)</option>
                                    </select>
                                  </>
                                ) : (
                                  <>
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-cmd-${m.id}`}
                                    >
                                      Command
                                    </label>
                                    <input
                                      id={`mcp-cmd-${m.id}`}
                                      type="text"
                                      className="settings-input settings-input--mono"
                                      placeholder="npx"
                                      value={m.command}
                                      onChange={(e) =>
                                        updateMcp(m.id, {
                                          command: e.target.value,
                                        })
                                      }
                                    />
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-args-${m.id}`}
                                    >
                                      Args (JSON array)
                                    </label>
                                    <textarea
                                      id={`mcp-args-${m.id}`}
                                      className="settings-textarea settings-textarea--mono"
                                      rows={2}
                                      placeholder='["-y", "@modelcontextprotocol/server-example"]'
                                      value={m.args}
                                      onChange={(e) =>
                                        updateMcp(m.id, {
                                          args: e.target.value,
                                        })
                                      }
                                    />
                                    <label
                                      className="settings-label"
                                      htmlFor={`mcp-env-${m.id}`}
                                    >
                                      Env (JSON object)
                                    </label>
                                    <textarea
                                      id={`mcp-env-${m.id}`}
                                      className="settings-textarea settings-textarea--mono"
                                      rows={2}
                                      placeholder='{"KEY":"value"}'
                                      value={m.env}
                                      onChange={(e) =>
                                        updateMcp(m.id, { env: e.target.value })
                                      }
                                    />
                                  </>
                                )}
                                <div className="mcp-server-card__save-row">
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => saveMcpServer(m.id)}
                                  >
                                    Save server
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    portalTarget,
  );
}
