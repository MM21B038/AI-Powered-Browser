// @ts-nocheck
/* eslint-disable -- legacy kernel port from renderer.js; refactor into modules incrementally */
import { dispatchAutomationLine, runAutomationCommand } from "./automation/router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { SPOTLIGHT_ICON_SVGS } from "../shared/spotlight-icon-svgs";
import { QUICK_COMMAND_ENTRIES } from "../shared/quick-command-entries";
import { getToolTemplateLine } from "../shared/tools-hub-templates";
import { normalizeHomePageUrl, urlsMatchForTabSwitch } from "./kernel-utils";
import {
  loadConversationState,
  saveConversationState,
  createDebouncedSave,
  createNewConversation,
  generateMessageId,
  titleFromFirstLine,
} from "../chat/conversation-store-legacy";
import { loadShellWorkspacePreference, saveShellWorkspacePreference } from "../chat/conversation-store";
import { initUiTooltips } from "../ui/ui-tooltips";
import { applyIntelligentWorkspaceLayoutToDom } from "../state/intelligent-workspace-layout";

/**
 * Browser kernel: tab/webview/profile/chat/tools. Call initBrowserKernel() after the shell DOM
 * (BrowserShell) has mounted so getElementById finds nodes.
 */
let kernelInitDone = false;
export function initBrowserKernel(): void {
  if (kernelInitDone) {
    ensureReactPortalHostsAfterShellChange();
    return;
  }
  kernelInitDone = true;

// ═══════════════════════════════════════════════════════════
//  ORION BROWSER — Renderer Process
// ═══════════════════════════════════════════════════════════

// ── Feature flags ─────────────────────────────────────────────
/** When true, tab strip is rendered by React; legacy renderTabs skips DOM. */
const USE_REACT_TABS_UI = true;
/** When true, nav bar + find bar are rendered by React; legacy controls hidden. */
const USE_REACT_NAV_UI = true;
/** When true, bookmarks/history/passwords lists are rendered by React; legacy render* skips DOM. */
const USE_REACT_SIDE_PANELS = true;
/** Settings, first-run, profile, import wizard, import overlay — React ModalsBridge. */
const USE_REACT_MODALS = true;
/** Toast host driven by React + legacy-toast events. */
const USE_REACT_TOAST = true;
/** Chat panel resize drag handled in ChatShellBridge (single listener set). */
const USE_REACT_CHAT_RESIZE = true;


/** Per-<webview> lifecycle listeners (one Electron <webview> per tab). */
const webviewsWithListeners = new WeakSet();
/** Tracks which webviews have already fired `dom-ready` (for automation screenshot timing). */
const webviewDomReady = new WeakSet();
/** Tracks which webviews have completed at least one load. */
const webviewDidFinishLoad = new WeakSet();

window.__FEATURE_FLAGS__ = {
  USE_REACT_MODALS,
  USE_REACT_TOAST,
  USE_REACT_CHAT_RESIZE,
};

/** Last find-in-page result label for React nav (e.g. "1/5" / "No results"). */
let findMatchDisplay = "";
/** Last find query for find-next/prev when React owns the find UI. */
let lastFindQuery = "";

// ── State ────────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
const DEFAULT_SESSION_ID = `s_${Math.random().toString(36).slice(2, 8)}`;
let activeSessionId = DEFAULT_SESSION_ID;
const sessions = new Map();

function traceKernel(message, data) {
  try {
    void window.electronAPI?.debugLog?.({
      source: "kernel",
      message,
      data,
    });
  } catch {
    // no-op
  }
}

function snapshotKernelState() {
  return {
    activeSessionId,
    activeTabId,
    tabCount: tabs.length,
    hasBrowserFrame: !!browserFrame,
    browserFrameId: browserFrame?.id || null,
    browserFrameSession: browserFrame?.dataset?.orionSessionId || null,
    browserFrameTab: browserFrame?.dataset?.orionTabId || null,
    sessions: Array.from(sessions.values()).map((s) => ({
      id: s.id,
      headless: !!s.headless,
      tabCount: s.tabs.length,
      activeTabId: s.activeTabId,
      webviews: s.tabs.map((t) => ({
        id: t.id,
        url: t.url,
        hasWebview: !!t.webview,
        isBrowserFrameId: !!t.webview && t.webview.id === "browserFrame",
        webviewSession: t.webview?.dataset?.orionSessionId || null,
        webviewTab: t.webview?.dataset?.orionTabId || null,
      })),
    })),
  };
}

function makeSession(id, headless) {
  return {
    id,
    headless: !!headless,
    tabs: [],
    activeTabId: null,
    tabCounter: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

function getSession(id = activeSessionId) {
  return sessions.get(id) || null;
}

function getTabInSession(sessionId, id) {
  const s = getSession(sessionId);
  if (!s) return null;
  return s.tabs.find((t) => t.id === id) || null;
}

function isWebviewOwnedByAnySession(wv) {
  if (!wv) return false;
  for (const s of sessions.values()) {
    if (s?.tabs?.some((t) => t.webview === wv)) return true;
  }
  return false;
}

function persistActiveSessionState() {
  const s = getSession(activeSessionId);
  if (!s) return;
  s.tabs = tabs;
  s.activeTabId = activeTabId;
  s.tabCounter = tabCounter;
  s.lastActiveAt = Date.now();
}

function syncFromActiveSession() {
  let s = getSession(activeSessionId);
  if (!s) {
    s = makeSession(activeSessionId, false);
    sessions.set(activeSessionId, s);
  }
  tabs = s.tabs;
  activeTabId = s.activeTabId;
  tabCounter = s.tabCounter;
  const t = activeTabId != null ? s.tabs.find((x) => x.id === activeTabId) : null;
  browserFrame = t?.webview && t.webview.isConnected ? t.webview : null;
}

function withSessionState(sessionId, fn) {
  const targetId = sessionId || activeSessionId;
  if (!sessions.has(targetId)) return fn();
  const prev = activeSessionId;
  const same = prev === targetId;
  const restore = () => {
    persistActiveSessionState();
    activeSessionId = prev;
    syncFromActiveSession();
  };

  if (!same) {
    persistActiveSessionState();
    activeSessionId = targetId;
    syncFromActiveSession();
  }

  let result;
  try {
    result = fn();
  } catch (e) {
    if (!same) restore();
    throw e;
  }

  // Important: if `fn` is async, restore must happen after the Promise settles.
  if (!same && result && typeof (result as { then?: unknown }).then === "function") {
    return (result as Promise<unknown>).finally(() => restore());
  }

  if (!same) restore();
  return result;
}

function generateSessionId() {
  return `s_${Math.random().toString(36).slice(2, 8)}`;
}
sessions.set(DEFAULT_SESSION_ID, makeSession(DEFAULT_SESSION_ID, false));

function generatePublicTabId() {
  // 5-digit, human-friendly, no leading zeros.
  // Keep unique among currently-open tabs.
  let n = 0;
  for (let i = 0; i < 50; i++) {
    n = Math.floor(10000 + Math.random() * 90000);
    if (!tabs.some((t) => String(t.publicId) === String(n))) return n;
  }
  // Fallback: deterministic-ish from time; still 5 digits.
  return Number(String(Date.now()).slice(-5));
}
let zoomLevel = parseFloat(localStorage.getItem("zoomLevel") ?? "-1");
let isLoading = false;
let loadingTimer = null;
let findActive = false;

let homePage = normalizeHomePageUrl(localStorage.getItem("homePage"));

let profileGateBackdropOn = false;

function setProfileGateBackdrop(on) {
  profileGateBackdropOn = !!on;
  if (browserFrame) {
    browserFrame.style.opacity = profileGateBackdropOn ? "0" : "";
  }
  if (loadingOverlay) {
    if (profileGateBackdropOn) {
      const st = loadingOverlay.querySelector(".loading-spotlight-stage");
      if (st) shuffleLoadingSpotlightStage(st);
      loadingOverlay.style.display = "flex";
    } else {
      // If an actual navigation load is happening, keep the overlay managed by setLoading().
      if (!isLoading) loadingOverlay.style.display = "none";
    }
  }
}

// ── DOM Refs (re-read after shell reinject / React StrictMode remount) ──
let tabScrollArea;
let tabBarEl;
let browserSectionEl;
let browserFrame;
let addressBar;
let clearAddressBtn;
let addressWrapper;
let securityIcon;
let backBtn;
let forwardBtn;
let reloadBtn;
let homeBtn;
let screenshotBtn;
let findBtn;
let zoomInBtn;
let zoomOutBtn;
let zoomLevelEl;
let devtoolsBtn;
let settingsBtn;
let settingsBtnChat;
let bookmarksBtn;
let historyBtn;
let settingsPanel;
let settingsOverlay;
let closeSettingsBtn;
let loadingOverlay;
let errorPage;
let errorDesc;
let errorRetryBtn;
let statusText;
let statusSecurity;
let statusSecurityChip;
let findBar;
let findInput;
let findCount;
let findPrev;
let findNext;
let findClose;
let browserSelect;
let importBookmarks;
let importHistory;
let importCookies;
let importStats;
let chromeStats;
let firefoxStats;
let checkImportBtn;
let startImportBtn;
let importProgress;
let progressFill;
let progressText;
let chatMessages;
let chatInput;
let sendBtn;
let clearChatBtn;
let toast;
let tbMinimize;
let tbMaximize;
let tbClose;
let titlebarBrowserBtn;
let titlebarIntelligentBtn;
let appContainer;
let chatSubtitle;
let newChatBtn;
let homePageInput;
let chatSection;
let chatWrapper;
let aiChatToggleBtn;
let closeChatBtn;
let firstRunOverlay;
let chromePreview;
let firefoxPreview;
let skipImportBtn;
let importOptionBtns;

function hydrateLoadingSpotlightStage(stageEl) {
  if (!stageEl) return;
  const beats = stageEl.querySelectorAll(".loading-spotlight-beat");
  beats.forEach((beat, i) => {
    const wrap = beat.querySelector(".loading-spotlight-icon-wrap");
    if (wrap && SPOTLIGHT_ICON_SVGS[i]) wrap.innerHTML = SPOTLIGHT_ICON_SVGS[i];
  });
}

function shuffleLoadingSpotlightStage(stage) {
  if (!stage) return;
  const beats = Array.from(stage.querySelectorAll(".loading-spotlight-beat"));
  for (let i = beats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [beats[i], beats[j]] = [beats[j], beats[i]];
  }
  beats.forEach((b) => stage.appendChild(b));
}

function hydrateLoadingSpotlightShellStages() {
  hydrateLoadingSpotlightStage(
    document.querySelector("#loadingOverlay .loading-spotlight-stage"),
  );
  hydrateLoadingSpotlightStage(
    document.querySelector("#importOverlay .loading-spotlight-stage"),
  );
}

function refreshDomRefsFromDocument() {
  tabScrollArea = document.getElementById("tabScrollArea");
  tabBarEl = document.getElementById("tabBar");
  browserSectionEl = document.getElementById("browserSection");
  browserFrame = document.getElementById("browserFrame");
  addressBar = document.getElementById("addressBar");
  clearAddressBtn = document.getElementById("clearAddressBtn");
  addressWrapper = document.getElementById("addressBarWrapper");
  securityIcon = document.getElementById("securityIcon");
  backBtn = document.getElementById("backBtn");
  forwardBtn = document.getElementById("forwardBtn");
  reloadBtn = document.getElementById("reloadBtn");
  homeBtn = document.getElementById("homeBtn");
  screenshotBtn = document.getElementById("screenshotBtn");
  findBtn = document.getElementById("findBtn");
  zoomInBtn = document.getElementById("zoomInBtn");
  zoomOutBtn = document.getElementById("zoomOutBtn");
  zoomLevelEl = document.getElementById("zoomLevel");
  devtoolsBtn = document.getElementById("devtoolsBtn");
  settingsBtn = document.getElementById("settingsBtn");
  settingsBtnChat = document.getElementById("settingsBtnChat");
  bookmarksBtn = document.getElementById("bookmarksBtn");
  historyBtn = document.getElementById("historyBtn");
  settingsPanel = document.getElementById("settingsPanel");
  settingsOverlay = document.getElementById("settingsOverlay");
  closeSettingsBtn = document.getElementById("closeSettingsBtn");
  loadingOverlay = document.getElementById("loadingOverlay");
  errorPage = document.getElementById("errorPage");
  errorDesc = document.getElementById("errorDesc");
  errorRetryBtn = document.getElementById("errorRetryBtn");
  statusText = document.getElementById("statusText");
  statusSecurity = document.getElementById("statusSecurity");
  statusSecurityChip = document.getElementById("statusSecurityChip");
  findBar = document.getElementById("findBar");
  findInput = document.getElementById("findInput");
  findCount = document.getElementById("findCount");
  findPrev = document.getElementById("findPrev");
  findNext = document.getElementById("findNext");
  findClose = document.getElementById("findClose");
  browserSelect = document.getElementById("browserSelect");
  importBookmarks = document.getElementById("importBookmarks");
  importHistory = document.getElementById("importHistory");
  importCookies = document.getElementById("importCookies");
  importStats = document.getElementById("importStats");
  chromeStats = document.getElementById("chromeStats");
  firefoxStats = document.getElementById("firefoxStats");
  checkImportBtn = document.getElementById("checkImportBtn");
  startImportBtn = document.getElementById("startImportBtn");
  importProgress = document.getElementById("importProgress");
  progressFill = document.getElementById("progressFill");
  progressText = document.getElementById("progressText");
  chatMessages = document.getElementById("chatMessages");
  chatInput = document.getElementById("chatInput");
  sendBtn = document.getElementById("sendBtn");
  clearChatBtn = document.getElementById("clearChatBtn");
  toast = document.getElementById("toast");
  tbMinimize = document.getElementById("tbMinimize");
  tbMaximize = document.getElementById("tbMaximize");
  tbClose = document.getElementById("tbClose");
  titlebarBrowserBtn = document.getElementById("titlebarBrowserBtn");
  titlebarIntelligentBtn = document.getElementById("titlebarIntelligentBtn");
  appContainer = document.getElementById("appContainer");
  chatSubtitle = document.getElementById("chatSubtitle");
  newChatBtn = document.getElementById("newChatBtn");
  homePageInput = document.getElementById("homePageInput");
  chatSection = document.getElementById("chatSection");
  chatWrapper = document.getElementById("chatWrapper");
  aiChatToggleBtn = document.getElementById("aiChatToggleBtn");
  closeChatBtn = document.getElementById("closeChatBtn");
  firstRunOverlay = document.getElementById("firstRunOverlay");
  chromePreview = document.getElementById("chromePreview");
  firefoxPreview = document.getElementById("firefoxPreview");
  skipImportBtn = document.getElementById("skipImportBtn");
  importOptionBtns = document.querySelectorAll(".import-option-btn");
}

function setupReactPortalHosts() {
  const tb = tabBarEl;
  const tsa = tabScrollArea;
  const bsec = browserSectionEl;
  if (USE_REACT_TABS_UI && tsa && tb) {
    tsa.style.cssText =
      "display:none;width:0;height:0;overflow:hidden;padding:0;margin:0;border:0;min-height:0;flex:0;min-width:0;";
    let reactTabStripHost = document.getElementById("reactTabStripHost");
    if (!reactTabStripHost) {
      reactTabStripHost = document.createElement("div");
      reactTabStripHost.id = "reactTabStripHost";
      reactTabStripHost.className = "tab-scroll-area";
      tb.appendChild(reactTabStripHost);
    }
  }
  if (USE_REACT_NAV_UI && bsec && tb) {
    const legacyNavBar = bsec.querySelector(".nav-bar");
    if (legacyNavBar) legacyNavBar.style.display = "none";
    const fb = document.getElementById("findBar");
    if (fb) fb.style.display = "none";
    const pageFrame = document.getElementById("browserPageFrame");
    const mainCol = document.getElementById("browserMainColumn");
    const navParent = pageFrame ?? mainCol;
    if (!navParent) return;
    const crumbBar = document.getElementById("crumbBar");
    let reactNavHost = document.getElementById("reactNavHost");
    if (!reactNavHost) {
      reactNavHost = document.createElement("div");
      reactNavHost.id = "reactNavHost";
      reactNavHost.className = "nav-bar";
      if (crumbBar && crumbBar.parentElement === navParent) crumbBar.after(reactNavHost);
      else navParent.insertBefore(reactNavHost, navParent.firstChild);
    } else if (reactNavHost.parentElement !== navParent) {
      if (crumbBar && crumbBar.parentElement === navParent) crumbBar.after(reactNavHost);
      else navParent.insertBefore(reactNavHost, navParent.firstChild);
    } else if (crumbBar && crumbBar.parentElement === navParent && crumbBar.nextElementSibling !== reactNavHost) {
      crumbBar.after(reactNavHost);
    }
    let reactFindHost = document.getElementById("reactFindHost");
    if (!reactFindHost) {
      reactFindHost = document.createElement("div");
      reactFindHost.id = "reactFindHost";
      reactNavHost.after(reactFindHost);
    } else if (
      reactFindHost.parentElement !== navParent ||
      reactFindHost.previousElementSibling !== reactNavHost
    ) {
      reactNavHost.after(reactFindHost);
    }
  }
}

type TopSurface =
  | "webview"
  | "bookmarks"
  | "history"
  | "passwords"
  | "sessions"
  | "toolsHub"
  | "settings"
  | "browserSettings"
  | "networkWorkbench";

let lastToolsHubCrumbs: string[] = ["Tool Hub"];

function setAddressCrumbText(text: string): void {
  const t = (text || "").trim();
  const ids = ["reactAddressBarWrapper", "addressBarWrapper"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!t) el.removeAttribute("data-crumb");
    else el.setAttribute("data-crumb", t);
  }
}

function setCrumbParts(parts: string[]): void {
  const host = document.getElementById("crumbBar");
  const safeParts = parts.map((p) => String(p ?? "").trim()).filter(Boolean);
  const crumbLine = safeParts.length ? `> ${safeParts.join(" > ")}` : "";
  setAddressCrumbText(crumbLine);

  if (!host) return;
  if (!parts.length) {
    host.innerHTML = "";
    host.setAttribute("aria-hidden", "true");
    return;
  }
  host.setAttribute("aria-hidden", "false");
  const safe = safeParts.map((p) => escapeHtml(p));
  host.innerHTML = safe
    .map(
      (p, i) =>
        (i ? `<span class="crumb-sep" aria-hidden="true">&gt;</span>` : "") +
        `<span class="crumb-part">${p}</span>`,
    )
    .join("");
}

function syncTopChromeForSurface(): void {
  const bsec = document.getElementById("browserSection");
  if (!bsec) return;

  const hub = document.getElementById("toolsHubRoot");
  const hubOpen = !!(hub && hub.classList.contains("tools-hub--open"));
  const settingsOpen =
    shellWorkspace === "settings" ||
    !!document.getElementById("appContainer")?.hasAttribute("data-settings-open");
  const workbenchOpen = !!document
    .getElementById("webviewContainer")
    ?.hasAttribute("data-workbench-open");

  const bookmarksOpen = !!document.getElementById("bookmarksPanel")?.classList.contains(SIDE_PANEL_OPEN_CLASS);
  const historyOpen = !!document.getElementById("historyPanel")?.classList.contains(SIDE_PANEL_OPEN_CLASS);
  const passwordsOpen = !!document.getElementById("passwordsPanel")?.classList.contains(SIDE_PANEL_OPEN_CLASS);
  const sessionsOpen = !!document.getElementById("sessionsPanel")?.classList.contains(SIDE_PANEL_OPEN_CLASS);
  const browserChromeSettingsOpen = !!document
    .getElementById("browserSettingsPanel")
    ?.classList.contains(SIDE_PANEL_OPEN_CLASS);

  let surface: TopSurface = "webview";
  if (hubOpen) surface = "toolsHub";
  else if (workbenchOpen) surface = "networkWorkbench";
  else if (settingsOpen) surface = "settings";
  else if (browserChromeSettingsOpen) surface = "browserSettings";
  else if (historyOpen) surface = "history";
  else if (bookmarksOpen) surface = "bookmarks";
  else if (passwordsOpen) surface = "passwords";
  else if (sessionsOpen) surface = "sessions";

  bsec.setAttribute("data-surface", surface);

  if (surface === "webview") setCrumbParts([]);
  else if (surface === "history") setCrumbParts(["History"]);
  else if (surface === "bookmarks") setCrumbParts(["Bookmarks"]);
  else if (surface === "passwords") setCrumbParts(["Saved passwords"]);
  else if (surface === "sessions") setCrumbParts(["Sessions"]);
  else if (surface === "settings") setCrumbParts(["Settings"]);
  else if (surface === "browserSettings") setCrumbParts(["Browser settings"]);
  else if (surface === "toolsHub") setCrumbParts(lastToolsHubCrumbs.length ? lastToolsHubCrumbs : ["Tool Hub"]);
  else if (surface === "networkWorkbench") setCrumbParts(["Network", "Workbench"]);
}

function ensureReactPortalHostsAfterShellChange() {
  const prevFrame = browserFrame;
  refreshDomRefsFromDocument();
  hydrateLoadingSpotlightShellStages();
  setupReactPortalHosts();
  refreshDomRefsFromDocument();
  if (USE_REACT_MODALS) wireReactSettingsButtons();
  if (!browserFrame) return;
  if (prevFrame !== browserFrame || (prevFrame && !prevFrame.isConnected)) {
    webviewReady = false;
    if (browserFrame) setupWebviewEvents(browserFrame);
    const t = getTab(activeTabId);
    if (t) {
      t.initialized = false;
      switchTab(activeTabId);
    }
  }
}

refreshDomRefsFromDocument();
hydrateLoadingSpotlightShellStages();
setupReactPortalHosts();
// IMPORTANT: run after DOM refs (`browserFrame`) declarations are initialized.
syncFromActiveSession();
// addTabBtn is rendered dynamically inside renderTabs()

// If the app is waiting on profile selection, keep the loading spotlight behind modals
// and hide the blank webview until the first tab is created.
setProfileGateBackdrop(USE_REACT_MODALS && tabs.length === 0);

let chatOpen = true;

let convState = loadConversationState();
const scheduleConvSave = createDebouncedSave(400);
let shellWorkspace = "browser";

// ── Init ─────────────────────────────────────────────────────
function hideLegacyModalContainers() {
  [
    "firstRunOverlay",
    "profileOverlay",
    "importWizard",
    "importOverlay",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    }
  });
  document.getElementById("webviewOverlayHost")?.setAttribute("aria-hidden", "true");
}

/** Clears intelligent-settings modal flag over webview and notifies embedded UIs. */
function leaveSettingsSurfaceSync() {
  document.getElementById("appContainer")?.removeAttribute("data-settings-open");
  const host = document.getElementById("webviewOverlayHost");
  if (host) host.setAttribute("aria-hidden", "true");
  window.dispatchEvent(new CustomEvent("react-close-settings"));
}

function notifyBrowserChromeSettingsSide(open) {
  try {
    window.dispatchEvent(new CustomEvent("browser-chrome-settings-side", { detail: { open } }));
  } catch {
    /* ignore */
  }
}

function closeBrowserSettingsSidePanel() {
  const p = document.getElementById("browserSettingsPanel");
  if (!p?.classList.contains(SIDE_PANEL_OPEN_CLASS)) return;
  p.classList.remove(SIDE_PANEL_OPEN_CLASS);
  p.setAttribute("aria-hidden", "true");
  notifyBrowserChromeSettingsSide(false);
  syncRailPanelActive();
  syncWebviewInteractionLayer();
}

/** Close browser settings column + clear modal overlay flag (intelligent settings modal). */
function closeBrowserChromeSettingsOverlay() {
  closeBrowserSettingsSidePanel();
  document.getElementById("appContainer")?.removeAttribute("data-settings-open");
  const host = document.getElementById("webviewOverlayHost");
  if (host) host.setAttribute("aria-hidden", "true");
}

/** @deprecated Use rail Settings (toggles side panel). Kept for API compatibility. */
function openBrowserChromeSettingsOverlay() {
  toggleSidePanel("browserSettingsPanel");
}

let browserChromeSettingsOverlayControlsWired = false;
function wireBrowserChromeSettingsOverlayControls() {
  if (browserChromeSettingsOverlayControlsWired) return;
  browserChromeSettingsOverlayControlsWired = true;
}

/** Clears workbench DOM state and notifies React — call after the next surface is visible when possible. */
function leaveWorkbenchSurfaceSync() {
  document.getElementById("webviewContainer")?.removeAttribute("data-workbench-open");
  window.dispatchEvent(new CustomEvent("react-close-workbench"));
}

/** Intelligent assistant: large modal (intelligent workspace). Browser: side panel. */
function openIntelligentAssistantSettings() {
  closeBrowserSettingsSidePanel();
  closeBrowserChromeSettingsOverlay();
  closeSidePanels();
  const hub = document.getElementById("toolsHubRoot");
  if (hub && hub.classList.contains("tools-hub--open")) {
    closeToolsHub();
  }
  leaveWorkbenchSurfaceSync();
  document.getElementById("appContainer")?.removeAttribute("data-settings-open");
  if (shellWorkspace !== "intelligent") {
    enterIntelligentWorkspace();
  }
  window.dispatchEvent(new CustomEvent("intelligent-assistant-settings-open"));
  syncRailPanelActive();
  syncWebviewInteractionLayer();
}

function enterSettingsWorkspace(panel) {
  if (panel === "browser") {
    toggleSidePanel("browserSettingsPanel");
    return;
  }
  openIntelligentAssistantSettings();
}

function wireReactSettingsButtons() {
  wireBrowserChromeSettingsOverlayControls();
  const s = document.getElementById("settingsBtn");
  const chatSettings = document.getElementById("settingsBtnChat");
  if (s) {
    s.onclick = () => {
      if (shellWorkspace === "browser") {
        toggleSidePanel("browserSettingsPanel");
      } else {
        openIntelligentAssistantSettings();
      }
    };
  }
  if (chatSettings) chatSettings.onclick = () => openIntelligentAssistantSettings();
  const iwSettings = document.getElementById("intelligentWorkspaceSettingsBtn");
  if (iwSettings) iwSettings.onclick = () => openIntelligentAssistantSettings();
}

function showWebviewOnly() {
  closeBrowserChromeSettingsOverlay();
  closeSidePanels();
  closeToolsHub();
  leaveWorkbenchSurfaceSync();
  leaveSettingsSurfaceSync();
  syncRailPanelActive();
  syncWebviewInteractionLayer();
}

// -----------------------------------------------------------
//  TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════

function createSessionState(headless) {
  const id = generateSessionId();
  const s = makeSession(id, !!headless);
  sessions.set(id, s);
  return s;
}

function listSessions() {
  const now = Date.now();
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    headless: !!s.headless,
    tabCount: s.tabs.length,
    activeTabId: s.activeTabId,
    isActive: s.id === activeSessionId,
    createdAt: typeof s.createdAt === "number" ? s.createdAt : now,
    activeForMs: Math.max(0, now - (s.createdAt || now)),
  }));
}

function ensureActiveShellReady() {
  if (!getSession(activeSessionId)) {
    sessions.set(DEFAULT_SESSION_ID, makeSession(DEFAULT_SESSION_ID, false));
    activeSessionId = DEFAULT_SESSION_ID;
    syncFromActiveSession();
  }
  if (tabs.length === 0) createTab(homePage);
  if (activeTabId == null && tabs.length > 0) activeTabId = tabs[0].id;
  const active = activeTabId != null ? getTab(activeTabId) : null;
  if (active && !active.webview) ensureWebviewForTab(active);
  // If shell is now bootstrapped, never keep the startup backdrop blocking UI.
  if (tabs.length > 0) setProfileGateBackdrop(false);
  traceKernel("ensureActiveShellReady", {
    tabs: tabs.length,
    activeTabId,
    activeSessionId,
    hasBrowserFrame: !!browserFrame,
    hasActiveWebview: !!active?.webview,
  });
}

function setWebviewVisibilityForSession(sessionId, visible) {
  const s = getSession(sessionId);
  if (!s) return;
  s.tabs.forEach((t) => {
    if (!t.webview) return;
    if (!visible) t.webview.removeAttribute("id");
    t.webview.style.visibility = visible ? "visible" : "hidden";
    t.webview.style.pointerEvents = visible ? "auto" : "none";
    t.webview.style.zIndex = visible ? "1" : "0";
  });
}

function rebindActiveSessionViewport() {
  traceKernel("rebindActiveSessionViewport:start", snapshotKernelState());
  const s = getSession(activeSessionId);
  let active = activeTabId != null ? getTab(activeTabId) : null;
  if (!active && tabs.length > 0) {
    activeTabId = tabs[0].id;
    active = tabs[0];
  }
  if (active && !active.webview) ensureWebviewForTab(active);
  if (active) {
    // Re-run full switch path to restore nav/address/find bindings and webview visibility.
    traceKernel("rebindActiveSessionViewport:switching_active_tab", { activeTabId: active.id });
    switchTab(active.id);
    traceKernel("rebindActiveSessionViewport:after_switchTab", snapshotKernelState());
    return;
  }
  document.querySelectorAll("webview#browserFrame").forEach((wv) => {
    try {
      wv.removeAttribute("id");
    } catch {
      /* ignore */
    }
  });
  if (active && active.webview) {
    active.webview.id = "browserFrame";
    active.webview.style.visibility = s?.headless ? "hidden" : "visible";
    active.webview.style.pointerEvents = s?.headless ? "none" : "auto";
    active.webview.style.zIndex = "1";
    browserFrame = active.webview;
  } else {
    browserFrame = null;
  }
  if (addressBar) addressBar.value = active?.url === "about:blank" ? "" : active?.url || "";
  updateNavButtons();
  syncWebviewInteractionLayer();
  traceKernel("rebindActiveSessionViewport:end", snapshotKernelState());
}

function switchSession(sessionId) {
  traceKernel("switchSession:start", { targetSessionId: sessionId, state: snapshotKernelState() });
  const next = getSession(sessionId);
  if (!next) {
    traceKernel("switchSession:target_missing", { targetSessionId: sessionId });
    return false;
  }
  if (browserFrame) browserFrame.removeAttribute("id");
  persistActiveSessionState();
  setWebviewVisibilityForSession(activeSessionId, false);
  activeSessionId = sessionId;
  syncFromActiveSession();
  if (!next.headless && tabs.length === 0) createTab(homePage);
  next.lastActiveAt = Date.now();
  if (activeTabId == null && tabs.length > 0) activeTabId = tabs[0].id;
  const active = activeTabId != null ? getTab(activeTabId) : null;
  browserFrame = active?.webview || null;
  if (active && active.webview) {
    active.webview.id = "browserFrame";
    active.webview.style.visibility = next.headless ? "hidden" : "visible";
    active.webview.style.pointerEvents = next.headless ? "none" : "auto";
  }
  if (addressBar) addressBar.value = active?.url === "about:blank" ? "" : active?.url || "";
  renderTabs();
  updateNavButtons();
  syncWebviewInteractionLayer();
  traceKernel("switchSession:end", { targetSessionId: sessionId, state: snapshotKernelState() });
  return true;
}

function killSessionById(sessionId) {
  traceKernel("killSessionById:start", { sessionId, state: snapshotKernelState() });
  if (!sessionId || sessionId === DEFAULT_SESSION_ID) return false;
  persistActiveSessionState();
  const s = getSession(sessionId);
  if (!s) {
    traceKernel("killSessionById:session_missing", { sessionId });
    return false;
  }
  try {
    void window.electronAPI?.bgKillSession?.(sessionId);
  } catch {
    /* ignore */
  }
  s.tabs.forEach((t) => {
    if (!t.webview) return;
    try {
      t.webview.remove();
    } catch {
      /* ignore */
    }
    t.webview = null;
  });
  sessions.delete(sessionId);
  if (activeSessionId === sessionId) {
    traceKernel("killSessionById:deleted_active_session_switching_default", { sessionId });
    switchSession(DEFAULT_SESSION_ID);
  } else {
    // Deleting a non-active session can still disturb DOM ids/visibility; restore active viewport invariants.
    traceKernel("killSessionById:deleted_non_active_session_rebind", {
      deletedSessionId: sessionId,
      currentActiveSessionId: activeSessionId,
    });
    rebindActiveSessionViewport();
    renderTabs();
  }
  traceKernel("killSessionById:end", { sessionId, state: snapshotKernelState() });
  return true;
}

function createTab(url = homePage) {
  const id = ++tabCounter;
  let resolved = url;
  if (resolved == null || String(resolved).trim() === "") resolved = homePage;
  else resolved = String(resolved).trim();
  if (!resolved) resolved = homePage;
  tabs.push({
    id,
    publicId: generatePublicTabId(),
    url: resolved,
    title: "New Tab",
    favicon: null,
    loading: false,
    _new: true,
    initialized: false,
    webview: null,
  });
  switchTab(id);
}

// Ripple burst on the clicked button, then open tab
function spawnTab(triggerEl) {
  const ripple = document.createElement("span");
  ripple.className = "tab-ripple";
  triggerEl.style.position = "relative";
  triggerEl.style.overflow = "hidden";
  triggerEl.appendChild(ripple);
  triggerEl.classList.add("tab-btn-pop");
  setTimeout(() => {
    ripple.remove();
    triggerEl.classList.remove("tab-btn-pop");
  }, 500);
  createTab();
}

let webviewReady = false;

function isActiveWebview(wv) {
  const t = getTab(activeTabId);
  return !!(t && t.webview === wv);
}

function ensureWebviewForTab(tab) {
  if (tab.webview) {
    // A tab may keep a stale webview reference after session switching/deletion.
    // If it's disconnected, recreate it so session-scoped commands (nav/screenshot) work.
    if (tab.webview.isConnected) return tab.webview;
    try {
      tab.webview.remove();
    } catch {
      /* ignore */
    }
    tab.webview = null;
  }
  const container = document.getElementById("webviewContainer");
  if (!container) return null;
  const s = getSession(activeSessionId);
  const isHeadless = !!s?.headless;

  const unowned = document.getElementById("browserFrame");
  if (
    unowned &&
    unowned.parentNode === container &&
    !isWebviewOwnedByAnySession(unowned)
  ) {
    tab.webview = unowned;
    unowned.dataset.orionTabId = String(tab.id);
    unowned.dataset.orionSessionId = activeSessionId;
    unowned.style.position = "absolute";
    unowned.style.inset = "0";
    unowned.style.visibility = isHeadless ? "hidden" : "visible";
    unowned.style.pointerEvents = isHeadless ? "none" : "auto";
    setupWebviewEvents(unowned);
    return unowned;
  }

  const wv = document.createElement("webview");
  wv.className = "browser-frame";
  wv.setAttribute("allowpopups", "");
  wv.setAttribute("partition", `persist:orion_${activeSessionId}`);
  wv.dataset.orionTabId = String(tab.id);
  wv.dataset.orionSessionId = activeSessionId;
  wv.style.cssText =
    `position:absolute;inset:0;visibility:${isHeadless ? "hidden" : "visible"};pointer-events:none;z-index:0;`;
  container.appendChild(wv);
  tab.webview = wv;
  setupWebviewEvents(wv);
  return wv;
}

function switchTab(id) {
  traceKernel("switchTab:start", { tabId: id, state: snapshotKernelState() });
  const prevActiveId = activeTabId;
  const prevTab = prevActiveId != null ? getTab(prevActiveId) : null;
  activeTabId = id;
  const tab = getTab(id);
  if (!tab) {
    traceKernel("switchTab:tab_missing", { tabId: id, state: snapshotKernelState() });
    return;
  }
  const session = getSession(activeSessionId);
  const isHeadless = !!session?.headless;

  if (prevTab && prevTab.webview) {
    prevTab.webview.style.visibility = "hidden";
    prevTab.webview.style.pointerEvents = "none";
    prevTab.webview.style.zIndex = "0";
    prevTab.webview.removeAttribute("id");
  }

  const wv = ensureWebviewForTab(tab);
  if (!wv) {
    if (addressBar) addressBar.value = tab.url === "about:blank" ? "" : tab.url;
    renderTabs();
    traceKernel("switchTab:no_webview", { tabId: id, state: snapshotKernelState() });
    return;
  }

  browserFrame = wv;
  wv.id = "browserFrame";
  wv.style.visibility = isHeadless ? "hidden" : "visible";
  wv.style.pointerEvents = isHeadless ? "none" : "auto";
  wv.style.zIndex = "1";
  wv.style.position = "absolute";
  wv.style.inset = "0";

  if (addressBar) addressBar.value = tab.url === "about:blank" ? "" : tab.url;

  const targetUrl = tab.url === "about:blank" ? "about:blank" : tab.url;
  let liveUrl = "";
  try {
    liveUrl = wv.getURL ? wv.getURL() : "";
  } catch {
    /* ignore */
  }
  const needsLoad =
    !liveUrl ||
    liveUrl === "about:blank" ||
    !urlsMatchForTabSwitch(liveUrl, targetUrl);

  if (needsLoad) {
    webviewReady = true;
    tab.initialized = true;
    try {
      wv.loadURL(targetUrl);
    } catch {
      try {
        wv.src = targetUrl;
      } catch {
        /* ignore */
      }
    }
  } else {
    tab.initialized = true;
    webviewReady = true;
  }

  try {
    wv.setZoomLevel(zoomLevel);
  } catch {
    /* ignore */
  }

  updateNavButtons();
  updateSecurityIcon(tab.url);
  updateBookmarkStar(tab.url === "about:blank" ? "" : tab.url);
  renderTabs();
  syncWebviewInteractionLayer();
  // Keep session object in sync so syncFromActiveSession() restores correct state.
  persistActiveSessionState();
  traceKernel("switchTab:end", { tabId: id, state: snapshotKernelState() });
}

function closeTab(id, e) {
  if (e) e.stopPropagation();
  const closing = getTab(id);
  if (closing && closing.webview) {
    try {
      closing.webview.remove();
    } catch {
      /* ignore */
    }
    closing.webview = null;
  }
  tabs = tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) {
    createTab();
    return;
  }
  if (activeTabId === id) {
    const fallback = tabs[tabs.length - 1];
    // If fallback tab points to a stale/removed webview, clear it so a fresh one is created.
    if (fallback?.webview && !fallback.webview.isConnected) fallback.webview = null;
    switchTab(fallback.id);
  }
  else renderTabs();
}

function getTab(id) {
  return tabs.find((t) => t.id === id);
}

/**
 * Reorder tabs (same rules as drag-drop in legacy renderTabs).
 * @param {"left"|"right"} side drop side relative to target tab
 */
function reorderTabs(movedId, targetId, side) {
  if (movedId === targetId) return;
  const fromIdx = tabs.findIndex((t) => t.id === movedId);
  const toIdx = tabs.findIndex((t) => t.id === targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = tabs.splice(fromIdx, 1);
  const insertAt = side === "left" ? toIdx : toIdx + 1;
  const at = fromIdx < toIdx ? insertAt - 1 : insertAt;
  tabs.splice(at, 0, moved);
  renderTabs();
}

function renderTabs() {
  if (USE_REACT_TABS_UI) return;
  tabScrollArea.innerHTML = "";
  tabs.forEach((tab, index) => {
    const isLast = index === tabs.length - 1;
    const el = document.createElement("div");
    el.className = "tab" + (tab.id === activeTabId ? " active" : "");
    if (tab._new) {
      el.classList.add("tab-entering");
      delete tab._new;
    }
    el.dataset.tabId = tab.id;

    const fav = document.createElement("div");
    fav.className = "tab-favicon";
    if (tab.loading) {
      fav.innerHTML = `<div class="tab-spinner"></div>`;
    } else if (tab.favicon) {
      const img = document.createElement("img");
      img.width = 14;
      img.height = 14;
      img.src = tab.favicon;
      img.onerror = () => {
        img.remove();
        fav.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2" opacity="0.4"/></svg>`;
      };
      fav.appendChild(img);
    } else {
      fav.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2" opacity="0.4"/></svg>`;
    }

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";

    const close = document.createElement("button");
    close.className = "tab-close";
    close.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    close.onclick = (e) => closeTab(tab.id, e);

    el.appendChild(fav);
    el.appendChild(title);
    el.appendChild(close);
    el.onclick = () => switchTab(tab.id);

    // Drag to reorder
    setupTabDrag(el, tab.id);

    tabScrollArea.appendChild(el);
  });

  // Inline + button right after last tab
  const addBtn = document.createElement("button");
  addBtn.className = "add-tab-btn";
  addBtn.title = "New Tab (Ctrl+T)";
  addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1V13M1 7H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  addBtn.onclick = () => spawnTab(addBtn);
  tabScrollArea.appendChild(addBtn);
}

// ═══════════════════════════════════════════════════════════
//  TAB DRAG & DROP
// ═══════════════════════════════════════════════════════════

let dragState = null;

function setupTabDrag(el, tabId) {
  el.addEventListener("mousedown", (e) => {
    // Only left button, ignore close btn clicks
    if (e.button !== 0 || e.target.closest(".tab-close")) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost = null;

    const onMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 6) {
        dragging = true;
        dragState = { tabId };

        // Mark source tab
        el.classList.add("tab-dragging");

        // Create floating ghost clone
        const rect = el.getBoundingClientRect();
        ghost = el.cloneNode(true);
        ghost.className = "tab tab-drag-ghost";
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        ghost.style.left = rect.left + "px";
        ghost.style.top = rect.top + "px";
        document.body.appendChild(ghost);
      }

      if (!dragging) return;

      // Move ghost
      const rect = el.getBoundingClientRect();
      ghost.style.left = e.clientX - rect.width / 2 + "px";
      ghost.style.top = e.clientY - rect.height / 2 + "px";

      // Find drop target
      clearDropIndicators();
      const target = getDropTarget(e.clientX);
      if (target && target.tabId !== tabId) {
        const targetEl = tabScrollArea.querySelector(
          `[data-tab-id="${target.tabId}"]`,
        );
        if (targetEl)
          targetEl.classList.add(
            target.side === "left" ? "tab-drop-before" : "tab-drop-after",
          );
      }
    };

    const onUp = (e) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      if (!dragging) {
        // Was a click — switchTab handled by onclick
        dragState = null;
        return;
      }

      // Drop: reorder tabs
      const target = getDropTarget(e.clientX);
      if (target && target.tabId !== tabId) {
        const fromIdx = tabs.findIndex((t) => t.id === tabId);
        const toIdx = tabs.findIndex((t) => t.id === target.tabId);
        const [moved] = tabs.splice(fromIdx, 1);
        const insertAt = target.side === "left" ? toIdx : toIdx + 1;
        tabs.splice(fromIdx < toIdx ? insertAt - 1 : insertAt, 0, moved);
      }

      clearDropIndicators();
      el.classList.remove("tab-dragging");
      if (ghost) ghost.remove();
      dragState = null;
      renderTabs();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function getDropTarget(clientX) {
  const tabEls = [...tabScrollArea.querySelectorAll(".tab:not(.tab-dragging)")];
  for (const el of tabEls) {
    const rect = el.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) {
      const mid = rect.left + rect.width / 2;
      const side = clientX < mid ? "left" : "right";
      return { tabId: Number(el.dataset.tabId), side };
    }
  }
  return null;
}

function clearDropIndicators() {
  tabScrollArea
    .querySelectorAll(".tab-drop-before, .tab-drop-after")
    .forEach((el) => {
      el.classList.remove("tab-drop-before", "tab-drop-after");
    });
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════

function resolveInput(raw) {
  const input = raw.trim();
  if (!input) return null;
  if (input.startsWith("about:") || input.startsWith("file://")) return input;
  // Has protocol already
  if (/^https?:\/\//i.test(input)) return input;
  // Looks like a domain: contains a dot and no spaces
  if (/^[^\s]+\.[^\s]{2,}$/.test(input) && !input.includes(" ")) {
    return "https://" + input;
  }
  // Treat as DuckDuckGo search
  return "https://duckduckgo.com/?q=" + encodeURIComponent(input);
}

function navigateTo(raw) {
  traceKernel("navigateTo:start", { raw, state: snapshotKernelState() });
  const url = resolveInput(raw);
  if (!url) return;
  const tab = getTab(activeTabId);
  if (!tab) return;
  const wv = tab.webview || ensureWebviewForTab(tab);
  if (!wv) return;
  tab.url = url;
  tab.initialized = true;
  if (addressBar) addressBar.value = url;
  try {
    wv.loadURL(url);
  } catch {
    // Some freshly-created webviews (especially headless sessions) can throw until dom-ready.
    // Setting src is safe pre-dom-ready and lets Electron navigate as soon as guest is ready.
    try {
      wv.src = url;
    } catch {
      try {
        wv.setAttribute("src", url);
      } catch {
        /* ignore */
      }
    }
  }
  setLoading(true);
  updateSecurityIcon(url);
  hideError();
  traceKernel("navigateTo:end", { raw, resolvedUrl: url, state: snapshotKernelState() });
}

function updateNavButtons() {
  if (USE_REACT_NAV_UI) return;
  try {
    backBtn.disabled = !browserFrame.canGoBack();
    forwardBtn.disabled = !browserFrame.canGoForward();
    traceKernel("updateNavButtons", {
      backDisabled: backBtn?.disabled,
      forwardDisabled: forwardBtn?.disabled,
      hasBrowserFrame: !!browserFrame,
      browserFrameSession: browserFrame?.dataset?.orionSessionId || null,
      browserFrameTab: browserFrame?.dataset?.orionTabId || null,
    });
  } catch {
    /* webview not ready */
    traceKernel("updateNavButtons:webview_not_ready", {
      hasBrowserFrame: !!browserFrame,
      browserFrameId: browserFrame?.id || null,
    });
  }
}

function setLoading(on) {
  isLoading = on;
  const tab = getTab(activeTabId);
  if (tab) {
    tab.loading = on;
    renderTabs();
  }
  if (on) {
    if (loadingOverlay) {
      const st = loadingOverlay.querySelector(".loading-spotlight-stage");
      if (st) shuffleLoadingSpotlightStage(st);
      loadingOverlay.style.display = "flex";
    }
    if (!USE_REACT_NAV_UI && reloadBtn) {
      reloadBtn.classList.add("stop-mode");
      reloadBtn.title = "Stop (Esc)";
      reloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
  } else {
    if (loadingOverlay) loadingOverlay.style.display = "none";
    if (!USE_REACT_NAV_UI && reloadBtn) {
      reloadBtn.classList.remove("stop-mode");
      reloadBtn.title = "Reload (F5)";
      reloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.657 6A6 6 0 1 0 12 11.196" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 2.5V6.5H10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
  }
}

function updateSecurityIcon(url) {
  const isSecure = url && url.startsWith("https://");
  const isLocal =
    url && (url.startsWith("about:") || url.startsWith("file://"));
  const tip = isSecure
    ? "Secure connection"
    : isLocal
      ? "Local page"
      : "Not secure";
  if (securityIcon) {
    securityIcon.className =
      "security-icon" + (isSecure ? " secure" : isLocal ? " local" : " insecure");
    securityIcon.title = tip;
  }
  if (statusSecurity) {
    statusSecurity.textContent = isSecure
      ? "Secure"
      : isLocal
        ? ""
        : "Not secure";
  }
  if (statusSecurityChip) {
    const state = isSecure ? "secure" : isLocal ? "local" : "insecure";
    statusSecurityChip.dataset.connection = state;
    statusSecurityChip.hidden = Boolean(isLocal);
    statusSecurityChip.title = tip;
  }
}

function showError(desc) {
  errorPage.style.display = "flex";
  errorDesc.textContent = desc || "The page could not be loaded.";
  browserFrame.style.visibility = "hidden";
}

function hideError() {
  errorPage.style.display = "none";
  browserFrame.style.visibility = "visible";
}

function setupNavEvents() {
  if (!USE_REACT_NAV_UI) {
    backBtn.onclick = () => browserFrame.canGoBack() && browserFrame.goBack();
    forwardBtn.onclick = () =>
      browserFrame.canGoForward() && browserFrame.goForward();

    reloadBtn.onclick = () => {
      if (isLoading) {
        browserFrame.stop();
        setLoading(false);
      } else {
        browserFrame.reload();
        setLoading(true);
      }
    };

    homeBtn.onclick = () => navigateTo(homePage);

    // Address bar
    addressBar.addEventListener("focus", () => {
      addressBar.select();
      addressWrapper.classList.add("focused");
    });
    addressBar.addEventListener("blur", () => {
      addressWrapper.classList.remove("focused");
    });
    addressBar.addEventListener("input", () => {
      clearAddressBtn.style.display = addressBar.value ? "flex" : "none";
    });
    addressBar.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        navigateTo(addressBar.value);
        addressBar.blur();
      }
      if (e.key === "Escape") {
        addressBar.blur();
      }
    });
    clearAddressBtn.onclick = () => {
      addressBar.value = "";
      clearAddressBtn.style.display = "none";
      addressBar.focus();
    };
  }

  errorRetryBtn.onclick = () => {
    hideError();
    browserFrame.reload();
    setLoading(true);
  };
}

// ═══════════════════════════════════════════════════════════
//  WEBVIEW EVENTS
// ═══════════════════════════════════════════════════════════

function setupWebviewEvents(wv) {
  if (!wv || webviewsWithListeners.has(wv)) return;
  webviewsWithListeners.add(wv);

  wv.addEventListener(
    "dom-ready",
    () => {
      webviewDomReady.add(wv);
      try {
        wv.setZoomLevel(zoomLevel);
      } catch {
        /* ignore */
      }
      const tid = Number(wv.dataset.orionTabId);
      const sid = String(wv.dataset.orionSessionId || activeSessionId);
      const tab = getTabInSession(sid, tid);
      if (tab && tab.url && tab.url !== "about:blank") {
        window.setTimeout(() => {
          if (!isActiveWebview(wv)) return;
          let cur = "";
          try {
            cur = wv.getURL ? wv.getURL() : "";
          } catch {
            /* ignore */
          }
          if ((!cur || cur === "about:blank") && tab.url && tab.url !== "about:blank") {
            try {
              wv.loadURL(tab.url);
            } catch {
              try {
                wv.src = tab.url;
              } catch {
                /* ignore */
              }
            }
          }
        }, 120);
      }
      wv
        .insertCSS(
          `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
        )
        .catch(() => {});
    },
    { once: true },
  );

  wv.addEventListener("did-start-loading", () => {
    if (!isActiveWebview(wv)) return;
    setLoading(true);
    hideError();
    wv
      .insertCSS(
        `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
      )
      .catch(() => {});
  });

  wv.addEventListener("did-stop-loading", () => {
    if (!isActiveWebview(wv)) return;
    setLoading(false);
    updateNavButtons();
  });

  wv.addEventListener("did-finish-load", () => {
    webviewDidFinishLoad.add(wv);
    if (isActiveWebview(wv)) {
      setLoading(false);
      updateNavButtons();
    }
    wv
      .insertCSS(
        `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
      )
      .catch(() => {});
    wv
      .executeJavaScript(
        `(function() {
          const links = [...document.querySelectorAll('link[rel*="icon"]')];
          const best = links.find(l => l.sizes && l.sizes.value === '32x32') || links[0];
          return best ? best.href : null;
        })()`,
      )
      .then((faviconUrl) => {
        const tid = Number(wv.dataset.orionTabId);
        const sid = String(wv.dataset.orionSessionId || activeSessionId);
        const t = getTabInSession(sid, tid);
        if (t && faviconUrl && !t.favicon) {
          t.favicon = faviconUrl;
          renderTabs();
        }
      })
      .catch(() => {});
  });

  wv.addEventListener("did-navigate", (e) => {
    const url = e.url || wv.getURL();
    const tid = Number(wv.dataset.orionTabId);
    const sid = String(wv.dataset.orionSessionId || activeSessionId);
    const t = getTabInSession(sid, tid);
    if (t) {
      t.url = url;
      t.favicon = null;
    }
    if (url && currentProfile) {
      const title = (t && t.title) || url;
      addHistoryEntry(url, title);
      if (isActiveWebview(wv)) updateBookmarkStar(url);
    }
    if (isActiveWebview(wv)) {
      if (addressBar) addressBar.value = url;
      if (clearAddressBtn) clearAddressBtn.style.display = url ? "flex" : "none";
      updateNavButtons();
      updateSecurityIcon(url);
      hideError();
    }
  });

  wv.addEventListener("did-navigate-in-page", (e) => {
    const url = e.url || wv.getURL();
    const tid = Number(wv.dataset.orionTabId);
    const sid = String(wv.dataset.orionSessionId || activeSessionId);
    const t = getTabInSession(sid, tid);
    if (t) t.url = url;
    if (isActiveWebview(wv)) {
      if (addressBar) addressBar.value = url;
      if (clearAddressBtn) clearAddressBtn.style.display = url ? "flex" : "none";
      updateNavButtons();
    }
  });

  wv.addEventListener("page-title-updated", (e) => {
    const tid = Number(wv.dataset.orionTabId);
    const sid = String(wv.dataset.orionSessionId || activeSessionId);
    const t = getTabInSession(sid, tid);
    if (t && e.title) {
      t.title = e.title;
      renderTabs();
    }
    const url = wv.getURL ? wv.getURL() : "";
    if (url && e.title && currentProfile) {
      const p = getProfile();
      const h = p.history.find((x) => x.url === url);
      if (h) {
        h.title = e.title;
        saveProfile();
      }
    }
  });

  wv.addEventListener("page-favicon-updated", (e) => {
    const tid = Number(wv.dataset.orionTabId);
    const sid = String(wv.dataset.orionSessionId || activeSessionId);
    const t = getTabInSession(sid, tid);
    if (t && e.favicons && e.favicons.length > 0) {
      t.favicon = e.favicons[0];
      renderTabs();
    }
  });

  wv.addEventListener("did-fail-load", (e) => {
    if (e.errorCode === -3) return;
    if (!isActiveWebview(wv)) return;
    setLoading(false);
    showError(`${e.errorDescription} (${e.errorCode})`);
  });

  wv.addEventListener("crashed", () => {
    if (!isActiveWebview(wv)) return;
    setLoading(false);
    showError("The page crashed. Click Try Again to reload.");
    addBotMessage(
      "⚠️ The browser tab crashed. I've shown an error page — click Try Again.",
    );
  });

  wv.addEventListener("update-target-url", (e) => {
    if (isActiveWebview(wv)) statusText.textContent = e.url || "";
  });

  wv.addEventListener("new-window", (e) => {
    e.preventDefault();
    createTab(e.url);
  });

  wv.addEventListener("found-in-page", (e) => {
    if (!isActiveWebview(wv)) return;
    const { activeMatchOrdinal, matches } = e.result;
    const text = matches > 0 ? `${activeMatchOrdinal}/${matches}` : "No results";
    findMatchDisplay = text;
    if (!USE_REACT_NAV_UI && findCount) {
      findCount.textContent = text;
      findCount.style.color = matches > 0 ? "var(--accent)" : "var(--danger)";
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  SCREENSHOT
// ═══════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────

// Returns the full webview capture as an HTMLImageElement (physical pixels)
async function captureFullImage() {
  const id = browserFrame.getWebContentsId();
  const result = await window.electronAPI.captureWebview(id, null);
  if (!result.success) throw new Error(result.error || "capture failed");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = result.dataUrl;
  });
}

// Crops an HTMLImageElement to a rect defined in webview CSS px.
// scaleX/scaleY = img.naturalWidth / webviewCSSWidth (physical px per CSS px)
function cropImage(img, cssX, cssY, cssW, cssH, scaleX, scaleY) {
  const px = Math.max(0, Math.round(cssX * scaleX));
  const py = Math.max(0, Math.round(cssY * scaleY));
  const pw = Math.max(1, Math.round(cssW * scaleX));
  const ph = Math.max(1, Math.round(cssH * scaleY));
  // clamp to image bounds
  const sw = Math.min(pw, img.naturalWidth - px);
  const sh = Math.min(ph, img.naturalHeight - py);
  if (sw <= 0 || sh <= 0) throw new Error("crop out of bounds");
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(img, px, py, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

// Returns the pixel-per-CSS-px scale of the captured image vs the webview element size
async function getCaptureScale(img) {
  const rect = browserFrame.getBoundingClientRect();
  // img.naturalWidth is physical px of the webview output
  // rect.width is the renderer CSS px size of the <webview> element
  // Their ratio gives us physical px per renderer CSS px
  return {
    x: img.naturalWidth / rect.width,
    y: img.naturalHeight / rect.height,
  };
}

// ── Screenshot dropdown ──────────────────────────────────────
let screenshotMenuOpen = false;

if (screenshotBtn) {
  screenshotBtn.onclick = (e) => {
    e.stopPropagation();
    toggleScreenshotMenu();
  };
}

function getScreenshotMenuAnchor() {
  const reactBtn = document.getElementById("reactScreenshotNavBtn");
  if (reactBtn) {
    const r = reactBtn.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return reactBtn;
  }
  return screenshotBtn || null;
}

function toggleScreenshotMenu() {
  const existing = document.getElementById("screenshotMenu");
  if (existing) {
    existing.remove();
    screenshotMenuOpen = false;
    return;
  }
  screenshotMenuOpen = true;

  const menu = document.createElement("div");
  menu.id = "screenshotMenu";
  menu.className = "screenshot-menu";
  menu.innerHTML = `
    <button class="ss-menu-item" id="ssViewport">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
      Viewport
    </button>
    <button class="ss-menu-item" id="ssFullPage">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 5h12M1 9h12" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.5"/></svg>
      Full Page
    </button>
    <button class="ss-menu-item" id="ssSelect">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 4V1h3M10 1h3v3M13 10v3h-3M4 13H1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/></svg>
      Select Area
    </button>`;

  document.body.appendChild(menu);
  const anchor = getScreenshotMenuAnchor();
  const btnRect = anchor
    ? anchor.getBoundingClientRect()
    : { left: 12, bottom: 56, width: 0, height: 0 };
  const menuWidth = menu.offsetWidth || 220;
  let left = btnRect.left;
  if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
  if (left < 8) left = 8;
  menu.style.top = `${Math.min(btnRect.bottom + 6, window.innerHeight - 120)}px`;
  menu.style.left = `${left}px`;

  document.getElementById("ssViewport").onclick = () => {
    closeScreenshotMenu();
    takeScreenshot("viewport");
  };
  document.getElementById("ssFullPage").onclick = () => {
    closeScreenshotMenu();
    takeScreenshot("fullpage");
  };
  document.getElementById("ssSelect").onclick = () => {
    closeScreenshotMenu();
    takeScreenshotSelect();
  };

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", closeScreenshotMenu, { once: true });
  }, 0);
}

function closeScreenshotMenu() {
  document.getElementById("screenshotMenu")?.remove();
  screenshotMenuOpen = false;
}

function waitForWebviewDomReady(wv, timeoutMs = 8000) {
  if (!wv) return Promise.reject(new Error("No webview"));
  if (webviewDomReady.has(wv) || webviewDidFinishLoad.has(wv)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try {
        // eslint-disable-next-line no-console
        console.warn("[kernel] waitForWebviewDomReady timeout");
      } catch {
        /* ignore */
      }
      reject(new Error("dom-ready timeout"));
    }, timeoutMs);

    const onReady = () => {
      window.clearTimeout(timer);
      webviewDomReady.add(wv);
      resolve(undefined);
    };
    const onFinish = () => {
      window.clearTimeout(timer);
      webviewDidFinishLoad.add(wv);
      resolve(undefined);
    };

    // Once listener so we don't leak if screenshot is called multiple times.
    wv.addEventListener("dom-ready", onReady, { once: true });
    wv.addEventListener("did-finish-load", onFinish, { once: true });
  });
}

async function takeScreenshot(mode = "viewport") {
  try {
    if (!browserFrame) throw new Error("No webview attached");
    await waitForWebviewDomReady(browserFrame, 8000);
    showToast("📸 Capturing...");
    const img = await captureFullImage();
    let dataUrl;
    if (mode === "fullpage") {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      dataUrl = canvas.toDataURL("image/png");
    } else {
      // Viewport: crop to exactly the webview element bounds (0,0,w,h in CSS px)
      const rect = browserFrame.getBoundingClientRect();
      const scale = await getCaptureScale(img);
      dataUrl = cropImage(img, 0, 0, rect.width, rect.height, scale.x, scale.y);
    }
    const saved = await window.electronAPI.saveScreenshot(dataUrl);
    if (saved.success) {
      showToast(`✅ Saved: ${saved.filename}`);
      addScreenshotMessage(dataUrl, saved.filename);
    } else {
      showToast("❌ Screenshot failed");
    }
  } catch (err) {
    showToast("❌ Screenshot failed");
    console.error(err);
  }
}

function takeScreenshotSelect() {
  showToast("🖱 Drag to select area...");
  addBotMessage(
    "🖱 **Select Area** — drag a rectangle on the page. Press Esc to cancel.",
  );

  // Overlay in the RENDERER on top of the webview — coords are renderer CSS pixels
  const wvRect = browserFrame.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.style.cssText = `position:fixed;left:${wvRect.left}px;top:${wvRect.top}px;width:${wvRect.width}px;height:${wvRect.height}px;z-index:99999;cursor:crosshair;`;
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;border:2px solid #7c6af7;background:rgba(124,106,247,0.12);pointer-events:none;display:none;box-sizing:border-box;";
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let sx,
    sy,
    dragging = false;

  overlay.addEventListener("mousedown", (e) => {
    sx = e.clientX - wvRect.left;
    sy = e.clientY - wvRect.top;
    dragging = true;
    box.style.display = "block";
    box.style.left = sx + "px";
    box.style.top = sy + "px";
    box.style.width = "0";
    box.style.height = "0";
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const cx = e.clientX - wvRect.left;
    const cy = e.clientY - wvRect.top;
    const x = Math.min(cx, sx),
      y = Math.min(cy, sy);
    const w = Math.abs(cx - sx),
      h = Math.abs(cy - sy);
    box.style.left = x + "px";
    box.style.top = y + "px";
    box.style.width = w + "px";
    box.style.height = h + "px";
  });

  overlay.addEventListener("mouseup", async (e) => {
    dragging = false;
    overlay.remove();
    document.removeEventListener("keydown", onEsc);

    const cx = e.clientX - wvRect.left;
    const cy = e.clientY - wvRect.top;
    const x = Math.min(cx, sx),
      y = Math.min(cy, sy);
    const w = Math.abs(cx - sx),
      h = Math.abs(cy - sy);
    if (w < 4 || h < 4) {
      addBotMessage("🖱 Selection too small, cancelled.");
      return;
    }

    try {
      const img = await captureFullImage();
      const scale = await getCaptureScale(img);
      const dataUrl = cropImage(img, x, y, w, h, scale.x, scale.y);
      const saved = await window.electronAPI.saveScreenshot(dataUrl);
      if (saved.success) {
        showToast(`✅ Saved: ${saved.filename}`);
        addScreenshotMessage(dataUrl, saved.filename);
      } else showToast("❌ Save failed");
    } catch (err) {
      showToast("❌ Capture failed");
      console.error(err);
    }
  });

  function onEsc(e) {
    if (e.key !== "Escape") return;
    overlay.remove();
    document.removeEventListener("keydown", onEsc);
    addBotMessage("🖱 Selection cancelled.");
  }
  document.addEventListener("keydown", onEsc);
}

// ═══════════════════════════════════════════════════════════
//  ZOOM
// ═══════════════════════════════════════════════════════════

function setupZoom() {
  if (!USE_REACT_NAV_UI) {
    zoomInBtn.onclick = () => applyZoom(zoomLevel + 1);
    zoomOutBtn.onclick = () => applyZoom(zoomLevel - 1);
    // Show correct % in UI immediately
    zoomLevelEl.textContent = Math.round(100 * Math.pow(1.2, zoomLevel)) + "%";
  }
}

function applyZoom(level) {
  zoomLevel = Math.max(-5, Math.min(5, level));
  localStorage.setItem("zoomLevel", String(zoomLevel));
  tabs.forEach((t) => {
    if (t.webview) {
      try {
        t.webview.setZoomLevel(zoomLevel);
      } catch {
        /* ignore */
      }
    }
  });
  const pct = Math.round(100 * Math.pow(1.2, zoomLevel));
  if (zoomLevelEl) {
    zoomLevelEl.textContent = pct + "%";
    zoomLevelEl.classList.add("zoom-pop");
    setTimeout(() => zoomLevelEl.classList.remove("zoom-pop"), 300);
  }
}

// ═══════════════════════════════════════════════════════════
//  FIND IN PAGE
// ═══════════════════════════════════════════════════════════

function setupFindBar() {
  if (USE_REACT_NAV_UI) return;

  findBtn.onclick = toggleFind;
  findClose.onclick = closeFind;

  findInput.addEventListener("input", () => {
    const q = findInput.value;
    if (q) browserFrame.findInPage(q);
    else browserFrame.stopFindInPage("clearSelection");
  });

  findInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") findNext.click();
    if (e.key === "Escape") closeFind();
  });

  findPrev.onclick = () => {
    if (findInput.value)
      browserFrame.findInPage(findInput.value, {
        forward: false,
        findNext: true,
      });
  };
  findNext.onclick = () => {
    if (findInput.value)
      browserFrame.findInPage(findInput.value, {
        forward: true,
        findNext: true,
      });
  };
}

function toggleFind() {
  findActive = !findActive;
  if (!USE_REACT_NAV_UI) {
    findBar.style.display = findActive ? "flex" : "none";
  }
  if (findActive) {
    if (!USE_REACT_NAV_UI) {
      findInput.focus();
      findInput.select();
    } else {
      window.dispatchEvent(new CustomEvent("react-nav-focus-find"));
    }
  } else closeFind();
}

function closeFind() {
  findActive = false;
  if (!USE_REACT_NAV_UI) {
    findBar.style.display = "none";
    findCount.textContent = "";
    findInput.value = "";
  }
  lastFindQuery = "";
  findMatchDisplay = "";
  tabs.forEach((t) => {
    if (t.webview) {
      try {
        t.webview.stopFindInPage("clearSelection");
      } catch {
        /* ignore */
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  DEVTOOLS
// ═══════════════════════════════════════════════════════════

devtoolsBtn.onclick = () => {
  if (browserFrame.isDevToolsOpened()) browserFrame.closeDevTools();
  else browserFrame.openDevTools();
};

// ═══════════════════════════════════════════════════════════
//  TITLE BAR
// ═══════════════════════════════════════════════════════════

function setupTitleBar() {
  tbMinimize.onclick = () => window.electronAPI.windowMinimize();
  tbMaximize.onclick = () => window.electronAPI.windowMaximize();
  tbClose.onclick = () => window.electronAPI.windowClose();

  if (titlebarBrowserBtn) {
    titlebarBrowserBtn.onclick = () => enterBrowserWorkspace();
  }
  if (titlebarIntelligentBtn) {
    titlebarIntelligentBtn.onclick = () => enterIntelligentWorkspace();
  }

  window.electronAPI.onWindowStateChanged((state) => {
    tbMaximize.title = state === "maximized" ? "Restore" : "Maximize";
  });
}

// ═══════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════

function setupTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  applyTheme(saved);
}

function applyTheme(name) {
  document.body.className = "theme-" + name;
  localStorage.setItem("theme", name);
  document.querySelectorAll(".theme-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === name);
  });
}

// ═══════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════

function setupSettings() {
  if (!settingsPanel || !settingsOverlay) {
    if (settingsBtn)
      settingsBtn.onclick = () => {
        toggleSidePanel("browserSettingsPanel");
      };
    return;
  }
  const openSettings = () => {
    settingsPanel.style.display = "flex";
    settingsOverlay.style.display = "block";
    homePageInput.value = homePage;
    document.getElementById("appContainer")?.setAttribute("data-settings-open", "");
    document.getElementById("webviewOverlayHost")?.setAttribute("aria-hidden", "false");
    settingsPanel.removeAttribute("aria-hidden");
    settingsOverlay.setAttribute("aria-hidden", "false");
  };
  const closeSettings = () => {
    settingsPanel.style.display = "none";
    settingsOverlay.style.display = "none";
    document.getElementById("appContainer")?.removeAttribute("data-settings-open");
    document.getElementById("webviewOverlayHost")?.setAttribute("aria-hidden", "true");
    settingsPanel.setAttribute("aria-hidden", "true");
    settingsOverlay.setAttribute("aria-hidden", "true");
  };

  if (settingsBtn) settingsBtn.onclick = openSettings;
  if (settingsBtnChat) settingsBtnChat.onclick = openSettings;
  if (closeSettingsBtn) closeSettingsBtn.onclick = closeSettings;
  settingsOverlay.onclick = closeSettings;

  document.querySelectorAll(".theme-card").forEach((btn) => {
    btn.onclick = () => applyTheme(btn.dataset.theme);
  });

  homePageInput.addEventListener("change", () => {
    const val = homePageInput.value.trim();
    if (val) {
      homePage = normalizeHomePageUrl(val);
      localStorage.setItem("homePage", homePage);
      homePageInput.value = homePage;
    }
  });

  // Import functionality
  checkImportBtn.onclick = checkAvailableData;
  startImportBtn.onclick = startImport;
  browserSelect.onchange = updateImportUI;
}

async function checkAvailableData() {
  try {
    checkImportBtn.disabled = true;
    checkImportBtn.textContent = "Checking...";

    const stats = await window.electronAPI.getBrowserStats();

    chromeStats.textContent = stats.chrome.available
      ? `${stats.chrome.bookmarks} bookmarks, ${stats.chrome.history} history, ${stats.chrome.cookies} cookies`
      : "Not found";

    firefoxStats.textContent = stats.firefox.available
      ? `${stats.firefox.bookmarks} bookmarks, ${stats.firefox.history} history, ${stats.firefox.cookies} cookies`
      : "Not found";

    importStats.style.display = "block";
    startImportBtn.disabled = false;

  } catch (error) {
    console.error("Failed to check browser data:", error);
    showToast("Failed to check browser data", "error");
  } finally {
    checkImportBtn.disabled = false;
    checkImportBtn.textContent = "Check Available Data";
  }
}

async function startImport() {
  const browser = browserSelect.value;
  if (!browser) {
    showToast("Please select a browser", "warning");
    return;
  }

  const dataTypes = [];
  if (importBookmarks.checked) dataTypes.push("bookmarks");
  if (importHistory.checked) dataTypes.push("history");
  if (importCookies.checked) dataTypes.push("cookies");

  if (dataTypes.length === 0) {
    showToast("Please select at least one data type", "warning");
    return;
  }

  try {
    startImportBtn.disabled = true;
    importProgress.style.display = "block";
    progressFill.style.width = "0%";
    progressText.textContent = "Starting import...";

    // Simulate progress updates
    const progressSteps = [
      "Preparing import...",
      "Reading browser data...",
      "Processing bookmarks...",
      "Processing history...",
      "Processing cookies...",
      "Saving data...",
      "Import complete!"
    ];

    for (let i = 0; i < progressSteps.length; i++) {
      progressText.textContent = progressSteps[i];
      progressFill.style.width = `${((i + 1) / progressSteps.length) * 100}%`;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const result = await window.electronAPI.importBrowserData({ browser, dataTypes });

    if (result.success) {
      showToast(`Successfully imported ${result.results.bookmarks + result.results.history + result.results.cookies} items`, "success");
      importProgress.style.display = "none";
      startImportBtn.disabled = false;
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error("Import failed:", error);
    showToast("Import failed: " + error.message, "error");
    importProgress.style.display = "none";
    startImportBtn.disabled = false;
  }
}

function updateImportUI() {
  const browser = browserSelect.value;
  startImportBtn.disabled = !browser;
  if (browser) {
    importStats.style.display = "none";
  }
}

// ── First Run Wizard ──────────────────────────────────────────
async function checkFirstRun() {
  const hasRunBefore = localStorage.getItem("hasRunBefore");
  if (!hasRunBefore) {
    await showFirstRunWizard();
    localStorage.setItem("hasRunBefore", "true");
  }
}

async function showFirstRunWizard() {
  try {
    // Check available browser data
    const stats = await window.electronAPI.getBrowserStats();

    chromePreview.textContent = stats.chrome.available
      ? `${stats.chrome.bookmarks} bookmarks, ${stats.chrome.history} history items`
      : "Chrome not found or no data available";

    firefoxPreview.textContent = stats.firefox.available
      ? `${stats.firefox.bookmarks} bookmarks, ${stats.firefox.history} history items`
      : "Firefox not found or no data available";

    // Show the wizard
    firstRunOverlay.style.display = "flex";

    // Setup event listeners
    importOptionBtns.forEach(btn => {
      btn.onclick = () => quickImport(btn.dataset.browser);
    });

    skipImportBtn.onclick = () => {
      firstRunOverlay.style.display = "none";
    };

  } catch (error) {
    console.error("Failed to show first-run wizard:", error);
    // Continue without wizard if there's an error
  }
}

async function quickImport(browser) {
  try {
    // Disable all buttons
    importOptionBtns.forEach(btn => btn.disabled = true);
    skipImportBtn.disabled = true;

    // Show progress on the selected button
    const selectedBtn = document.querySelector(`[data-browser="${browser}"] .import-option-btn`);
    selectedBtn.textContent = "Importing...";
    selectedBtn.style.background = "var(--text3)";

    // Perform import with all data types
    const result = await window.electronAPI.importBrowserData({
      browser,
      dataTypes: ["bookmarks", "history", "cookies"]
    });

    if (result.success) {
      selectedBtn.textContent = "Import Complete!";
      selectedBtn.style.background = "var(--success)";

      // Close wizard after a delay
      setTimeout(() => {
        firstRunOverlay.style.display = "none";
        showToast(`Successfully imported ${result.results.bookmarks + result.results.history + result.results.cookies} items from ${browser}`, "success");
      }, 2000);
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error("Quick import failed:", error);
    showToast("Import failed: " + error.message, "error");

    // Re-enable buttons
    importOptionBtns.forEach(btn => {
      btn.disabled = false;
      btn.textContent = `Import from ${btn.dataset.browser === 'chrome' ? 'Chrome' : 'Firefox'}`;
      btn.style.background = "";
    });
    skipImportBtn.disabled = false;
  }
}

async function loadSystemInfo() {
  try {
    const info = await window.electronAPI.getSystemInfo();
    document.getElementById("siElectron").textContent = info.version || "—";
    document.getElementById("siChrome").textContent = info.chrome || "—";
    document.getElementById("siNode").textContent = info.node || "—";
    document.getElementById("siMemory").textContent = info.memory || "—";
    document.getElementById("siPlatform").textContent = info.platform || "—";
    document.getElementById("siCpus").textContent = info.cpus || "—";
  } catch {}
}

// ═══════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === "Escape") {
      const hub = document.getElementById("toolsHubRoot");
      if (hub && hub.classList.contains("tools-hub--open")) {
        closeToolsHub();
        e.preventDefault();
        return;
      }
    }

    if (ctrl && e.key === "t") {
      e.preventDefault();
      createTab();
    }
    if (ctrl && e.key === "w") {
      e.preventDefault();
      closeTab(activeTabId);
    }
    if (ctrl && e.key === "l") {
      e.preventDefault();
      if (USE_REACT_NAV_UI) {
        window.dispatchEvent(new CustomEvent("react-nav-focus-address"));
      } else {
        addressBar.focus();
        addressBar.select();
      }
    }
    if (ctrl && e.key === "f") {
      e.preventDefault();
      if (USE_REACT_NAV_UI) {
        window.dispatchEvent(new CustomEvent("react-nav-toggle-find"));
      } else if (!findActive) toggleFind();
      else findInput.focus();
    }
    if ((ctrl && e.key === "r") || e.key === "F5") {
      e.preventDefault();
      browserFrame.reload();
      setLoading(true);
    }
    if (ctrl && e.key === "=") {
      e.preventDefault();
      applyZoom(zoomLevel + 1);
    }
    if (ctrl && e.key === "-") {
      e.preventDefault();
      applyZoom(zoomLevel - 1);
    }
    if (ctrl && e.key === "0") {
      e.preventDefault();
      applyZoom(0);
    }
    if (ctrl && e.shiftKey && e.key === "S") {
      e.preventDefault();
      toggleScreenshotMenu();
    }
    if (ctrl && e.shiftKey && e.key === "A") {
      e.preventDefault();
      setChatOpen(!chatOpen);
    }
    if (e.key === "F12") {
      e.preventDefault();
      if (USE_REACT_NAV_UI) {
        if (browserFrame.isDevToolsOpened()) browserFrame.closeDevTools();
        else browserFrame.openDevTools();
      } else {
        devtoolsBtn.click();
      }
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      if (USE_REACT_NAV_UI) browserFrame.canGoBack() && browserFrame.goBack();
      else backBtn.click();
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      if (USE_REACT_NAV_UI) browserFrame.canGoForward() && browserFrame.goForward();
      else forwardBtn.click();
    }
    if (e.key === "Escape" && findActive) {
      closeFind();
      if (USE_REACT_NAV_UI) {
        window.dispatchEvent(new CustomEvent("react-nav-close-find"));
      }
    }
    if (e.key === "Escape") {
      TOOLS.filter((t) => t.active).forEach((t) => deactivateTool(t.id));
    }
    if (e.key === "Delete") {
      const selected = chatMessages.querySelectorAll(".msg-selected");
      if (selected.length) {
        selected.forEach((el) => el.remove());
        showToast(
          `🗑 Deleted ${selected.length} message${selected.length > 1 ? "s" : ""}`,
        );
      }
    }
    if (ctrl && e.key === "Backspace") {
      e.preventDefault();
      const imgs = chatMessages.querySelectorAll(".screenshot-bubble");
      if (imgs.length) {
        imgs.forEach((el) => el.closest(".message")?.remove());
        showToast(
          `🗑 Cleared ${imgs.length} screenshot${imgs.length > 1 ? "s" : ""}`,
        );
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  CHAT & BROWSER AUTOMATION
// ═══════════════════════════════════════════════════════════

function setupChat() {
  const chatInputEl = document.getElementById("chatInput");
  const chatInputMd = document.getElementById("chatInputMd");

  function resizeInput() {
    chatInputEl.style.height = "auto";
    chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + "px";
  }

  // Keep md content in sync while typing (hidden, but ready for blur)
  function updatePreview() {
    chatInputMd.innerHTML = chatInputEl.value.trim()
      ? mdToHtml(chatInputEl.value)
      : "";
    resizeInput();
  }

  // On blur: hide textarea, show rendered md div at same height
  function showPreview() {
    if (!chatInputEl.value.trim()) return;
    chatInputMd.style.height =
      chatInputEl.style.height || chatInputEl.offsetHeight + "px";
    chatInputEl.style.display = "none";
    chatInputMd.style.display = "block";
  }

  // On click md: hide md, show textarea, focus
  function showEditor() {
    chatInputMd.style.display = "none";
    chatInputEl.style.display = "block";
    chatInputEl.focus();
  }

  chatInputEl.addEventListener("input", updatePreview);
  chatInputEl.addEventListener("blur", showPreview);
  chatInputMd.addEventListener("click", showEditor);

  sendBtn.onclick = submitChat;
  chatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    }
  });

  clearChatBtn.onclick = () => {
    if (typeof window.__aiChatClearConversation === "function") window.__aiChatClearConversation();
    else clearActiveConversationMessages();
  };
}

function submitChat() {
  if (typeof window.__aiChatSubmit === "function") {
    const chatInputEl = document.getElementById("chatInput");
    const chatInputMd = document.getElementById("chatInputMd");
    const text = (chatInputEl?.value ?? "").trim();
    if (!text) return;
    window.__aiChatSubmit(text);
    if (chatInputEl) {
      chatInputEl.value = "";
      chatInputEl.style.height = "auto";
      chatInputEl.style.display = "block";
    }
    if (chatInputMd) {
      chatInputMd.style.display = "none";
      chatInputMd.innerHTML = "";
    }
    return;
  }
  const chatInputEl = document.getElementById("chatInput");
  const chatInputMd = document.getElementById("chatInputMd");
  const text = chatInputEl.value.trim();
  if (!text) return;
  addUserMessage(text);
  chatInputEl.value = "";
  chatInputEl.style.height = "auto";
  chatInputEl.style.display = "block";
  chatInputMd.style.display = "none";
  chatInputMd.innerHTML = "";
  processCommand(text);
}

function getKernelAutomationContext() {
  const ensureSessionCommandReady = (sessionId) =>
    withSessionState(sessionId, () => {
      if (tabs.length === 0) {
        const id = ++tabCounter;
        tabs.push({
          id,
          publicId: generatePublicTabId(),
          url: homePage,
          title: "New Tab",
          favicon: null,
          loading: false,
          _new: false,
          initialized: false,
          webview: null,
        });
        activeTabId = id;
      }
      if (activeTabId == null && tabs.length > 0) activeTabId = tabs[0].id;
      const active = activeTabId != null ? getTab(activeTabId) : null;
      if (active) {
        if (!active.webview || !active.webview.isConnected) ensureWebviewForTab(active);
        const wv = active.webview;
        // For automation (especially headless / non-active session), the webview may sit at
        // about:blank until that session becomes visible. Force navigation if needed.
        if (wv && active.url && active.url !== "about:blank") {
          let cur = "";
          try {
            cur = wv.getURL ? wv.getURL() : "";
          } catch {
            /* ignore */
          }
          const needsNav = !cur || cur === "about:blank" || !urlsMatchForTabSwitch(cur, active.url);
          if (needsNav) {
            try {
              wv.loadURL(active.url);
            } catch {
              try {
                wv.src = active.url;
              } catch {
                try {
                  wv.setAttribute("src", active.url);
                } catch {
                  /* ignore */
                }
              }
            }
            active.initialized = true;
          }
        }
      }
      persistActiveSessionState();
    });

  const shouldUseBackground = (sessionId?: string): boolean => {
    if (!sessionId) return false;
    const s = getSession(sessionId);
    if (!s) return false;
    if (s.headless) return true;
    return sessionId !== activeSessionId;
  };

  const getBackgroundFrame = (sessionId: string) => ({
    executeJavaScript: async (code: string) => {
      await window.electronAPI.bgEnsureSession(sessionId);
      const r = await window.electronAPI.bgEval(sessionId, code);
      if (!r?.success) throw new Error(r?.error || "bg eval failed");
      return r.data;
    },
  });

  return {
    getBrowserFrame: (sessionId) => {
      if (sessionId && shouldUseBackground(sessionId)) return getBackgroundFrame(sessionId);
      if (sessionId) ensureSessionCommandReady(sessionId);
      return withSessionState(sessionId, () => browserFrame);
    },
    navigateTo: (raw, sessionId) => {
      const uiSessionId = activeSessionId;
      const targetSessionId = sessionId || activeSessionId;
      const url = resolveInput(raw);
      if (!url) return;
      if (sessionId && shouldUseBackground(sessionId)) {
        void window.electronAPI.bgEnsureSession(sessionId)
          .then(() => window.electronAPI.bgGoto(sessionId, url))
          .catch(() => {});
        return;
      }
      withSessionState(sessionId, () => {
        const tab = getTab(activeTabId);
        if (!tab) return;
        const wv = tab.webview || ensureWebviewForTab(tab);
        if (!wv) return;
        tab.url = url;
        tab.initialized = true;
        try {
          wv.loadURL(url);
        } catch {
          try {
            wv.src = url;
          } catch {
            try {
              wv.setAttribute("src", url);
            } catch {
              /* ignore */
            }
          }
        }
        // Only drive visible loading/nav UI for the actually open session.
        if (targetSessionId === uiSessionId) {
          if (addressBar) addressBar.value = url;
          setLoading(true);
          updateSecurityIcon(url);
          hideError();
        }
        persistActiveSessionState();
      });
    },
    resolveInput,
    reload: (sessionId) => {
      const uiSessionId = activeSessionId;
      const targetSessionId = sessionId || activeSessionId;
      withSessionState(sessionId, () => {
        if (browserFrame) {
          browserFrame.reload();
          if (targetSessionId === uiSessionId) setLoading(true);
        }
      });
    },
    goBack: (sessionId) =>
      withSessionState(sessionId, () => {
        if (browserFrame && browserFrame.canGoBack()) browserFrame.goBack();
      }),
    goForward: (sessionId) =>
      withSessionState(sessionId, () => {
        if (browserFrame && browserFrame.canGoForward()) browserFrame.goForward();
      }),
    createTab: (url, sessionId) =>
      withSessionState(sessionId, () => {
        if (url) createTab(url);
        else createTab();
      }),
    switchTab: (id, sessionId) =>
      withSessionState(sessionId, () => {
        switchTab(id);
      }),
    closeTabById: (id, sessionId) =>
      withSessionState(sessionId, () => {
        closeTab(id);
      }),
    getTabs: (sessionId) =>
      withSessionState(sessionId, () =>
        tabs.map((t) => ({
          id: t.id,
          publicId: t.publicId,
          title: t.title || "New Tab",
          url: t.url || "",
        })),
      ),
    getActiveTabId: (sessionId) => withSessionState(sessionId, () => activeTabId),
    applyZoom,
    getZoomLevel: () => zoomLevel,
    takeScreenshot: (mode, sessionId) => {
      if (sessionId && shouldUseBackground(sessionId)) {
        return (async () => {
          await window.electronAPI.bgEnsureSession(sessionId);
          const r = await window.electronAPI.bgScreenshot(sessionId);
          if (!r?.success) throw new Error(r?.error || "bg screenshot failed");
          const dataUrl = r?.data?.dataUrl || "";
          const saved = await window.electronAPI.saveScreenshot(dataUrl);
          if (saved.success) {
            showToast(`✅ Saved: ${saved.filename}`);
            addScreenshotMessage(dataUrl, saved.filename);
          } else {
            showToast("❌ Screenshot failed");
          }
        })();
      }
      if (sessionId) ensureSessionCommandReady(sessionId);
      return withSessionState(sessionId, () => takeScreenshot(mode));
    },
    createSession: (headless) => {
      const s = createSessionState(headless);
      return { id: s.id, headless: s.headless };
    },
    switchSession: (sessionId) => switchSession(sessionId),
    killSession: (sessionId) => killSessionById(sessionId),
    hasSession: (sessionId) => sessions.has(sessionId),
  };
}

async function processCommand(text) {
  const result = await dispatchAutomationLine(text, getKernelAutomationContext());
  if (result.message) addBotMessage(result.message);
}

// ── Conversations (persisted) ─────────────────────────────────
function ensureConversationBootstrap() {
  if (!convState.conversations.length) {
    const c = createNewConversation();
    convState.conversations.push(c);
    convState.activeConversationId = c.id;
    saveConversationState(convState);
  }
  if (
    !convState.activeConversationId ||
    !convState.conversations.some((c) => c.id === convState.activeConversationId)
  ) {
    convState.activeConversationId = convState.conversations[0].id;
  }
}

function getActiveConversation() {
  ensureConversationBootstrap();
  return convState.conversations.find((c) => c.id === convState.activeConversationId) || null;
}

function persistConvStateImmediate() {
  saveConversationState(convState);
}

function pushUserMessageToStore(text) {
  const c = getActiveConversation();
  if (!c) return;
  c.messages.push({ id: generateMessageId(), kind: "user", markdown: text });
  c.updatedAt = Date.now();
  const userMsgs = c.messages.filter((m) => m.kind === "user");
  if (userMsgs.length === 1) c.title = titleFromFirstLine(text);
  scheduleConvSave(convState);
  refreshChatHistoryList();
}

function pushAssistantMessageToStore(text) {
  const c = getActiveConversation();
  if (!c) return;
  c.messages.push({ id: generateMessageId(), kind: "assistant", markdown: text });
  c.updatedAt = Date.now();
  scheduleConvSave(convState);
  refreshChatHistoryList();
}

function pushScreenshotSentToStore(dataUrl, filename) {
  const c = getActiveConversation();
  if (!c) return;
  c.messages.push({
    id: generateMessageId(),
    kind: "screenshot_sent",
    dataUrl,
    filename,
  });
  c.updatedAt = Date.now();
  scheduleConvSave(convState);
  refreshChatHistoryList();
}

function pushPickerMessageToStore(sel, info, canFill, isCheckable) {
  const c = getActiveConversation();
  if (!c) return;
  c.messages.push({
    id: generateMessageId(),
    kind: "picker",
    selector: sel,
    tag: info.tag || "",
    type: info.type || "",
    text: (info.text || "").trim(),
    canFill: !!canFill,
    isCheckable: !!isCheckable,
  });
  c.updatedAt = Date.now();
  scheduleConvSave(convState);
  refreshChatHistoryList();
}

function refreshChatHistoryList() {
  if (typeof window !== "undefined" && window.__reactAiChatOwnsHistoryList) return;
  const list = document.getElementById("chatHistoryList");
  if (!list) return;
  convState.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  list.innerHTML = "";
  for (const c of convState.conversations) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "chat-history-row";
    if (c.id === convState.activeConversationId) row.classList.add("chat-history-row--active");
    row.dataset.conversationId = c.id;
    row.textContent = c.title || "Chat";
    row.title = c.title || "Chat";
    row.onclick = () => switchToConversation(c.id);
    list.appendChild(row);
  }
}

if (typeof window !== "undefined") {
  window.__kernelRefreshChatHistoryList = refreshChatHistoryList;
}

function switchToConversation(id) {
  if (id === convState.activeConversationId) return;
  convState.activeConversationId = id;
  persistConvStateImmediate();
  renderChatFromActiveConversation();
  refreshChatHistoryList();
}

function startNewConversation() {
  const c = createNewConversation();
  convState.conversations.unshift(c);
  convState.activeConversationId = c.id;
  persistConvStateImmediate();
  renderChatFromActiveConversation();
  refreshChatHistoryList();
}

function renderChatFromActiveConversation() {
  const c = getActiveConversation();
  if (!c || !chatMessages) return;
  chatMessages.innerHTML = "";
  for (const m of c.messages) {
    renderStoreMessageToDom(m);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderStoreMessageToDom(m) {
  if (m.kind === "user") {
    appendUserMessageDomOnly(m.markdown);
  } else if (m.kind === "assistant") {
    appendBotMessageDomOnly(m.markdown);
  } else if (m.kind === "screenshot_sent") {
    appendScreenshotSentDomOnly(m.dataUrl, m.filename);
  } else if (m.kind === "picker") {
    const info = {
      tag: m.tag,
      type: m.type,
      text: m.text,
    };
    showPickerActionPopup(m.selector, info, m.canFill, m.isCheckable, false);
  }
}

function appendUserMessageDomOnly(text) {
  const div = document.createElement("div");
  div.className = "message user-message";
  div.innerHTML = `<div class="msg-bubble">${mdToHtml(text)}</div>`;
  div.onclick = (e) => {
    if (!e.target.closest("button")) div.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(div);
}

function appendBotMessageDomOnly(text) {
  const div = document.createElement("div");
  div.className = "message bot-message";
  div.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="var(--accent)" stroke-width="1.2"/>
        <path d="M4 7C4 7 5 9 7 9C9 9 10 7 10 7" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="5" cy="5.5" r="0.8" fill="var(--accent)"/>
        <circle cx="9" cy="5.5" r="0.8" fill="var(--accent)"/>
      </svg>
    </div>
    <div class="msg-bubble">${mdToHtml(text)}</div>`;
  div.onclick = (e) => {
    if (!e.target.closest("button")) div.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(div);
}

function appendScreenshotSentDomOnly(dataUrl, filename) {
  const final = document.createElement("div");
  final.className = "message bot-message";
  final.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="var(--accent)" stroke-width="1.2"/>
        <path d="M4 7C4 7 5 9 7 9C9 9 10 7 10 7" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="5" cy="5.5" r="0.8" fill="var(--accent)"/>
        <circle cx="9" cy="5.5" r="0.8" fill="var(--accent)"/>
      </svg>
    </div>
    <div class="msg-bubble screenshot-bubble sent">
      <img src="${dataUrl}" class="ss-sent-thumb" alt="screenshot"/>
      <div class="ss-preview-meta"><span class="ss-filename">📸 ${filename}</span></div>
    </div>`;
  final.onclick = (e) => {
    if (!e.target.closest("button")) final.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(final);
}

function clearActiveConversationMessages() {
  const c = getActiveConversation();
  if (!c) return;
  c.messages = [
    {
      id: generateMessageId(),
      kind: "assistant",
      markdown: "Chat cleared. How can I help?",
    },
  ];
  c.updatedAt = Date.now();
  persistConvStateImmediate();
  renderChatFromActiveConversation();
}

function applyShellWorkspaceUi(ws) {
  shellWorkspace = ws;
  if (appContainer) appContainer.setAttribute("data-shell-workspace", ws);
  if (ws === "browser" || ws === "intelligent") {
    saveShellWorkspacePreference(ws);
  }
  if (titlebarBrowserBtn) {
    titlebarBrowserBtn.setAttribute("aria-pressed", ws === "browser" ? "true" : "false");
  }
  if (titlebarIntelligentBtn) {
    titlebarIntelligentBtn.setAttribute("aria-pressed", ws === "intelligent" ? "true" : "false");
  }
  const settingsWorkspaceEl = document.getElementById("settingsWorkspace");
  if (settingsWorkspaceEl) settingsWorkspaceEl.setAttribute("aria-hidden", "true");
  if (chatSubtitle) {
    if (ws === "intelligent") chatSubtitle.textContent = "General assistant";
    else chatSubtitle.textContent = "Browser agent";
  }
  const closeBtn = document.getElementById("closeChatBtn");
  if (closeBtn) {
    closeBtn.title =
      ws === "intelligent" ? "Back to browser" : "Close AI Chat";
  }
  if (ws === "intelligent") {
    setChatOpen(true);
    try {
      applyIntelligentWorkspaceLayoutToDom();
    } catch {
      /* ignore */
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent("shell-workspace-changed", {
        detail: { workspace: ws },
      }),
    );
  } catch {
    /* ignore */
  }

  /* Header gear hidden in intelligent workspace (CSS); browser workspace already hides #settingsBtnChat. */
  const quickBarWrap = document.getElementById("quickPanelBtn")?.parentElement;
  if (quickBarWrap?.classList.contains("tools-bar-wrap")) {
    quickBarWrap.style.display = ws === "browser" ? "none" : "";
  }
  const toolsBarToolsWrap = document.getElementById("toolsPanelBtn")?.parentElement;
  if (toolsBarToolsWrap?.classList.contains("tools-bar-wrap")) {
    toolsBarToolsWrap.style.display = ws === "browser" ? "none" : "";
  }
}

function enterBrowserWorkspace() {
  showWebviewOnly();
  applyShellWorkspaceUi("browser");
}

function enterIntelligentWorkspace() {
  showWebviewOnly();
  applyShellWorkspaceUi("intelligent");
}

// ── Message helpers ───────────────────────────────────────────

function addUserMessage(text) {
  appendUserMessageDomOnly(text);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  pushUserMessageToStore(text);
}

// Adds a screenshot preview bubble — small thumbnail + Enter to send / Esc to cancel
function addScreenshotMessage(dataUrl, filename) {
  const div = document.createElement("div");
  div.className = "message bot-message screenshot-preview-msg";
  div.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="var(--accent)" stroke-width="1.2"/>
        <path d="M4 7C4 7 5 9 7 9C9 9 10 7 10 7" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="5" cy="5.5" r="0.8" fill="var(--accent)"/>
        <circle cx="9" cy="5.5" r="0.8" fill="var(--accent)"/>
      </svg>
    </div>
    <div class="msg-bubble screenshot-bubble">
      <img src="${dataUrl}" class="ss-preview-thumb" alt="screenshot"/>
      <div class="ss-preview-meta">
        <span class="ss-filename">${filename}</span>
        <div class="ss-actions">
          <button class="ss-btn ss-send-btn" title="Send to chat">Send</button>
          <button class="ss-btn ss-discard-btn" title="Discard">×</button>
        </div>
      </div>
    </div>`;
  div.onclick = (e) => {
    if (!e.target.closest("button")) div.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  div.querySelector(".ss-send-btn").onclick = () => {
    div.remove();
    const final = document.createElement("div");
    final.className = "message bot-message";
    final.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="var(--accent)" stroke-width="1.2"/>
          <path d="M4 7C4 7 5 9 7 9C9 9 10 7 10 7" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="5" cy="5.5" r="0.8" fill="var(--accent)"/>
          <circle cx="9" cy="5.5" r="0.8" fill="var(--accent)"/>
        </svg>
      </div>
      <div class="msg-bubble screenshot-bubble sent">
        <img src="${dataUrl}" class="ss-sent-thumb" alt="screenshot"/>
        <div class="ss-preview-meta"><span class="ss-filename">📸 ${filename}</span></div>
      </div>`;
    chatMessages.appendChild(final);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    pushScreenshotSentToStore(dataUrl, filename);
  };

  div.querySelector(".ss-discard-btn").onclick = () => {
    div.remove();
    showToast("🗑 Screenshot discarded");
  };
}

function addBotMessage(text) {
  appendBotMessageDomOnly(text);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  pushAssistantMessageToStore(text);
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeCodeLang(rawLang) {
  const l = (rawLang || "").trim().toLowerCase();
  if (!l) return "";
  // Conservative: keep simple token; drop anything that could break attributes.
  return l.replace(/[^a-z0-9_+-]/g, "");
}

function buildMarkedRenderer() {
  const r = new marked.Renderer();

  // Ensure links keep the md-link class (we intercept clicks elsewhere).
  r.link = function (tok) {
    const safeHref = tok && typeof tok.href === "string" ? tok.href : "";
    const safeTitle = tok && typeof tok.title === "string" ? tok.title : "";
    const titleAttr = safeTitle ? ` title="${escapeHtml(safeTitle)}"` : "";
    // Render link text via marked inline parser (handles emphasis/code inside links).
    const inner =
      tok && tok.tokens && this && this.parser && this.parser.parseInline
        ? this.parser.parseInline(tok.tokens)
        : escapeHtml(tok && typeof tok.text === "string" ? tok.text : "");
    // Keep href; DOMPurify will sanitize protocols/attrs.
    return `<a class="md-link" href="${escapeHtml(safeHref)}"${titleAttr}>${inner}</a>`;
  };

  // Wrap fenced code blocks so we can add a copy button.
  // marked@17 passes a token object: { text, lang, escaped }.
  r.code = (tok) => {
    const text = typeof tok === "string" ? tok : tok && typeof tok.text === "string" ? tok.text : String(tok ?? "");
    const langRaw = tok && typeof tok.lang === "string" ? tok.lang : "";
    const lang = normalizeCodeLang(langRaw);
    const label = lang ? lang : "code";
    const codeEsc = escapeHtml(String(text ?? "")).replace(/\n$/, "");
    const langClass = lang ? ` language-${lang}` : "";
    const langAttr = lang ? ` data-lang="${lang}"` : "";
    return `
      <div class="md-codeblock"${langAttr}>
        <div class="md-codeblock-head">
          <span class="md-codeblock-lang">${escapeHtml(label)}</span>
          <button type="button" class="md-codecopy" aria-label="Copy code">Copy</button>
        </div>
        <pre><code class="${langClass}">${codeEsc}</code></pre>
      </div>
    `.trim();
  };

  return r;
}

function mdToHtml(text) {
  const raw = String(text ?? "");

  const html = marked.parse(raw, {
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    renderer: buildMarkedRenderer(),
  });

  // Sanitize: disallow raw HTML and any dangerous attributes.
  return DOMPurify.sanitize(String(html ?? ""), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

function formatMessage(text) {
  return mdToHtml(text);
}

// ═══════════════════════════════════════════════════════════
//  CHAT PANEL TOGGLE
// ═══════════════════════════════════════════════════════════

function setupChatPanel() {
  aiChatToggleBtn.classList.add("active");
  aiChatToggleBtn.onclick = () => setChatOpen(!chatOpen);
  closeChatBtn.onclick = () => setChatOpen(false);
}

/** Chat markdown renders `<a href>`; default navigation replaces the whole Electron window. */
function setupChatPanelLinks() {
  const panel = document.getElementById("chatSection");
  if (!panel) return;
  panel.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      const copyBtn = t && t.closest ? t.closest("button.md-codecopy") : null;
      if (copyBtn && panel.contains(copyBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const block = copyBtn.closest(".md-codeblock");
        const codeEl = block ? block.querySelector("pre code") : null;
        const codeText = codeEl ? codeEl.textContent ?? "" : "";
        if (!codeText) return;

        const setLabel = (txt) => {
          try {
            copyBtn.textContent = txt;
            window.clearTimeout(copyBtn.__copyTimer);
            copyBtn.__copyTimer = window.setTimeout(() => {
              copyBtn.textContent = "Copy";
            }, 1200);
          } catch {
            /* ignore */
          }
        };

        navigator.clipboard
          .writeText(codeText)
          .then(() => setLabel("Copied"))
          .catch(() => {
            try {
              // Fallback selection copy.
              const ta = document.createElement("textarea");
              ta.value = codeText;
              ta.setAttribute("readonly", "true");
              ta.style.position = "fixed";
              ta.style.top = "-1000px";
              ta.style.left = "-1000px";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
              setLabel("Copied");
            } catch {
              setLabel("Failed");
            }
          });
        return;
      }
      const a = t && t.closest ? t.closest("a") : null;
      if (!a || !panel.contains(a)) return;
      const href = a.getAttribute("href");
      if (!href || href === "#" || /^\s*javascript:/i.test(href)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const trimmed = href.trim();
      if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
        void window.electronAPI?.openExternal?.(trimmed);
        return;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        if (shellWorkspace === "intelligent" || shellWorkspace === "settings") enterBrowserWorkspace();
        window.legacyBrowser?.createTabWithUrl?.(trimmed);
        return;
      }
      try {
        const abs = new URL(trimmed, window.location.href).href;
        if (/^https?:\/\//i.test(abs)) {
          if (shellWorkspace === "intelligent" || shellWorkspace === "settings") enterBrowserWorkspace();
          window.legacyBrowser?.createTabWithUrl?.(abs);
          return;
        }
      } catch {
        /* ignore */
      }
      void window.electronAPI?.openExternal?.(trimmed);
    },
    true,
  );
}

function setChatOpen(open) {
  if (shellWorkspace === "intelligent" && !open) {
    enterBrowserWorkspace();
    return;
  }
  chatOpen = open;
  chatWrapper.classList.toggle("chat-closed", !open);
  if (aiChatToggleBtn) aiChatToggleBtn.classList.toggle("active", open);
  if (USE_REACT_CHAT_RESIZE) {
    window.dispatchEvent(
      new CustomEvent("legacy-chat-open", { detail: { open } }),
    );
  }
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════

let toastTimer = null;
function showToast(msg, duration = 3000) {
  if (USE_REACT_TOAST) {
    window.dispatchEvent(
      new CustomEvent("legacy-toast", {
        detail: { msg, duration },
      }),
    );
    return;
  }
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ═══════════════════════════════════════════════════════════
//  RESIZE HANDLE (drag to resize chat panel)
// ═══════════════════════════════════════════════════════════

function setupResizeHandle() {
  const handle = document.getElementById("resizeHandle");
  let dragging = false,
    startX,
    startWidth;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = chatSection.offsetWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newWidth = Math.max(
      260,
      Math.min(600, startWidth + (startX - e.clientX)),
    );
    chatWrapper.style.flexBasis = newWidth + "px";
    chatSection.style.width = newWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// ═══════════════════════════════════════════════════════════
//  BROWSER IMPORT WIZARD
// ═══════════════════════════════════════════════════════════

async function setupImportWizard() {
  const wizard = document.getElementById("importWizard");
  const browserList = document.getElementById("importBrowserList");
  const skipBtn = document.getElementById("importSkipBtn");
  const startBtn = document.getElementById("importStartBtn");

  // Check if first run
  const hasImported = localStorage.getItem("hasImported");
  if (hasImported) return; // Skip if already imported

  try {
    // Get browser stats
    const stats = await window.electronAPI.getBrowserStats();

    // Clear existing
    browserList.innerHTML = "";

    // Add Chrome option
    if (stats.chrome.available) {
      const chromeCard = createBrowserCard("chrome", "Chrome", "🌐", stats.chrome);
      browserList.appendChild(chromeCard);
    }

    // Add Firefox option
    if (stats.firefox.available) {
      const firefoxCard = createBrowserCard("firefox", "Firefox", "🦊", stats.firefox);
      browserList.appendChild(firefoxCard);
    }

    // Show wizard if browsers available
    if (browserList.children.length > 0) {
      wizard.style.display = "flex";
    }

  } catch (error) {
    console.error("Failed to setup import wizard:", error);
  }

  // Event listeners
  skipBtn.onclick = () => {
    wizard.style.display = "none";
    localStorage.setItem("hasImported", "true");
  };

  startBtn.onclick = async () => {
    const selectedCards = browserList.querySelectorAll(".browser-import-card.selected");
    if (selectedCards.length === 0) return;

    const selectedCard = selectedCards[0];
    const browser = selectedCard.dataset.browser;

    startBtn.disabled = true;
    startBtn.textContent = "Importing...";

    try {
      const result = await window.electronAPI.browserImport();

      if (result.sources.length > 0) {
        startBtn.textContent = "Import Complete!";
        startBtn.style.background = "var(--success)";

        setTimeout(() => {
          wizard.style.display = "none";
          localStorage.setItem("hasImported", "true");
          showToast(`Successfully imported ${result.bookmarks.length} bookmarks, ${result.history.length} history items, and ${result.cookies.length} cookies`, "success");
        }, 2000);
      } else {
        throw new Error("No data imported");
      }
    } catch (error) {
      console.error("Import failed:", error);
      showToast("Import failed: " + error.message, "error");
      startBtn.disabled = false;
      startBtn.textContent = "Import Selected";
    }
  };
}

function createBrowserCard(browser, name, icon, stats) {
  const card = document.createElement("div");
  card.className = "browser-import-card";
  card.dataset.browser = browser;

  card.innerHTML = `
    <div class="browser-icon">${icon}</div>
    <div class="browser-info">
      <h3>${name}</h3>
      <p>Import bookmarks, history, and cookies</p>
    </div>
    <div class="browser-stats">
      <div class="stat"><strong>${stats.bookmarks}</strong> bookmarks</div>
      <div class="stat"><strong>${stats.history}</strong> history</div>
      <div class="stat"><strong>${stats.cookies}</strong> cookies</div>
    </div>
  `;

  card.onclick = () => {
    // Remove selection from others
    document.querySelectorAll(".browser-import-card").forEach(c => c.classList.remove("selected"));
    // Select this one
    card.classList.add("selected");
    document.getElementById("importStartBtn").disabled = false;
  };

  return card;
}

// ═══════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════

window.browserAPI = {
  navigateTo,
  createTab,
  closeTab,
  takeScreenshot,
  applyZoom,
  addBotMessage,
  showToast,
};

// ═══════════════════════════════════════════════════════════
//  TOOLS PANEL
// ═══════════════════════════════════════════════════════════

// Tool registry — add new tools here
const TOOLS = [
  {
    id: "picker",
    icon: "🎯",
    name: "Element Picker",
    desc: "Click to get a unique CSS selector",
    active: false,
    toggle(on) {
      if (on) startElementPicker("any");
      else stopElementPicker();
    },
  },
  {
    id: "pickerInteractive",
    icon: "🧲",
    name: "Interactive Picker",
    desc: "Pick the nearest clickable/input element",
    active: false,
    toggle(on) {
      if (on) startElementPicker("interactive");
      else stopElementPicker();
    },
  },
  {
    id: "elemshot",
    icon: "📷",
    name: "Element Screenshot",
    desc: "Click element to capture & download it",
    active: false,
    toggle(on) {
      if (on) startElementScreenshot();
      else stopElementScreenshot();
    },
  },
];

function setupToolsPanel() {
  const panelBtn = document.getElementById("toolsPanelBtn");
  const panel = document.getElementById("toolsPanel");
  const closeBtn = document.getElementById("toolsPanelClose");
  const list = document.getElementById("toolsList");
  const quickBtn = document.getElementById("quickPanelBtn");
  const quickPanel = document.getElementById("quickPanel");

  function togglePanel(btn, p, otherBtn, otherP) {
    const open = p.style.display === "none";
    if (otherP) otherP.style.display = "none";
    if (otherBtn) otherBtn.classList.remove("tools-open");
    p.style.display = open ? "block" : "none";
    btn.classList.toggle("tools-open", open);
  }

  if (!panelBtn || !panel || !closeBtn || !list) return;

  // Render tool cards
  function renderTools() {
    list.innerHTML = "";
    TOOLS.forEach((tool) => {
      const card = document.createElement("div");
      card.className = "tool-card" + (tool.active ? " tool-active" : "");
      card.dataset.toolId = tool.id;
      card.innerHTML = `
        <div class="tool-card-icon">${tool.icon}</div>
        <div class="tool-card-info">
          <div class="tool-card-name">${tool.name}</div>
          <div class="tool-card-desc">${tool.desc}</div>
        </div>
        <div class="tool-card-toggle"></div>`;
      card.onclick = () => {
        tool.active = !tool.active;
        tool.toggle(tool.active);
        renderTools();
      };
      list.appendChild(card);
    });
  }

  renderTools();

  const quickList = document.querySelector("#quickPanel .quick-list");
  if (quickList) {
    quickList.innerHTML = "";
    QUICK_COMMAND_ENTRIES.forEach(({ command, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qc-btn";
      btn.dataset.command = command;
      btn.textContent = label;
      btn.onclick = () => runQuickCommand(command);
      quickList.appendChild(btn);
    });
  }

  panelBtn.onclick = (e) => {
    e.stopPropagation();
    if (quickBtn && quickPanel) togglePanel(panelBtn, panel, quickBtn, quickPanel);
    else {
      const open = panel.style.display === "none";
      panel.style.display = open ? "block" : "none";
      panelBtn.classList.toggle("tools-open", open);
    }
  };
  if (quickBtn && quickPanel) {
    quickBtn.onclick = (e) => {
      e.stopPropagation();
      togglePanel(quickBtn, quickPanel, panelBtn, panel);
    };
  }

  closeBtn.onclick = () => {
    panel.style.display = "none";
    panelBtn.classList.remove("tools-open");
  };

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== panelBtn) {
      panel.style.display = "none";
      panelBtn.classList.remove("tools-open");
    }
    if (quickPanel && quickBtn && !quickPanel.contains(e.target) && e.target !== quickBtn) {
      quickPanel.style.display = "none";
      quickBtn.classList.remove("tools-open");
    }
  });
}

// Called by picker to sync toggle state back to the card + update tray tag
function syncToolState(id, active) {
  const tool = TOOLS.find((t) => t.id === id);
  if (tool) tool.active = active;
  // sync tool card toggle
  const card = document.querySelector(`[data-tool-id="${id}"]`);
  if (card) card.classList.toggle("tool-active", active);
  // sync tray tag
  const tray = document.getElementById("activeToolsTray");
  if (!tray) return;
  if (active) {
    if (!tray.querySelector(`[data-tag-id="${id}"]`)) {
      const tag = document.createElement("div");
      tag.className = "tool-tag";
      tag.dataset.tagId = id;
      tag.innerHTML = `<span class="tool-tag-icon">${tool ? tool.icon : ""}</span><span>${tool ? tool.name : id}</span><button class="tool-tag-remove" title="Remove (Esc)">×</button>`;
      tag.querySelector(".tool-tag-remove").onclick = () => deactivateTool(id);
      tray.appendChild(tag);
    }
  } else {
    tray.querySelector(`[data-tag-id="${id}"]`)?.remove();
  }
  tray.style.display = tray.children.length ? "flex" : "none";
}

function deactivateTool(id) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool || !tool.active) return;
  tool.active = false;
  tool.toggle(false);
  syncToolState(id, false);
  // re-render panel cards if open
  const list = document.getElementById("toolsList");
  if (list) {
    const card = list.querySelector(`[data-tool-id="${id}"]`);
    if (card) card.classList.remove("tool-active");
  }
}

// ═══════════════════════════════════════════════════════════
//  ELEMENT SCREENSHOT
// ═══════════════════════════════════════════════════════════

let elemShotActive = false;

// Shared picker injector — injects highlight overlay into webview
// onPick(selector, rect) called on click; onCancel() on Esc
function injectPickerOverlay(onPick, onCancel) {
  browserFrame
    .executeJavaScript(
      `
    (function() {
      if (window.__orionElemShot) return;
      window.__orionElemShot = true;
      const overlay = document.createElement('div');
      overlay.id = '__orion_es_hl';
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #f59e0b;background:rgba(245,158,11,0.1);border-radius:3px;transition:all 0.08s;';
      document.body.appendChild(overlay);
      const label = document.createElement('div');
      label.id = '__orion_es_lbl';
      label.style.cssText = 'position:fixed;z-index:2147483647;background:#f59e0b;color:#000;font:bold 11px/1 monospace;padding:3px 7px;border-radius:4px;pointer-events:none;';
      document.body.appendChild(label);
      function onMove(e) {
        const el = e.target;
        if (el.id === '__orion_es_hl' || el.id === '__orion_es_lbl') return;
        const r = el.getBoundingClientRect();
        overlay.style.left = r.left + 'px';
        overlay.style.top = r.top + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
        label.textContent = el.tagName.toLowerCase();
        label.style.left = r.left + 'px';
        label.style.top = Math.max(0, r.top - 22) + 'px';
      }
      function onClick(e) {
        e.preventDefault(); e.stopPropagation();
        // Use elementFromPoint so clicking a child (e.g. img inside a) still picks the hovered element
        const el = document.elementFromPoint(e.clientX, e.clientY) || e.target;
        const r = el.getBoundingClientRect();
        window.__orionElemShotResult = { x: r.left, y: r.top, w: r.width, h: r.height };
        cleanup();
      }
      function onKey(e) {
        if (e.key === 'Escape') { window.__orionElemShotResult = '__cancelled__'; cleanup(); }
      }
      function cleanup() {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove(); label.remove();
        delete window.__orionElemShot;
      }
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    })();
  `,
    )
    .catch(() => {});

  const poll = setInterval(async () => {
    try {
      const res = await browserFrame.executeJavaScript(
        `window.__orionElemShotResult || null`,
      );
      if (!res) return;
      clearInterval(poll);
      await browserFrame.executeJavaScript(
        `delete window.__orionElemShotResult`,
      );
      if (res === "__cancelled__") {
        onCancel();
        return;
      }
      onPick(res);
    } catch {}
  }, 200);
}

function startElementScreenshot(rearm = false) {
  if (elemShotActive) {
    stopElementScreenshot();
    return;
  }
  elemShotActive = true;
  syncToolState("elemshot", true);
  showToast("📷 Click any element to screenshot it...");
  if (!rearm && !isReactAiChatShellActive()) {
    addBotMessage(
      "📷 **Element Screenshot active** — click any element. Press Esc to cancel.",
    );
  }

  injectPickerOverlay(
    async (r) => {
      try {
        const img = await captureFullImage();
        // r.x/y/w/h are webview CSS px from getBoundingClientRect() inside the webview.
        // img.naturalWidth is physical px of the webview output.
        // The webview's CSS viewport width = window.innerWidth inside the webview.
        const wvCSSW = await browserFrame
          .executeJavaScript(`window.innerWidth`)
          .catch(() => 0);
        const wvCSSH = await browserFrame
          .executeJavaScript(`window.innerHeight`)
          .catch(() => 0);
        const scaleX = wvCSSW > 0 ? img.naturalWidth / wvCSSW : 1;
        const scaleY = wvCSSH > 0 ? img.naturalHeight / wvCSSH : 1;
        const dataUrl = cropImage(img, r.x, r.y, r.w, r.h, scaleX, scaleY);
        const saved = await window.electronAPI.saveScreenshot(dataUrl);
        if (saved.success) {
          showToast(`✅ Element captured: ${saved.filename}`);
          if (isReactAiChatShellActive()) {
            insertIntoAiComposerText(
              `📷 **Element snapshot** saved as \`${saved.filename}\`. Describe what to do with this region.`,
            );
            elemShotActive = false;
            stopElementScreenshot();
            return;
          }
          addScreenshotMessage(dataUrl, saved.filename);
        } else {
          showToast("❌ Save failed");
        }
      } catch (err) {
        showToast("❌ Element screenshot failed");
        console.error("[elemshot] error:", err);
      }
      // Re-arm after capture completes
      elemShotActive = false;
      if (!isReactAiChatShellActive()) startElementScreenshot(true);
    },
    () => {
      stopElementScreenshot();
      if (!isReactAiChatShellActive()) addBotMessage("📷 Element screenshot cancelled.");
    },
  );
}

function stopElementScreenshot() {
  elemShotActive = false;
  syncToolState("elemshot", false);
  browserFrame
    .executeJavaScript(
      `if (window.__orionElemShot) { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); }`,
    )
    .catch(() => {});
}

// ── Direct element action helpers (used by picker popup) ────
async function clickElement(sel) {
  try {
    const result = await browserFrame.executeJavaScript(`
      (function() {
        try {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return { success: false };
          // Only scroll if element is outside the viewport
          const r = el.getBoundingClientRect();
          const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
          if (!inView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
          el.focus();
          const r2 = el.getBoundingClientRect();
          const cx = r2.left + r2.width / 2;
          const cy = r2.top + r2.height / 2;
          const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
          el.dispatchEvent(new PointerEvent('pointerover', opts));
          el.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, opts, { bubbles: false })));
          el.dispatchEvent(new MouseEvent('mouseover', opts));
          el.dispatchEvent(new PointerEvent('pointermove', opts));
          el.dispatchEvent(new MouseEvent('mousemove', opts));
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new PointerEvent('pointerup', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.click();
          return { success: true, tag: el.tagName.toLowerCase() };
        } catch(e) { return { success: false, error: e.message }; }
      })()
    `);
    if (result.success)
      addBotMessage(`\u2705 Clicked **${sel}** (${result.tag})`);
    else addBotMessage(`\u274c Element not found: **${sel}**`);
  } catch (err) {
    addBotMessage(`\u274c Click failed: ${err.message}`);
  }
}

async function fillElement(sel, value) {
  try {
    const result = await browserFrame.executeJavaScript(`
      (function() {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { success: false };
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.focus();
        const val = ${JSON.stringify(value)};
        if (el.tagName === 'SELECT') {
          const opt = [...el.options].find(o =>
            o.text.toLowerCase().includes(val.toLowerCase()) ||
            o.value.toLowerCase() === val.toLowerCase()
          );
          if (opt) el.value = opt.value;
        } else if (el.isContentEditable) {
          el.textContent = val;
        } else {
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value');
          if (setter) setter.set.call(el, val); else el.value = val;
        }
        ['input','change','keydown','keyup'].forEach(t =>
          el.dispatchEvent(new Event(t, { bubbles: true }))
        );
        return { success: true, tag: el.tagName.toLowerCase() };
      })()
    `);
    if (result.success)
      addBotMessage(`\u2705 Filled **${sel}** with "${value}"`);
    else addBotMessage(`\u274c Field not found: **${sel}**`);
  } catch (err) {
    addBotMessage(`\u274c Fill failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
//  ELEMENT PICKER
// ═══════════════════════════════════════════════════════════

let pickerActive = false;

function startElementPicker(mode = "any") {
  if (pickerActive) {
    stopElementPicker();
    return;
  }
  pickerActive = true;

  const toolId = mode === "interactive" ? "pickerInteractive" : "picker";
  syncToolState(toolId, true);
  showToast(
    mode === "interactive"
      ? "🎯 Click an interactive element (button/input/link) to pick it..."
      : "🎯 Click any element on the page to pick its selector...",
  );
  if (!isReactAiChatShellActive()) {
    addBotMessage(
      mode === "interactive"
        ? "🎯 **Interactive Picker active** — click a button/input/link. Press Esc to cancel."
        : "🎯 **Picker active** — click any element on the page. Press Esc to cancel.",
    );
  }

  browserFrame
    .executeJavaScript(
      `
    (function() {
      if (window.__orionPicker) return;
      window.__orionPicker = true;
      window.__orionPickerMode = ${JSON.stringify(mode)};

      const overlay = document.createElement('div');
      overlay.id = '__orion_highlight';
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7c6af7;background:rgba(124,106,247,0.12);border-radius:3px;transition:all 0.08s;box-shadow:0 0 0 1px rgba(124,106,247,0.4);';
      document.body.appendChild(overlay);

      const label = document.createElement('div');
      label.id = '__orion_label';
      label.style.cssText = 'position:fixed;z-index:2147483647;background:#7c6af7;color:#fff;font:bold 11px/1 monospace;padding:3px 7px;border-radius:4px;pointer-events:none;white-space:nowrap;max-width:400px;overflow:hidden;text-overflow:ellipsis;';
      document.body.appendChild(label);

      function isInteractive(el) {
        if (!el || el.nodeType !== 1) return false;
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' || tag === 'a' || tag === 'select' || tag === 'textarea') return true;
        if (tag === 'input') return true;
        const role = (el.getAttribute('role') || '').toLowerCase();
        if (['button','link','menuitem','option','tab','checkbox','radio','combobox','switch'].includes(role)) return true;
        if (el.hasAttribute('aria-haspopup')) return true;
        if (el.hasAttribute('tabindex') && el.tabIndex >= 0) return true;
        return false;
      }
      function closestInteractive(el) {
        let cur = el;
        while (cur && cur !== document.body) {
          if (isInteractive(cur)) return cur;
          cur = cur.parentElement;
        }
        return el;
      }
      function unique(sel) {
        try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
      }
      function escAttr(v){ return JSON.stringify(String(v)); }
      function buildSelector(el) {
        const tag = el.tagName.toLowerCase();
        // 1) id
        if (el.id && !/^\\d/.test(el.id)) {
          const s = '#' + CSS.escape(el.id);
          if (unique(s)) return s;
        }
        // 2) stable data attrs
        const dataKeys = ['data-testid','data-test','data-qa','data-cy'];
        for (const k of dataKeys) {
          const v = el.getAttribute(k);
          if (v) { const s = tag + '[' + k + '=' + escAttr(v) + ']'; if (unique(s)) return s; }
        }
        // 3) name / aria-label
        if (el.getAttribute('name')) {
          const v = el.getAttribute('name');
          const s = tag + '[name=' + escAttr(v) + ']';
          if (unique(s)) return s;
        }
        const al = el.getAttribute('aria-label');
        if (al) {
          const s = tag + '[aria-label=' + escAttr(al) + ']';
          if (unique(s)) return s;
        }
        // 4) role + aria-label
        const role = el.getAttribute('role');
        if (role && al) {
          const s = '[role=' + escAttr(role) + '][aria-label=' + escAttr(al) + ']';
          if (unique(s)) return s;
        }
        // 5) fallback: short ancestor chain with nth-of-type
        let cur = el;
        const parts = [];
        for (let depth = 0; cur && cur !== document.body && depth < 4; depth++) {
          const t = cur.tagName.toLowerCase();
          let part = t;
          const pid = cur.id && !/^\\d/.test(cur.id) ? '#' + CSS.escape(cur.id) : '';
          if (pid) part += pid;
          else {
            const sibs = Array.from(cur.parentElement ? cur.parentElement.children : []).filter(x => x.tagName === cur.tagName);
            if (sibs.length > 1) {
              const idx = sibs.indexOf(cur) + 1;
              part += ':nth-of-type(' + idx + ')';
            }
          }
          parts.unshift(part);
          const s = parts.join(' > ');
          if (unique(s)) return s;
          cur = cur.parentElement;
        }
        return parts.join(' > ') || tag;
      }
      function pickTarget(el) {
        const mode = window.__orionPickerMode || 'any';
        return mode === 'interactive' ? closestInteractive(el) : el;
      }

      function onMove(e) {
        const el = pickTarget(e.target);
        if (el.id === '__orion_highlight' || el.id === '__orion_label') return;
        const r = el.getBoundingClientRect();
        overlay.style.left   = r.left   + 'px';
        overlay.style.top    = r.top    + 'px';
        overlay.style.width  = r.width  + 'px';
        overlay.style.height = r.height + 'px';
        label.textContent = buildSelector(el);
        label.style.left = r.left + 'px';
        label.style.top  = Math.max(0, r.top - 22) + 'px';
      }

      function onClick(e) {
        e.preventDefault();
        e.stopPropagation();
        const el = pickTarget(document.elementFromPoint(e.clientX, e.clientY) || e.target);
        window.__orionPickedSelector = buildSelector(el);
        cleanup();
      }

      function onKey(e) {
        if (e.key === 'Escape') { window.__orionPickedSelector = '__cancelled__'; cleanup(); }
      }

      function cleanup() {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        label.remove();
        delete window.__orionPicker;
        delete window.__orionPickerMode;
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    })();
  `,
    )
    .catch(() => {});

  const poll = setInterval(async () => {
    try {
      const sel = await browserFrame.executeJavaScript(
        `window.__orionPickedSelector || null`,
      );
      if (!sel) return;
      clearInterval(poll);
      await browserFrame.executeJavaScript(
        `delete window.__orionPickedSelector`,
      );
      if (sel === "__cancelled__") {
        stopElementPicker();
        if (!isReactAiChatShellActive()) addBotMessage("🎯 Picker cancelled.");
        return;
      }
      const info = await browserFrame
        .executeJavaScript(
          `
        (function() {
          try {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return { tag: 'unknown', type: '', text: '' };
            return {
              tag: el.tagName.toLowerCase(),
              type: el.type || '',
              text: (el.textContent || el.value || el.placeholder || '').trim().slice(0, 40),
            };
          } catch { return { tag: 'unknown', type: '', text: '' }; }
        })()
      `,
        )
        .catch(() => ({ tag: "unknown", type: "", text: "" }));

      const isInput =
        ["input", "textarea"].includes(info.tag) &&
        !["submit", "button", "checkbox", "radio"].includes(info.type);
      const isSelect = info.tag === "select";
      const isCheckable = ["checkbox", "radio"].includes(info.type);

      // Deactivate picker before showing popup so tray tag is cleared
      stopElementPicker();
      // Build action popup in chat
      showPickerActionPopup(sel, info, isInput || isSelect, isCheckable);
    } catch {}
  }, 300);
}

function stopElementPicker() {
  pickerActive = false;
  syncToolState("picker", false);
  syncToolState("pickerInteractive", false);
  browserFrame
    .executeJavaScript(
      `
    if (window.__orionPicker) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  `,
    )
    .catch(() => {});
}

function isReactAiChatShellActive() {
  const h = document.getElementById("aiChatReactHost");
  if (!h) return false;
  return getComputedStyle(h).display !== "none";
}

function insertIntoAiComposerText(text) {
  if (!text) return;
  try {
    window.dispatchEvent(new CustomEvent("ai-chat-append-composer", { detail: { text } }));
  } catch {
    /* ignore */
  }
}

function formatPickerContextForComposer(sel, info) {
  const lines = [
    "**Page element**",
    `- CSS selector: \`${sel}\``,
    `- Tag: \`${(info && info.tag) || "?"}\``,
  ];
  if (info && info.type) lines.push(`- Type: \`${info.type}\``);
  if (info && info.text)
    lines.push(`- Visible text: "${String(info.text).replace(/"/g, '\\"').slice(0, 200)}"`);
  lines.push("", "_Use this target with the browser automation tools._");
  return lines.join("\n");
}

// Shows an inline action card in chat after the picker selects an element
function showPickerActionPopup(sel, info, canFill, isCheckable, recordStore = true) {
  if (isReactAiChatShellActive()) {
    insertIntoAiComposerText(formatPickerContextForComposer(sel, info));
    showToast("Added page element to your message");
    return;
  }
  const div = document.createElement("div");
  div.className = "message bot-message";

  const label = info.text
    ? `\`${info.tag}\` — "${info.text}"`
    : `\`${info.tag}\``;

  div.innerHTML = `
    <div class="msg-avatar bot-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="var(--accent)" stroke-width="1.2"/>
        <path d="M4 7C4 7 5 9 7 9C9 9 10 7 10 7" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="5" cy="5.5" r="0.8" fill="var(--accent)"/>
        <circle cx="9" cy="5.5" r="0.8" fill="var(--accent)"/>
      </svg>
    </div>
    <div class="msg-bubble picker-action-bubble">
      <div class="picker-sel-label">🎯 ${mdToHtml(label)}</div>
      <div class="picker-actions">
        <button class="pa-btn pa-click">Click</button>
        ${canFill ? '<button class="pa-btn pa-fill">Fill…</button>' : ""}
        ${isCheckable ? '<button class="pa-btn pa-toggle">Toggle</button>' : ""}
        <button class="pa-btn pa-scroll">Scroll to</button>
        <button class="pa-btn pa-shot">Screenshot</button>
        <button class="pa-btn pa-copy">Copy selector</button>
      </div>
      ${canFill ? '<div class="pa-fill-row" style="display:none"><input class="pa-fill-input" placeholder="Value to fill..."/><button class="pa-btn pa-fill-go">Go</button></div>' : ""}
    </div>`;

  div.onclick = (e) => {
    if (!e.target.closest("button, input"))
      div.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Click — stop picker first so it doesn't intercept the programmatic click
  div.querySelector(".pa-click").onclick = async () => {
    deactivateTool("picker");
    await clickElement(sel);
  };

  // Fill
  if (canFill) {
    const fillRow = div.querySelector(".pa-fill-row");
    const fillInput = div.querySelector(".pa-fill-input");
    div.querySelector(".pa-fill").onclick = () => {
      fillRow.style.display =
        fillRow.style.display === "none" ? "flex" : "none";
      if (fillRow.style.display === "flex") fillInput.focus();
    };
    const doFill = async () => {
      const val = fillInput.value.trim();
      if (!val) return;
      await fillElement(sel, val);
      fillRow.style.display = "none";
      fillInput.value = "";
    };
    div.querySelector(".pa-fill-go").onclick = doFill;
    fillInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doFill();
    });
  }

  // Toggle (checkbox/radio)
  if (isCheckable) {
    div.querySelector(".pa-toggle").onclick = async () => {
      await browserFrame
        .executeJavaScript(
          `
        (function(){
          const el = document.querySelector(${JSON.stringify(sel)});
          if (el) { el.click(); }
        })()
      `,
        )
        .catch(() => {});
      addBotMessage(`✅ Toggled **${sel}**`);
    };
  }

  // Scroll to
  div.querySelector(".pa-scroll").onclick = async () => {
    await browserFrame
      .executeJavaScript(
        `
      (function(){
        const el = document.querySelector(${JSON.stringify(sel)});
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()
    `,
      )
      .catch(() => {});
    addBotMessage(`✅ Scrolled to **${sel}**`);
  };

  // Screenshot element
  div.querySelector(".pa-shot").onclick = async () => {
    try {
      const r = await browserFrame.executeJavaScript(`
        (function(){
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        })()
      `);
      if (!r) {
        showToast("❌ Element not found");
        return;
      }
      const img = await captureFullImage();
      const wvCSSW = await browserFrame
        .executeJavaScript(`window.innerWidth`)
        .catch(() => 0);
      const wvCSSH = await browserFrame
        .executeJavaScript(`window.innerHeight`)
        .catch(() => 0);
      const scaleX = wvCSSW > 0 ? img.naturalWidth / wvCSSW : 1;
      const scaleY = wvCSSH > 0 ? img.naturalHeight / wvCSSH : 1;
      const dataUrl = cropImage(img, r.x, r.y, r.w, r.h, scaleX, scaleY);
      const saved = await window.electronAPI.saveScreenshot(dataUrl);
      if (saved.success) {
        showToast(`✅ ${saved.filename}`);
        addScreenshotMessage(dataUrl, saved.filename);
      } else showToast("❌ Save failed");
    } catch (err) {
      showToast("❌ Screenshot failed");
      console.error(err);
    }
  };

  // Copy selector
  div.querySelector(".pa-copy").onclick = () => {
    navigator.clipboard
      .writeText(sel)
      .then(() => showToast(`📋 Copied: ${sel}`))
      .catch(() => {
        // fallback: paste into chat input
        const chatInputEl = document.getElementById("chatInput");
        chatInputEl.value = sel;
        chatInputEl.focus();
      });
  };

  if (recordStore) pushPickerMessageToStore(sel, info, canFill, isCheckable);
}

// ═══════════════════════════════════════════════════════════
//  PROFILE SYSTEM
// ═══════════════════════════════════════════════════════════

let currentProfile = null;
let mergedAppPasswordsOnce = false;

function getProfile() {
  if (!currentProfile)
    currentProfile = {
      name: "default",
      bookmarks: [],
      history: [],
      passwords: [],
    };
  return currentProfile;
}

async function saveProfile() {
  if (!currentProfile) return;
  await window.electronAPI.profileSave(currentProfile.name, {
    bookmarks: currentProfile.bookmarks,
    history: currentProfile.history,
    passwords: currentProfile.passwords,
  });
}

async function setupProfileModal() {
  const overlay = document.getElementById("profileOverlay");
  const nameInput = document.getElementById("newProfileName");
  const createBtn = document.getElementById("createProfileBtn");
  const listEl = document.getElementById("modalProfilesList");

  async function refreshList() {
    const profiles = await window.electronAPI.profileList();
    listEl.innerHTML = "";
    const visible = profiles.filter((name) => name.toLowerCase() !== "default");
    if (!visible.length) {
      listEl.innerHTML = '<div class="modal-empty">No saved profiles yet</div>';
      return;
    }
    visible.forEach((name) => {
      const row = document.createElement("div");
      row.className = "modal-profile-row";
      row.innerHTML = `
        <div class="modal-profile-icon">👤</div>
        <span class="modal-profile-name">${escapeHtml(name)}</span>
        <button class="modal-btn modal-btn-sm modal-btn-primary" data-load="${escapeHtml(name)}">Load</button>
        <button class="modal-btn modal-btn-sm modal-btn-danger"  data-del="${escapeHtml(name)}">✕</button>`;
      row.querySelector("[data-load]").onclick = () => loadProfile(name);
      row.querySelector("[data-del]").onclick = async (e) => {
        e.stopPropagation();
        await window.electronAPI.profileDelete(name);
        refreshList();
      };
      listEl.appendChild(row);
    });
  }

  createBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast("Enter a profile name");
      return;
    }
    currentProfile = { name, bookmarks: [], history: [], passwords: [] };
    await saveProfile();
    overlay.style.display = "none";
    initDataPanels();
    showToast(`✅ Profile "${name}" created`);
  };

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createBtn.click();
  });

  await refreshList();
  overlay.style.display = "flex";
}

async function loadProfile(name) {
  const data = await window.electronAPI.profileLoad(name);
  currentProfile = {
    name,
    bookmarks: (data && data.bookmarks) || [],
    history: (data && data.history) || [],
    passwords: (data && data.passwords) || [],
  };
  mergedAppPasswordsOnce = false;
  document.getElementById("profileOverlay").style.display = "none";
  initDataPanels();
  showToast(`✅ Profile "${name}" loaded`);
}

// ═══════════════════════════════════════════════════════════
//  BOOKMARKS
// ═══════════════════════════════════════════════════════════

function addBookmark(url, title) {
  const p = getProfile();
  if (p.bookmarks.find((b) => b.url === url)) {
    showToast("Already bookmarked ⭐");
    return;
  }
  p.bookmarks.unshift({ url, title: title || url, addedAt: Date.now() });
  saveProfile();
  renderBookmarks();
  updateBookmarkStar(url);
  showToast("⭐ Bookmarked!");
}

function removeBookmark(url) {
  const p = getProfile();
  p.bookmarks = p.bookmarks.filter((b) => b.url !== url);
  saveProfile();
  renderBookmarks();
  updateBookmarkStar(browserFrame.getURL ? browserFrame.getURL() : "");
}

function updateBookmarkStar(url) {
  const star = document.getElementById("bookmarkStarBtn");
  if (!star) return;
  const isBookmarked = getProfile().bookmarks.some((b) => b.url === url);
  star.classList.toggle("nav-btn-bookmarked", isBookmarked);
  star.title = isBookmarked ? "Remove bookmark" : "Bookmark this page (Ctrl+D)";
}

function renderBookmarks(filter) {
  if (USE_REACT_SIDE_PANELS) return;
  const list = document.getElementById("bookmarksList");
  if (!list) return;
  const q = (
    filter ||
    document.getElementById("bookmarkSearch")?.value ||
    ""
  ).toLowerCase();
  const p = getProfile();
  const items = q
    ? p.bookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
      )
    : p.bookmarks;
  if (!items.length) {
    list.innerHTML =
      '<div class="side-empty">No bookmarks yet.<br>Click ⭐ to bookmark a page.</div>';
    return;
  }
  list.innerHTML = "";
  items.forEach((b) => {
    const row = document.createElement("div");
    row.className = "side-item side-item--bookmark";
    const added = b.addedAt ? new Date(b.addedAt).toLocaleDateString() : "";
    row.innerHTML = `
      <img class="side-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(b.url).hostname)}&sz=16" onerror="this.style.display='none'" width="14" height="14"/>
      <div class="side-item-info">
        <div class="side-item-title">${escapeHtml(b.title)}</div>
        <div class="side-item-url">${escapeHtml(b.url)}</div>
      </div>
      ${added ? `<span class="side-item-date">${added}</span>` : ""}
      <button class="side-item-del" title="Remove bookmark" aria-label="Remove bookmark">✕</button>`;
    row.querySelector(".side-item-info").onclick = () => {
      navigateTo(b.url);
      closeSidePanels();
    };
    row.querySelector(".side-item-del").onclick = (e) => {
      e.stopPropagation();
      removeBookmark(b.url);
    };
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════════

function addHistoryEntry(url, title) {
  if (!url || url === "about:blank" || !currentProfile) return;
  const p = getProfile();
  p.history = p.history.filter((h) => h.url !== url);
  p.history.unshift({ url, title: title || url, visitedAt: Date.now() });
  if (p.history.length > 1000) p.history = p.history.slice(0, 1000);
  saveProfile();
  renderHistory();
}

function renderHistory(filter) {
  if (USE_REACT_SIDE_PANELS) return;
  const list = document.getElementById("historyList");
  if (!list) return;
  const q = (
    filter ||
    document.getElementById("historySearch")?.value ||
    ""
  ).toLowerCase();
  const p = getProfile();
  const items = q
    ? p.history.filter(
        (h) =>
          h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q),
      )
    : p.history;
  if (!items.length) {
    list.innerHTML = '<div class="side-empty">No history yet.</div>';
    return;
  }
  list.innerHTML = "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const labelForTs = (ts) => {
    if (ts >= startOfToday) return "Today";
    if (ts >= startOfYesterday) return "Yesterday";
    return new Date(ts).toLocaleDateString();
  };

  const groups = new Map();
  items.slice(0, 300).forEach((h) => {
    const label = labelForTs(h.visitedAt);
    const arr = groups.get(label) || [];
    arr.push(h);
    groups.set(label, arr);
  });

  for (const [label, entries] of groups.entries()) {
    const header = document.createElement("div");
    header.className = "side-group-header";
    header.textContent = label;
    list.appendChild(header);

    entries.forEach((h) => {
      const row = document.createElement("div");
      row.className = "side-item side-item--history";
      let hostname = "";
      try {
        hostname = new URL(h.url).hostname;
      } catch {}
      row.innerHTML = `
        <img class="side-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16" onerror="this.style.display='none'" width="14" height="14"/>
        <div class="side-item-info">
          <div class="side-item-title">${escapeHtml(h.title)}</div>
          <div class="side-item-url">${escapeHtml(h.url)}</div>
        </div>`;
      row.querySelector(".side-item-info").onclick = () => {
        navigateTo(h.url);
        closeSidePanels();
      };
      list.appendChild(row);
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  PASSWORDS
// ═══════════════════════════════════════════════════════════

function renderPasswords(filter) {
  if (USE_REACT_SIDE_PANELS) return;
  const list = document.getElementById("passwordsList");
  if (!list) return;
  const q = (
    filter ||
    document.getElementById("passwordSearch")?.value ||
    ""
  ).toLowerCase();
  const p = getProfile();
  // If Settings-imported passwords exist in app storage, merge them in-memory so they show here.
  // (Settings import writes to DataManager; legacy side panels read from currentProfile.)
  if (!mergedAppPasswordsOnce && (!p.passwords || p.passwords.length === 0) && window.electronAPI?.getPasswords) {
    mergedAppPasswordsOnce = true;
    window.electronAPI
      .getPasswords()
      .then((raw) => {
        const arr = (raw && (raw.passwords || raw.data?.passwords)) || [];
        if (!Array.isArray(arr) || arr.length === 0) return;
        const seen = new Set((p.passwords || []).map((x) => `${x.url}@@${x.username}`));
        arr.forEach((pw) => {
          const url = String(pw.url || "").trim();
          const username = String(pw.username || pw.username_value || "").trim();
          if (!url || !username) return;
          const key = `${url}@@${username}`;
          if (seen.has(key)) return;
          seen.add(key);
          (p.passwords ||= []).push({
            url,
            username,
            password: String(pw.password || "[encrypted]"),
            note: pw.source ? `Imported (${pw.source})` : "",
            addedAt: pw.dateLastUsed || pw.dateCreated || pw.timestamp || Date.now(),
          });
        });
        renderPasswords();
      })
      .catch(() => {});
  }
  const items = q
    ? p.passwords.filter(
        (pw) =>
          pw.url.toLowerCase().includes(q) ||
          pw.username.toLowerCase().includes(q),
      )
    : p.passwords;
  if (!items.length) {
    list.innerHTML =
      '<div class="side-empty">No saved passwords.<br>Click + to add one.</div>';
    return;
  }
  list.innerHTML = "";
  items.forEach((pw) => {
    const isEncrypted =
      pw.password.startsWith("[encrypted") || pw.password.startsWith("[");
    const row = document.createElement("div");
    row.className = "side-item pw-item pw-card";
    row.innerHTML = `
      <div class="pw-main">
        <div class="pw-top">
          <div class="pw-site">${escapeHtml(pw.url || "Unknown site")}</div>
          ${
            isEncrypted
              ? `<span class="pw-badge" title="Encrypted by OS">Encrypted</span>`
              : ""
          }
        </div>
        <div class="pw-user">${escapeHtml(pw.username)}</div>
        ${pw.note ? `<div class="pw-note">${escapeHtml(pw.note)}</div>` : ""}
      </div>
      <div class="pw-actions" aria-label="Password actions">
        ${
          !isEncrypted
            ? `
          <button class="pw-copy-btn" data-type="user"  title="Copy username">User</button>
          <button class="pw-copy-btn" data-type="pass"  title="Copy password">Pass</button>
          <button class="pw-del-btn"                    title="Delete">Delete</button>`
            : ""
        }
      </div>`;
    if (!isEncrypted) {
      row.querySelector("[data-type='user']").onclick = () =>
        navigator.clipboard
          .writeText(pw.username)
          .then(() => showToast("📋 Username copied"));
      row.querySelector("[data-type='pass']").onclick = () =>
        navigator.clipboard
          .writeText(pw.password)
          .then(() => showToast("📋 Password copied"));
      row.querySelector(".pw-del-btn").onclick = () => {
        const idx = p.passwords.indexOf(pw);
        if (idx > -1) {
          p.passwords.splice(idx, 1);
          saveProfile();
          renderPasswords();
        }
      };
    }
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════
//  SIDE PANEL CONTROLS
// ═══════════════════════════════════════════════════════════

const SIDE_PANEL_OPEN_CLASS = "side-panel--open";
/** Skip enter/exit transitions so bookmarks ↔ history ↔ passwords swaps feel instant. */
const SIDE_PANEL_INSTANT_CLASS = "side-panel--instant";

function syncWebviewInteractionLayer() {
  const sideOpen = !!document.querySelector(".side-panel.side-panel--open");
  const hub = document.getElementById("toolsHubRoot");
  const hubOpen = !!(hub && hub.classList.contains("tools-hub--open"));
  const settingsOpen =
    shellWorkspace === "settings" ||
    !!document.getElementById("appContainer")?.hasAttribute("data-settings-open");
  const workbenchOpen = !!document
    .getElementById("webviewContainer")
    ?.hasAttribute("data-workbench-open");
  const blockWebview = sideOpen || hubOpen || settingsOpen || workbenchOpen;
  document
    .getElementById("sidePanelWebviewShield")
    ?.classList.toggle("is-active", sideOpen);
  document.querySelectorAll("webview").forEach((wv) => {
    wv.style.pointerEvents = blockWebview ? "none" : "";
  });
  syncTopChromeForSurface();
  traceKernel("syncWebviewInteractionLayer", {
    sideOpen,
    hubOpen,
    settingsOpen,
    workbenchOpen,
    blockWebview,
    activeSessionId,
    activeTabId,
    browserFrameSession: browserFrame?.dataset?.orionSessionId || null,
    browserFrameTab: browserFrame?.dataset?.orionTabId || null,
  });
}

function syncRailPanelActive() {
  const map = {
    browserSettingsPanel: "settingsBtn",
    bookmarksPanel: "bookmarksBtn",
    historyPanel: "historyBtn",
    passwordsPanel: "passwordsBtn",
    sessionsPanel: "sessionsBtn",
  };
  document.querySelectorAll("#leftToolRail .rail-btn").forEach((b) => {
    b.classList.remove("rail-btn-active");
  });
  const hub = document.getElementById("toolsHubRoot");
  if (hub && hub.classList.contains("tools-hub--open")) {
    document.getElementById("toolsHubBtn")?.classList.add("rail-btn-active");
    return;
  }
  if (document.getElementById("webviewContainer")?.hasAttribute("data-workbench-open")) {
    document.getElementById("networkWorkbenchBtn")?.classList.add("rail-btn-active");
    return;
  }
  if (document.getElementById("appContainer")?.hasAttribute("data-settings-open")) {
    document.getElementById("settingsBtn")?.classList.add("rail-btn-active");
    return;
  }
  for (const pid of [
    "browserSettingsPanel",
    "bookmarksPanel",
    "historyPanel",
    "passwordsPanel",
    "sessionsPanel",
  ]) {
    const p = document.getElementById(pid);
    if (p && p.classList.contains(SIDE_PANEL_OPEN_CLASS)) {
      const bid = map[pid];
      document.getElementById(bid)?.classList.add("rail-btn-active");
      return;
    }
  }
  document.getElementById("railWebviewBtn")?.classList.add("rail-btn-active");
}

function closeSidePanels() {
  let browserSettingsWasOpen = false;
  ["browserSettingsPanel", "bookmarksPanel", "historyPanel", "passwordsPanel", "sessionsPanel"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        if (id === "browserSettingsPanel" && el.classList.contains(SIDE_PANEL_OPEN_CLASS)) {
          browserSettingsWasOpen = true;
        }
        el.classList.remove(SIDE_PANEL_OPEN_CLASS);
        el.setAttribute("aria-hidden", "true");
      }
    },
  );
  if (browserSettingsWasOpen) notifyBrowserChromeSettingsSide(false);
  syncRailPanelActive();
  syncWebviewInteractionLayer();
}

function closeToolsHub() {
  const hub = document.getElementById("toolsHubRoot");
  if (!hub) return;
  hub.classList.remove("tools-hub--open");
  hub.style.display = "none";
  hub.setAttribute("aria-hidden", "true");
  syncRailPanelActive();
  syncWebviewInteractionLayer();
}

function openToolsHub() {
  closeSidePanels();
  const hub = document.getElementById("toolsHubRoot");
  if (!hub) return;
  hub.classList.add("tools-hub--open");
  hub.style.display = "flex";
  hub.setAttribute("aria-hidden", "false");
  leaveWorkbenchSurfaceSync();
  leaveSettingsSurfaceSync();
  syncRailPanelActive();
  syncWebviewInteractionLayer();
  window.dispatchEvent(new CustomEvent("tools-hub-open"));
}

function toggleToolsHub() {
  const hub = document.getElementById("toolsHubRoot");
  if (!hub) return;
  if (hub.classList.contains("tools-hub--open")) closeToolsHub();
  else openToolsHub();
}

function toggleSidePanel(id) {
  const panel = document.getElementById(id);
  if (!panel) return;

  if (panel.classList.contains(SIDE_PANEL_OPEN_CLASS)) {
    panel.classList.remove(SIDE_PANEL_OPEN_CLASS);
    panel.setAttribute("aria-hidden", "true");
    if (id === "browserSettingsPanel") notifyBrowserChromeSettingsSide(false);
    syncRailPanelActive();
    syncWebviewInteractionLayer();
    return;
  }

  const settingsWasOpen = !!document
    .getElementById("appContainer")
    ?.hasAttribute("data-settings-open");
  const workbenchWasOpen = !!document
    .getElementById("webviewContainer")
    ?.hasAttribute("data-workbench-open");
  const hub = document.getElementById("toolsHubRoot");
  const hubWasOpen = !!(hub && hub.classList.contains("tools-hub--open"));

  const prev = document.querySelector(".side-panel.side-panel--open");
  if (prev && prev !== panel) {
    if (prev.id === "browserSettingsPanel") notifyBrowserChromeSettingsSide(false);
    panel.classList.add(SIDE_PANEL_INSTANT_CLASS);
    prev.classList.add(SIDE_PANEL_INSTANT_CLASS);
    panel.classList.add(SIDE_PANEL_OPEN_CLASS);
    panel.setAttribute("aria-hidden", "false");
    prev.classList.remove(SIDE_PANEL_OPEN_CLASS);
    prev.setAttribute("aria-hidden", "true");
    window.requestAnimationFrame(() => {
      prev.classList.remove(SIDE_PANEL_INSTANT_CLASS);
      panel.classList.remove(SIDE_PANEL_INSTANT_CLASS);
    });
    if (settingsWasOpen) window.requestAnimationFrame(() => leaveSettingsSurfaceSync());
    else leaveSettingsSurfaceSync();
    // Close workbench only after the new panel is visible to avoid webview flashes.
    if (workbenchWasOpen) window.requestAnimationFrame(() => leaveWorkbenchSurfaceSync());
    else leaveWorkbenchSurfaceSync();
    if (hubWasOpen) window.requestAnimationFrame(() => closeToolsHub());
    else {
      syncRailPanelActive();
      syncWebviewInteractionLayer();
    }
    if (id === "browserSettingsPanel") notifyBrowserChromeSettingsSide(true);
    return;
  }

  panel.classList.add(SIDE_PANEL_OPEN_CLASS);
  panel.setAttribute("aria-hidden", "false");
  // If we're coming from the tools hub, the panel's first "open" frame can still be near-transparent
  // (transition start). Force it to be instantly visible for a frame to avoid a webview flash.
  if (hubWasOpen || settingsWasOpen || workbenchWasOpen) {
    panel.classList.add(SIDE_PANEL_INSTANT_CLASS);
    window.requestAnimationFrame(() => panel.classList.remove(SIDE_PANEL_INSTANT_CLASS));
  }
  if (settingsWasOpen) window.requestAnimationFrame(() => leaveSettingsSurfaceSync());
  else leaveSettingsSurfaceSync();
  // Close workbench only after the new panel is visible to avoid webview flashes.
  if (workbenchWasOpen) window.requestAnimationFrame(() => leaveWorkbenchSurfaceSync());
  else leaveWorkbenchSurfaceSync();
  if (hubWasOpen) window.requestAnimationFrame(() => closeToolsHub());
  else {
    syncRailPanelActive();
    syncWebviewInteractionLayer();
  }
  if (id === "browserSettingsPanel") notifyBrowserChromeSettingsSide(true);
}

function runQuickCommand(cmd, opts) {
  const closeHub = opts && opts.closeHub;
  if (!cmd) return;
  try {
    const qp = document.getElementById("quickPanel");
    const qb = document.getElementById("quickPanelBtn");
    if (qp) qp.style.display = "none";
    if (qb) qb.classList.remove("tools-open");

    if (cmd === "click" || cmd === "fill") {
      const pickerTool = TOOLS.find((t) => t.id === "picker");
      if (pickerTool && !pickerTool.active) {
        pickerTool.active = true;
        pickerTool.toggle(true);
        const list = document.getElementById("toolsList");
        if (list) {
          const card = list.querySelector(`[data-tool-id="picker"]`);
          if (card) card.classList.add("tool-active");
        }
      }
      return;
    }

    if (cmd === "picker" || cmd === "pickerInteractive" || cmd === "elemshot") {
      const tool = TOOLS.find((t) => t.id === cmd);
      if (tool) {
        tool.active = !tool.active;
        tool.toggle(tool.active);
        syncToolState(tool.id, tool.active);
      }
      return;
    }

    const activeSid = activeSessionId || "s_ab12cd";
    const val = getToolTemplateLine(cmd, activeSid) || "";
    const chatInputEl = document.getElementById("chatInput");
    const chatInputMd = document.getElementById("chatInputMd");
    if (!val) {
      showToast("No template for this quick command");
      return;
    }
    chatInputMd.style.display = "none";
    chatInputEl.style.display = "block";
    chatInputEl.value = val;
    chatInputEl.style.height = "auto";
    chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + "px";
    chatInputEl.focus();
    chatInputEl.setSelectionRange(val.length, val.length);
  } finally {
    if (closeHub) closeToolsHub();
  }
}

function initDataPanels() {
  renderBookmarks();
  renderHistory();
  renderPasswords();
}

// ── Browser Import ────────────────────────────────────────
async function runBrowserImport(target) {
  if (USE_REACT_MODALS) {
    window.dispatchEvent(
      new CustomEvent("browser-import-busy", { detail: { busy: true } }),
    );
  }
  const overlay = document.getElementById("importOverlay");
  if (overlay && !USE_REACT_MODALS) overlay.style.display = "flex";
  try {
    const result = await window.electronAPI.browserImport();
    const p = getProfile();

    if (target === "bookmarks" || target === "all") {
      let added = 0;
      const existingUrls = new Set(p.bookmarks.map((b) => b.url));
      result.bookmarks.forEach((b) => {
        if (!existingUrls.has(b.url)) {
          p.bookmarks.push(b);
          added++;
        }
      });
      if (target === "bookmarks")
        showToast(
          `✅ Imported ${added} bookmarks from: ${result.sources.join(", ") || "none found"}`,
        );
    }
    if (target === "history" || target === "all") {
      let added = 0;
      const existingUrls = new Set(p.history.map((h) => h.url));
      result.history.forEach((h) => {
        if (!existingUrls.has(h.url)) {
          p.history.push(h);
          added++;
        }
      });
      if (target === "history")
        showToast(`✅ Imported ${added} history entries`);
    }
    if (target === "passwords" || target === "all") {
      result.passwords.forEach((pw) => p.passwords.push(pw));
      if (target === "passwords")
        showToast(
          `✅ Found ${result.passwords.length} password entries (see notes)`,
        );
    }

    if (target === "all")
      showToast(
        `✅ Import done from: ${result.sources.join(", ") || "no browsers found"}`,
      );
    await saveProfile();
    initDataPanels();
  } catch (err) {
    showToast("❌ Import failed: " + err.message);
  } finally {
    if (USE_REACT_MODALS) {
      window.dispatchEvent(
        new CustomEvent("browser-import-busy", { detail: { busy: false } }),
      );
    }
    if (overlay) overlay.style.display = "none";
  }
}

// ── Wire up all panel buttons ─────────────────────────────
function setupDataPanelButtons() {
  // Nav bar buttons
  document.getElementById("railWebviewBtn").onclick = () => showWebviewOnly();
  document.getElementById("sessionsBtn").onclick = () => toggleSidePanel("sessionsPanel");
  document.getElementById("bookmarksBtn").onclick = () =>
    toggleSidePanel("bookmarksPanel");
  document.getElementById("historyBtn").onclick = () =>
    toggleSidePanel("historyPanel");
  document.getElementById("passwordsBtn").onclick = () =>
    toggleSidePanel("passwordsPanel");
  document.getElementById("networkWorkbenchBtn").onclick = () => {
    // Close other surfaces first to avoid flashes
    closeSidePanels();
    closeToolsHub();
    leaveSettingsSurfaceSync();
    document.getElementById("webviewContainer")?.setAttribute("data-workbench-open", "");
    window.dispatchEvent(new CustomEvent("react-open-workbench"));
    syncRailPanelActive();
    syncWebviewInteractionLayer();
  };
  document.getElementById("toolsHubBtn").onclick = () => toggleToolsHub();

  // Bookmark star
  document.getElementById("bookmarkStarBtn").onclick = () => {
    const url = browserFrame.getURL ? browserFrame.getURL() : "";
    const title = getTab(activeTabId)?.title || url;
    const p = getProfile();
    if (p.bookmarks.find((b) => b.url === url)) removeBookmark(url);
    else addBookmark(url, title);
  };

  // Close buttons
  document.getElementById("closeBookmarksBtn").onclick = closeSidePanels;
  document.getElementById("closeHistoryBtn").onclick = closeSidePanels;
  document.getElementById("closePasswordsBtn").onclick = closeSidePanels;
  document.getElementById("closeSessionsBtn").onclick = closeSidePanels;

  // Import buttons
  document.getElementById("importBookmarksBtn").onclick = () =>
    runBrowserImport("bookmarks");
  document.getElementById("importHistoryBtn").onclick = () =>
    runBrowserImport("history");
  document.getElementById("importPasswordsBtn").onclick = () =>
    runBrowserImport("passwords");

  // Clear history
  document.getElementById("clearHistoryBtn").onclick = () => {
    if (!confirm("Clear all history?")) return;
    getProfile().history = [];
    saveProfile();
    renderHistory();
    showToast("🗑 History cleared");
  };

  // Search inputs
  document
    .getElementById("bookmarkSearch")
    .addEventListener("input", (e) => renderBookmarks(e.target.value));
  document
    .getElementById("historySearch")
    .addEventListener("input", (e) => renderHistory(e.target.value));
  document
    .getElementById("passwordSearch")
    .addEventListener("input", (e) => renderPasswords(e.target.value));

  // Search clear buttons
  const wireSearchClear = (inputId, rerender) => {
    const input = document.getElementById(inputId);
    const btn = document.querySelector(`.side-search-clear[data-clear="${inputId}"]`);
    if (!input || !btn) return;
    btn.addEventListener("click", () => {
      input.value = "";
      input.focus();
      rerender("");
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        rerender("");
      }
    });
  };
  wireSearchClear("bookmarkSearch", renderBookmarks);
  wireSearchClear("historySearch", renderHistory);
  wireSearchClear("passwordSearch", renderPasswords);

  // Add password form
  const pwAddForm = document.getElementById("pwAddForm");
  const pwUrlEl = document.getElementById("pwUrl");
  const pwUserEl = document.getElementById("pwUsername");
  const pwPassEl = document.getElementById("pwPassword");
  const pwEyeBtn = document.getElementById("pwEyeBtn");

  document.getElementById("addPasswordBtn").onclick = () => {
    pwAddForm.style.display =
      pwAddForm.style.display === "none" ? "flex" : "none";
    if (pwAddForm.style.display === "flex") {
      // Pre-fill URL from current page
      pwUrlEl.value = browserFrame.getURL ? browserFrame.getURL() : "";
      pwUserEl.value = "";
      pwPassEl.value = "";
      pwUrlEl.focus();
    }
  };
  document.getElementById("pwCancelBtn").onclick = () => {
    pwAddForm.style.display = "none";
  };
  pwEyeBtn.onclick = () => {
    pwPassEl.type = pwPassEl.type === "password" ? "text" : "password";
    pwEyeBtn.textContent = pwPassEl.type === "password" ? "👁" : "🙈";
  };
  document.getElementById("pwSaveBtn").onclick = () => {
    const url = pwUrlEl.value.trim();
    const user = pwUserEl.value.trim();
    const pass = pwPassEl.value;
    if (!url || !user || !pass) {
      showToast("⚠ Fill all fields");
      return;
    }
    getProfile().passwords.unshift({
      url,
      username: user,
      password: pass,
      addedAt: Date.now(),
    });
    saveProfile();
    renderPasswords();
    pwAddForm.style.display = "none";
    showToast("🔑 Password saved");
  };

  // Dismiss data panels on outside mousedown (capture: runs before controls; webview uses shield + pointer-events)
  document.addEventListener(
    "mousedown",
    (e) => {
      if (!document.querySelector(".side-panel.side-panel--open")) return;
      const t = e.target;
      if (t.closest("#bookmarksPanel,#historyPanel,#passwordsPanel,#sessionsPanel")) return;
      if (t.closest("#leftToolRail")) return;
      closeSidePanels();
    },
    true,
  );

  // Ctrl+D to bookmark
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      document.getElementById("bookmarkStarBtn").click();
    }
  });
}

function reloadOrStopNav() {
  if (isLoading) {
    browserFrame.stop();
    setLoading(false);
  } else {
    browserFrame.reload();
    setLoading(true);
  }
}

function bridgeFindInPageQuery(q) {
  lastFindQuery = q || "";
  if (lastFindQuery) browserFrame.findInPage(lastFindQuery);
  else browserFrame.stopFindInPage("clearSelection");
}

function bridgeFindNext() {
  if (!lastFindQuery) return;
  browserFrame.findInPage(lastFindQuery, { forward: true, findNext: true });
}

function bridgeFindPrev() {
  if (!lastFindQuery) return;
  browserFrame.findInPage(lastFindQuery, { forward: false, findNext: true });
}

function getNavState() {
  if (!browserFrame) {
    let addr = "";
    try {
      addr = addressBar && addressBar.value ? addressBar.value : "";
    } catch {
      /* ignore */
    }
    return {
      address: addr,
      canGoBack: false,
      canGoForward: false,
      isLoading,
      zoomPercent: Math.round(100 * Math.pow(1.2, zoomLevel)),
      zoomLevel,
      findActive,
      findQuery: lastFindQuery,
      findMatchText: findMatchDisplay,
      securityIconClass: "security-icon",
      statusSecurityText: statusSecurity && statusSecurity.textContent ? statusSecurity.textContent : "",
      isBookmarked: false,
    };
  }
  let url = "";
  try {
    url = browserFrame.getURL ? browserFrame.getURL() : "";
  } catch {
    /* ignore */
  }
  const addr = addressBar ? addressBar.value : url;
  let canBack = false;
  let canForward = false;
  try {
    canBack = browserFrame.canGoBack();
    canForward = browserFrame.canGoForward();
  } catch {
    /* ignore */
  }
  const pct = Math.round(100 * Math.pow(1.2, zoomLevel));
  let secClass = "security-icon";
  try {
    const u = url || addr;
    if (u && u.startsWith("https://")) secClass += " secure";
    else if (u && (u.startsWith("about:") || u.startsWith("file://"))) secClass += " local";
    else if (u) secClass += " insecure";
  } catch {
    /* ignore */
  }
  let isBookmarked = false;
  try {
    const tab = getTab(activeTabId);
    let live = "";
    try {
      live = browserFrame.getURL ? browserFrame.getURL() : "";
    } catch {
      /* ignore */
    }
    const tabUrl = tab && tab.url && tab.url !== "about:blank" ? tab.url : "";
    const bookmarkCheckUrl = tabUrl || live;
    isBookmarked =
      !!bookmarkCheckUrl &&
      bookmarkCheckUrl !== "about:blank" &&
      getProfile().bookmarks.some((b) => b.url === bookmarkCheckUrl);
  } catch {
    /* ignore */
  }
  return {
    address: addr,
    canGoBack: canBack,
    canGoForward: canForward,
    isLoading,
    zoomPercent: pct,
    zoomLevel,
    findActive,
    findQuery: lastFindQuery,
    findMatchText: findMatchDisplay,
    securityIconClass: secClass,
    statusSecurityText: statusSecurity ? statusSecurity.textContent : "",
    isBookmarked,
  };
}

// Transitional compatibility bridge (keep in sync with src/types/global.d.ts):
// React consumes imperative tab/nav/profile/modal/chat helpers while core tab + webview
// logic remains here until state moves into src/renderer/state.
window.legacyBrowser = {
  newTab: () => createTab(),
  createTabWithUrl: (url) => {
    if (!url || !String(url).trim()) {
      createTab();
      return;
    }
    const u = resolveInput(String(url).trim());
    createTab(u || homePage);
  },
  navigate: (url) => navigateTo(url),
  back: () => browserFrame && browserFrame.canGoBack() && browserFrame.goBack(),
  forward: () => browserFrame && browserFrame.canGoForward() && browserFrame.goForward(),
  reload: () => browserFrame && browserFrame.reload(),
  reloadOrStop: () => reloadOrStopNav(),
  goHome: () => navigateTo(homePage),
  getWebviewElement: () => browserFrame,
  clickUi: (id) => {
    const el = document.getElementById(id);
    if (el) el.click();
  },
  openDevTools: () => {
    if (!browserFrame) return;
    if (browserFrame.isDevToolsOpened()) browserFrame.closeDevTools();
    else browserFrame.openDevTools();
  },
  openScreenshotMenu: () => toggleScreenshotMenu(),
  getNavState,
  findInPageQuery: (q) => bridgeFindInPageQuery(q),
  findNext: () => bridgeFindNext(),
  findPrev: () => bridgeFindPrev(),
  toggleFind: () => toggleFind(),
  closeFind: () => closeFind(),
  zoomIn: () => applyZoom(zoomLevel + 1),
  zoomOut: () => applyZoom(zoomLevel - 1),
  zoomReset: () => applyZoom(0),
  getTabs: () =>
    tabs.map((t) => ({
      id: t.id,
      publicId: t.publicId,
      title: t.title || "New Tab",
      url: t.url,
      loading: !!t.loading,
      favicon: t.favicon,
    })),
  switchTabById: (id) => switchTab(id),
  closeTabById: (id) => closeTab(id),
  reorderTabs: (movedId, targetId, side) => reorderTabs(movedId, targetId, side),
  getState: () => {
    let activeUrl = "";
    let canGoBack = false;
    let canGoForward = false;
    try {
      if (browserFrame) {
        activeUrl = browserFrame.getURL ? browserFrame.getURL() : "";
        canGoBack = browserFrame.canGoBack ? browserFrame.canGoBack() : false;
        canGoForward = browserFrame.canGoForward ? browserFrame.canGoForward() : false;
      }
    } catch {
      /* ignore */
    }
    return {
    activeTabId,
    activeSessionId,
    tabCount: tabs.length,
    activeUrl,
    canGoBack,
    canGoForward,
    isLoading,
    useReactTabsUi: USE_REACT_TABS_UI,
    useReactNavUi: USE_REACT_NAV_UI,
    useReactSidePanelsUi: USE_REACT_SIDE_PANELS,
    useReactModalsUi: USE_REACT_MODALS,
    useReactToastUi: USE_REACT_TOAST,
    useReactChatResizeUi: USE_REACT_CHAT_RESIZE,
  };
  },
  getSessions: () => listSessions(),
  getActiveSessionId: () => activeSessionId,
  switchSessionById: (sessionId) => switchSession(String(sessionId || "")),
  createSession: (headless) => {
    const s = createSessionState(!!headless);
    return { id: s.id, headless: s.headless };
  },
  killSessionById: (sessionId) => killSessionById(String(sessionId || "")),
  getProfileSnapshot: () => {
    const p = getProfile();
    return {
      name: p.name,
      bookmarks: [...p.bookmarks],
      history: [...p.history],
      passwords: [...p.passwords],
    };
  },
  navigateToUrl: (url) => navigateTo(url),
  closeSidePanels: () => closeSidePanels(),
  syncRailAndWebview: () => {
    syncRailPanelActive();
    syncWebviewInteractionLayer();
  },
  toggleSidePanel: (panelId) => toggleSidePanel(panelId),
  showToast: (msg, duration = 3000) => showToast(msg, duration),
  removeBookmarkByUrl: (url) => removeBookmark(url),
  clearAllHistory: () => {
    if (!confirm("Clear all history?")) return;
    getProfile().history = [];
    saveProfile();
    renderHistory();
    showToast("🗑 History cleared");
  },
  deletePasswordEntry: (url, username) => {
    const p = getProfile();
    const idx = p.passwords.findIndex((pw) => pw.url === url && pw.username === username);
    if (idx > -1) {
      p.passwords.splice(idx, 1);
      saveProfile();
      renderPasswords();
    }
  },
  getHomePage: () => homePage,
  setHomePage: (url) => {
    const val = (url || "").trim();
    if (!val) return;
    homePage = normalizeHomePageUrl(val);
    localStorage.setItem("homePage", homePage);
  },
  applyTheme: (name) => applyTheme(name),
  initDataPanels: () => initDataPanels(),
  loadProfileByName: async (name) => {
    await loadProfile(name);
  },
  createProfileFromName: async (name) => {
    const n = (name || "").trim();
    if (!n) return;
    currentProfile = { name: n, bookmarks: [], history: [], passwords: [] };
    await saveProfile();
    initDataPanels();
    showToast(`✅ Profile "${n}" created`);
  },
  runBrowserImportTarget: (target) => runBrowserImport(target),
  getChatOpen: () => chatOpen,
  setChatPanelOpen: (open) => setChatOpen(!!open),
  runAutomationCommand: async (cmd) => runAutomationCommand(cmd, getKernelAutomationContext()),
  dispatchAutomationLine: async (line) => dispatchAutomationLine(line, getKernelAutomationContext()),
  openToolsHub: () => openToolsHub(),
  closeToolsHub: () => closeToolsHub(),
  toggleToolsHub: () => toggleToolsHub(),
  runQuickCommand: (cmd, opts) => runQuickCommand(cmd, opts),
  enterBrowserWorkspace: () => enterBrowserWorkspace(),
  enterIntelligentWorkspace: () => enterIntelligentWorkspace(),
  enterSettingsWorkspace: (panel) => enterSettingsWorkspace(panel === "browser" ? "browser" : "intelligent"),
  openIntelligentAssistantSettings: () => openIntelligentAssistantSettings(),
  /** Toggles browser settings side column (same as rail Settings in browser workspace). */
  openBrowserChromeSettingsOverlay: () => toggleSidePanel("browserSettingsPanel"),
  closeBrowserSettingsSidePanel: () => closeBrowserSettingsSidePanel(),
  startBrowserPagePickerAny: () => startElementPicker("any"),
  startBrowserPagePickerInteractive: () => startElementPicker("interactive"),
  startBrowserPageElementScreenshot: () => startElementScreenshot(),
};

  window.__mcpInvokeAutomation = async (cmd) => runAutomationCommand(cmd, getKernelAutomationContext());

  // ── Register startup gate callbacks FIRST — before any setup that might throw ──
  // This guarantees tabs are created and the loading overlay is cleared regardless
  // of whether any optional setup function encounters an error.
  if (USE_REACT_MODALS) {
    window.addEventListener(
      "profile-gate-complete",
      () => {
        setProfileGateBackdrop(false);
        ensureActiveShellReady();
      },
      { once: true },
    );
    window.setTimeout(() => {
      ensureActiveShellReady();
      setProfileGateBackdrop(false);
    }, 450);
  }

  // ── Setup calls — each isolated so one failure can't block shell init ──
  try { setupTitleBar(); } catch (e) { console.warn("[kernel] setupTitleBar:", e); }
  try { setupTheme(); } catch (e) { console.warn("[kernel] setupTheme:", e); }
  try {
    if (USE_REACT_MODALS) {
      hideLegacyModalContainers();
      wireReactSettingsButtons();
    } else {
      setupSettings();
    }
  } catch (e) { console.warn("[kernel] setupModalsOrSettings:", e); }
  try { setupKeyboardShortcuts(); } catch (e) { console.warn("[kernel] setupKeyboardShortcuts:", e); }
  try { setupNavEvents(); } catch (e) { console.warn("[kernel] setupNavEvents:", e); }
  try { setupFindBar(); } catch (e) { console.warn("[kernel] setupFindBar:", e); }
  try { setupZoom(); } catch (e) { console.warn("[kernel] setupZoom:", e); }
  try { setupChat(); } catch (e) { console.warn("[kernel] setupChat:", e); }
  try { setupChatPanel(); } catch (e) { console.warn("[kernel] setupChatPanel:", e); }
  try { setupChatPanelLinks(); } catch (e) { console.warn("[kernel] setupChatPanelLinks:", e); }
  try { setupToolsPanel(); } catch (e) { console.warn("[kernel] setupToolsPanel:", e); }
  try { if (!USE_REACT_CHAT_RESIZE) setupResizeHandle(); } catch (e) { console.warn("[kernel] setupResizeHandle:", e); }
  try { setupDataPanelButtons(); } catch (e) { console.warn("[kernel] setupDataPanelButtons:", e); }
  try { if (!USE_REACT_MODALS) setupImportWizard(); } catch (e) { console.warn("[kernel] setupImportWizard:", e); }
  try { if (!USE_REACT_MODALS) { loadSystemInfo(); setupProfileModal(); checkFirstRun(); } } catch (e) { console.warn("[kernel] legacyProfileSetup:", e); }

  window.addEventListener("tools-hub-breadcrumb", (e: Event) => {
    const d = (e as CustomEvent<{ parts?: unknown }>).detail;
    const parts = Array.isArray(d?.parts) ? (d?.parts as unknown[]) : [];
    const cleaned = parts
      .map((p) => (typeof p === "string" ? p : String(p ?? "")).trim())
      .filter(Boolean)
      .slice(0, 6);
    lastToolsHubCrumbs = cleaned.length ? cleaned : ["Tool Hub"];
    syncTopChromeForSurface();
  });

  // ── Final shell bootstrap — always runs even if some setup above failed ──
  if (!USE_REACT_MODALS) ensureActiveShellReady();
  try { syncRailPanelActive(); } catch (e) { /* ignore */ }
  try { syncWebviewInteractionLayer(); } catch (e) { /* ignore */ }
  ensureActiveShellReady();
  try {
    ensureConversationBootstrap();
    renderChatFromActiveConversation();
    refreshChatHistoryList();
    if (newChatBtn)
      newChatBtn.onclick = () => {
        if (typeof window.__aiChatNewConversation === "function") window.__aiChatNewConversation();
        else startNewConversation();
      };
    applyShellWorkspaceUi(loadShellWorkspacePreference());
  } catch (e) {
    console.warn("[kernel] conversation / workspace bootstrap:", e);
  }
  try {
    initUiTooltips();
  } catch (e) {
    console.warn("[kernel] initUiTooltips:", e);
  }
  traceKernel("initBrowserKernel completed");
}
