// ═══════════════════════════════════════════════════════════
//  ORION BROWSER — Renderer Process
// ═══════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let zoomLevel = parseFloat(localStorage.getItem("zoomLevel") ?? "-1");
let isLoading = false;
let loadingTimer = null;
let findActive = false;
let homePage = localStorage.getItem("homePage") || "https://www.duckduckgo.com";

// ── DOM Refs ─────────────────────────────────────────────────
const tabScrollArea = document.getElementById("tabScrollArea");
// addTabBtn is rendered dynamically inside renderTabs()
const browserFrame = document.getElementById("browserFrame");
const addressBar = document.getElementById("addressBar");
const clearAddressBtn = document.getElementById("clearAddressBtn");
const addressWrapper = document.getElementById("addressBarWrapper");
const securityIcon = document.getElementById("securityIcon");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const homeBtn = document.getElementById("homeBtn");
const screenshotBtn = document.getElementById("screenshotBtn");
const findBtn = document.getElementById("findBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomLevelEl = document.getElementById("zoomLevel");
const devtoolsBtn = document.getElementById("devtoolsBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsBtnChat = document.getElementById("settingsBtnChat");
const settingsPanel = document.getElementById("settingsPanel");
const settingsOverlay = document.getElementById("settingsOverlay");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const loadingBar = document.getElementById("loadingBar");
const loadingOverlay = document.getElementById("loadingOverlay");
const errorPage = document.getElementById("errorPage");
const errorDesc = document.getElementById("errorDesc");
const errorRetryBtn = document.getElementById("errorRetryBtn");
const statusText = document.getElementById("statusText");
const statusSecurity = document.getElementById("statusSecurity");
const findBar = document.getElementById("findBar");
const findInput = document.getElementById("findInput");
const findCount = document.getElementById("findCount");
const findPrev = document.getElementById("findPrev");
const findNext = document.getElementById("findNext");
const findClose = document.getElementById("findClose");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const toast = document.getElementById("toast");
const tbMinimize = document.getElementById("tbMinimize");
const tbMaximize = document.getElementById("tbMaximize");
const tbClose = document.getElementById("tbClose");
const homePageInput = document.getElementById("homePageInput");
const chatSection = document.getElementById("chatSection");
const chatWrapper = document.getElementById("chatWrapper");
const aiChatToggleBtn = document.getElementById("aiChatToggleBtn");
const closeChatBtn = document.getElementById("closeChatBtn");
let chatOpen = true;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupTitleBar();
  setupTheme();
  setupSettings();
  setupKeyboardShortcuts();
  setupWebviewEvents();
  setupNavEvents();
  setupFindBar();
  setupZoom();
  setupChat();
  setupChatPanel();
  setupToolsPanel();
  setupResizeHandle();
  setupDataPanelButtons();
  createTab(homePage);
  loadSystemInfo();
  setupProfileModal();
});

// -----------------------------------------------------------
//  TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════

function createTab(url = homePage) {
  const id = ++tabCounter;
  tabs.push({
    id,
    url,
    title: "New Tab",
    favicon: null,
    loading: false,
    _new: true,
    initialized: false,
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

function switchTab(id) {
  activeTabId = id;
  const tab = getTab(id);
  if (!tab) return;
  addressBar.value = tab.url === "about:blank" ? "" : tab.url;
  if (!tab.initialized) {
    tab.initialized = true;
    if (!webviewReady) {
      webviewReady = true;
      browserFrame.setAttribute("src", tab.url); // bootstrap guest process
    } else {
      browserFrame.loadURL(tab.url);
    }
  }
  // already-loaded tab: just update UI, don't reload
  updateNavButtons();
  updateSecurityIcon(tab.url);
  renderTabs();
}

function closeTab(id, e) {
  if (e) e.stopPropagation();
  tabs = tabs.filter((t) => t.id !== id);
  if (tabs.length === 0) {
    createTab();
    return;
  }
  if (activeTabId === id) switchTab(tabs[tabs.length - 1].id);
  else renderTabs();
}

function getTab(id) {
  return tabs.find((t) => t.id === id);
}

function renderTabs() {
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
  const url = resolveInput(raw);
  if (!url) return;
  const tab = getTab(activeTabId);
  if (!tab) return;
  tab.url = url;
  tab.initialized = true; // mark so switchTab won't re-load on next switch
  addressBar.value = url;
  browserFrame.loadURL(url);
  setLoading(true);
  updateSecurityIcon(url);
  hideError();
}

function updateNavButtons() {
  try {
    backBtn.disabled = !browserFrame.canGoBack();
    forwardBtn.disabled = !browserFrame.canGoForward();
  } catch {
    /* webview not ready */
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
    loadingBar.classList.add("loading");
    loadingOverlay.style.display = "flex";
    reloadBtn.classList.add("stop-mode");
    reloadBtn.title = "Stop (Esc)";
    reloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  } else {
    loadingBar.classList.remove("loading");
    loadingOverlay.style.display = "none";
    reloadBtn.classList.remove("stop-mode");
    reloadBtn.title = "Reload (F5)";
    reloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.657 6A6 6 0 1 0 12 11.196" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 2.5V6.5H10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

function updateSecurityIcon(url) {
  const isSecure = url && url.startsWith("https://");
  const isLocal =
    url && (url.startsWith("about:") || url.startsWith("file://"));
  securityIcon.className =
    "security-icon" + (isSecure ? " secure" : isLocal ? " local" : " insecure");
  securityIcon.title = isSecure
    ? "Secure connection"
    : isLocal
      ? "Local page"
      : "Not secure";
  statusSecurity.textContent = isSecure
    ? "🔒 Secure"
    : isLocal
      ? ""
      : "⚠ Not Secure";
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

  errorRetryBtn.onclick = () => {
    hideError();
    browserFrame.reload();
    setLoading(true);
  };

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

// ═══════════════════════════════════════════════════════════
//  WEBVIEW EVENTS
// ═══════════════════════════════════════════════════════════

function setupWebviewEvents() {
  browserFrame.addEventListener(
    "dom-ready",
    () => {
      applyZoom(zoomLevel);
      browserFrame
        .insertCSS(
          `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
        )
        .catch(() => {});
    },
    { once: true },
  );

  browserFrame.addEventListener("did-start-loading", () => {
    setLoading(true);
    hideError();
    browserFrame
      .insertCSS(
        `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
      )
      .catch(() => {});
  });

  browserFrame.addEventListener("did-stop-loading", () => {
    setLoading(false);
    updateNavButtons();
  });

  browserFrame.addEventListener("did-finish-load", () => {
    setLoading(false);
    updateNavButtons();
    browserFrame
      .insertCSS(
        `::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}`,
      )
      .catch(() => {});
    // Fallback: read favicon from <link> tags if page-favicon-updated didn't fire
    browserFrame
      .executeJavaScript(
        `(function() {
          const links = [...document.querySelectorAll('link[rel*="icon"]')];
          const best = links.find(l => l.sizes && l.sizes.value === '32x32') || links[0];
          return best ? best.href : null;
        })()`,
      )
      .then((faviconUrl) => {
        const tab = getTab(activeTabId);
        if (tab && faviconUrl && !tab.favicon) {
          tab.favicon = faviconUrl;
          renderTabs();
        }
      })
      .catch(() => {});
  });

  browserFrame.addEventListener("did-navigate", (e) => {
    const url = e.url || browserFrame.getURL();
    addressBar.value = url;
    clearAddressBtn.style.display = url ? "flex" : "none";
    const tab = getTab(activeTabId);
    if (tab) {
      tab.url = url;
      tab.favicon = null; // clear stale favicon on navigation
    }
    updateNavButtons();
    updateSecurityIcon(url);
    hideError();
  });

  browserFrame.addEventListener("did-navigate-in-page", (e) => {
    const url = e.url || browserFrame.getURL();
    addressBar.value = url;
    clearAddressBtn.style.display = url ? "flex" : "none";
    const tab = getTab(activeTabId);
    if (tab) {
      tab.url = url;
    }
    updateNavButtons();
  });

  browserFrame.addEventListener("page-title-updated", (e) => {
    const tab = getTab(activeTabId);
    if (tab && e.title) {
      tab.title = e.title;
      renderTabs();
    }
  });

  browserFrame.addEventListener("page-favicon-updated", (e) => {
    const tab = getTab(activeTabId);
    if (tab && e.favicons && e.favicons.length > 0) {
      tab.favicon = e.favicons[0];
      renderTabs();
    }
  });

  browserFrame.addEventListener("did-fail-load", (e) => {
    // -3 = ERR_ABORTED (user navigated away), ignore
    if (e.errorCode === -3) return;
    setLoading(false);
    showError(`${e.errorDescription} (${e.errorCode})`);
  });

  browserFrame.addEventListener("crashed", () => {
    setLoading(false);
    showError("The page crashed. Click Try Again to reload.");
    addBotMessage(
      "⚠️ The browser tab crashed. I've shown an error page — click Try Again.",
    );
  });

  browserFrame.addEventListener("update-target-url", (e) => {
    statusText.textContent = e.url || "";
  });

  // New window requests — open in new tab instead of external window
  browserFrame.addEventListener("new-window", (e) => {
    e.preventDefault();
    createTab(e.url);
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

screenshotBtn.onclick = (e) => {
  e.stopPropagation();
  toggleScreenshotMenu();
};

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

  // Position below the screenshot button
  const btnRect = screenshotBtn.getBoundingClientRect();
  menu.style.top = btnRect.bottom + 6 + "px";
  menu.style.left = btnRect.left - 60 + "px";
  document.body.appendChild(menu);

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

async function takeScreenshot(mode = "viewport") {
  try {
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
  zoomInBtn.onclick = () => applyZoom(zoomLevel + 1);
  zoomOutBtn.onclick = () => applyZoom(zoomLevel - 1);
  // Show correct % in UI immediately
  zoomLevelEl.textContent = Math.round(100 * Math.pow(1.2, zoomLevel)) + "%";
}

function applyZoom(level) {
  zoomLevel = Math.max(-5, Math.min(5, level));
  localStorage.setItem("zoomLevel", zoomLevel);
  try {
    browserFrame.setZoomLevel(zoomLevel);
  } catch {}
  const pct = Math.round(100 * Math.pow(1.2, zoomLevel));
  zoomLevelEl.textContent = pct + "%";
  zoomLevelEl.classList.add("zoom-pop");
  setTimeout(() => zoomLevelEl.classList.remove("zoom-pop"), 300);
}

// ═══════════════════════════════════════════════════════════
//  FIND IN PAGE
// ═══════════════════════════════════════════════════════════

function setupFindBar() {
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

  browserFrame.addEventListener("found-in-page", (e) => {
    const { activeMatchOrdinal, matches } = e.result;
    findCount.textContent =
      matches > 0 ? `${activeMatchOrdinal}/${matches}` : "No results";
    findCount.style.color = matches > 0 ? "var(--accent)" : "var(--danger)";
  });
}

function toggleFind() {
  findActive = !findActive;
  findBar.style.display = findActive ? "flex" : "none";
  if (findActive) {
    findInput.focus();
    findInput.select();
  } else closeFind();
}

function closeFind() {
  findActive = false;
  findBar.style.display = "none";
  findCount.textContent = "";
  findInput.value = "";
  browserFrame.stopFindInPage("clearSelection");
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
  const openSettings = () => {
    settingsPanel.style.display = "flex";
    settingsOverlay.style.display = "block";
    homePageInput.value = homePage;
  };
  const closeSettings = () => {
    settingsPanel.style.display = "none";
    settingsOverlay.style.display = "none";
  };

  settingsBtn.onclick = openSettings;
  settingsBtnChat.onclick = openSettings;
  closeSettingsBtn.onclick = closeSettings;
  settingsOverlay.onclick = closeSettings;

  document.querySelectorAll(".theme-card").forEach((btn) => {
    btn.onclick = () => applyTheme(btn.dataset.theme);
  });

  homePageInput.addEventListener("change", () => {
    const val = homePageInput.value.trim();
    if (val) {
      homePage = val;
      localStorage.setItem("homePage", val);
    }
  });
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
      addressBar.focus();
      addressBar.select();
    }
    if (ctrl && e.key === "f") {
      e.preventDefault();
      if (!findActive) toggleFind();
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
      devtoolsBtn.click();
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      backBtn.click();
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      forwardBtn.click();
    }
    if (e.key === "Escape" && findActive) {
      closeFind();
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
    chatMessages.innerHTML = "";
    addBotMessage("Chat cleared. How can I help?");
  };

  document.querySelectorAll(".qc-btn").forEach((btn) => {
    btn.onclick = () => {
      const qp = document.getElementById("quickPanel");
      const qb = document.getElementById("quickPanelBtn");
      if (qp) qp.style.display = "none";
      if (qb) qb.classList.remove("tools-open");

      const cmd = btn.dataset.command;
      // click/fill: activate picker so user can point at the element
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

      const templates = {
        navigate: "go to ",
        screenshot: "screenshot",
        scroll: "scroll down",
        help: "help",
      };
      const val = templates[cmd] || "";
      const chatInputEl = document.getElementById("chatInput");
      const chatInputMd = document.getElementById("chatInputMd");
      chatInputMd.style.display = "none";
      chatInputEl.style.display = "block";
      chatInputEl.value = val;
      chatInputEl.style.height = "auto";
      chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + "px";
      chatInputEl.focus();
      chatInputEl.setSelectionRange(val.length, val.length);
    };
  });
}

function submitChat() {
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

async function processCommand(text) {
  const t = text.toLowerCase().trim();

  if (
    t.startsWith("go to ") ||
    t.startsWith("navigate to ") ||
    t.startsWith("open ")
  ) {
    const raw = text.replace(/^(go to|navigate to|open)\s+/i, "").trim();
    const url = resolveInput(raw);
    navigateTo(url);
    return addBotMessage("Navigating to **" + url + "**");
  }

  if (t === "screenshot" || t === "take screenshot" || t === "capture") {
    await takeScreenshot("viewport");
    return;
  }

  if (t.startsWith("scroll")) {
    const dir = t.includes("up") ? -600 : 600;
    await browserFrame.executeJavaScript(
      "window.scrollBy({top:" + dir + ",behavior:'smooth'})",
    );
    return addBotMessage("Scrolled " + (dir > 0 ? "down" : "up") + ".");
  }

  const clickMatch = text.match(/^click\s+(.+)$/i);
  if (clickMatch) {
    const selector = clickMatch[1].trim();
    try {
      const result = await browserFrame.executeJavaScript(
        `(function(){
          function doClick(el) {
            var r = el.getBoundingClientRect();
            var inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
            if (!inView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
            el.focus();
            var r2 = el.getBoundingClientRect();
            var cx = r2.left + r2.width / 2;
            var cy = r2.top + r2.height / 2;
            var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
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
          }
          // 1. Try as CSS selector
          try {
            var el = document.querySelector(${JSON.stringify(selector)});
            if (el) return doClick(el);
          } catch(e) {}
          // 2. Text / aria / title / placeholder match
          var q = ${JSON.stringify(selector.toLowerCase())};
          var nodes = document.querySelectorAll(
            'a,button,input,select,textarea,label,summary,' +
            '[role=button],[role=link],[role=menuitem],[role=option],[role=tab],[role=checkbox],[role=radio],[tabindex]'
          );
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var tx = (n.innerText || n.textContent || '').replace(/\\s+/g,' ').trim().toLowerCase();
            var extras = [
              n.value || '', n.getAttribute('aria-label') || '',
              n.getAttribute('title') || '', n.getAttribute('placeholder') || ''
            ].join(' ').toLowerCase();
            if (tx === q || tx.indexOf(q) !== -1 || extras.indexOf(q) !== -1)
              return doClick(n);
          }
          return { success: false };
        })()`,
      );
      if (result && result.success)
        addBotMessage(
          "\u2705 Clicked **" + selector + "** (" + result.tag + ")",
        );
      else addBotMessage("\u274c Could not find element: **" + selector + "**");
    } catch (err) {
      addBotMessage("\u274c Click failed: " + err.message);
    }
    return;
  }

  const fillMatch = text.match(
    /^(?:fill|type into|type in)\s+(.+?)\s+with\s+(.+)$/i,
  );
  if (fillMatch) {
    await fillElement(fillMatch[1].trim(), fillMatch[2].trim());
    return;
  }

  const typeMatch = text.match(/^type\s+(.+)$/i);
  if (typeMatch) {
    const value = typeMatch[1].trim();
    try {
      const result = await browserFrame.executeJavaScript(
        "(function(){var el=document.activeElement;if(!el||el===document.body)return{success:false};" +
          "var val=" +
          JSON.stringify(value) +
          ";" +
          "if(el.isContentEditable){el.textContent=val;}" +
          "else{var p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;" +
          "var s=Object.getOwnPropertyDescriptor(p,'value');if(s)s.set.call(el,val);else el.value=val;}" +
          "['input','change'].forEach(function(t){el.dispatchEvent(new Event(t,{bubbles:true}));});" +
          "return{success:true,tag:el.tagName.toLowerCase()};})()",
      );
      if (result.success)
        addBotMessage(
          "\u2705 Typed into **" + result.tag + '**: "' + value + '"',
        );
      else
        addBotMessage(
          "\u274c No focused element. Use **fill [field] with [value]** instead.",
        );
    } catch (err) {
      addBotMessage("\u274c Type failed: " + err.message);
    }
    return;
  }

  if (t === "get text" || t === "read page" || t === "page text") {
    try {
      const txt = await browserFrame.executeJavaScript(
        "document.body.innerText.slice(0,500)",
      );
      addBotMessage("\ud83d\udcc4 Page text (first 500 chars):\n\n" + txt);
    } catch {
      addBotMessage("\u274c Could not read page text.");
    }
    return;
  }

  if (t === "url" || t === "current url" || t === "what url")
    return addBotMessage(
      "\ud83d\udd17 Current URL: **" + browserFrame.getURL() + "**",
    );

  if (t === "reload" || t === "refresh") {
    browserFrame.reload();
    setLoading(true);
    return addBotMessage("\ud83d\udd04 Reloading page...");
  }

  if (t === "back" || t === "go back") {
    if (browserFrame.canGoBack()) {
      browserFrame.goBack();
      addBotMessage("\u2b05 Going back.");
    } else addBotMessage("\u274c No page to go back to.");
    return;
  }
  if (t === "forward" || t === "go forward") {
    if (browserFrame.canGoForward()) {
      browserFrame.goForward();
      addBotMessage("\u27a1 Going forward.");
    } else addBotMessage("\u274c No page to go forward to.");
    return;
  }

  if (t === "zoom in") {
    applyZoom(zoomLevel + 1);
    return addBotMessage("\ud83d\udd0d Zoomed in.");
  }
  if (t === "zoom out") {
    applyZoom(zoomLevel - 1);
    return addBotMessage("\ud83d\udd0d Zoomed out.");
  }
  if (t === "zoom reset") {
    applyZoom(0);
    return addBotMessage("\ud83d\udd0d Zoom reset to 100%.");
  }

  if (t === "new tab") {
    createTab();
    return addBotMessage("\u2705 Opened new tab.");
  }

  if (t === "help") {
    return addBotMessage(
      "Here's what I can do:\n\n" +
        "\u2022 **go to [url/search]** \u2014 navigate\n" +
        "\u2022 **click [selector or text]** \u2014 click element\n" +
        "\u2022 **fill [field] with [value]** \u2014 fill input, textarea, select\n" +
        "\u2022 **type [text]** \u2014 type into the currently focused element\n" +
        "\u2022 **scroll down / scroll up** \u2014 scroll page\n" +
        "\u2022 **screenshot** \u2014 capture page\n" +
        "\u2022 **get text** \u2014 read page content\n" +
        "\u2022 **reload** \u2014 refresh page\n" +
        "\u2022 **back / forward** \u2014 navigate history\n" +
        "\u2022 **zoom in / zoom out / zoom reset**\n" +
        "\u2022 **new tab** \u2014 open new tab\n" +
        "\u2022 **url** \u2014 show current URL\n\n" +
        "\ud83d\udca1 Use the **\ud83c\udfaf Element Picker** tool to click any element and get instant action buttons.",
    );
  }

  addBotMessage(
    "I don't understand that command yet. Type **help** to see what I can do.",
  );
}
// ── Message helpers ───────────────────────────────────────────

function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "message user-message";
  div.innerHTML = `<div class="msg-bubble">${mdToHtml(text)}</div>`;
  div.onclick = (e) => {
    if (!e.target.closest("button")) div.classList.toggle("msg-selected");
  };
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
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
  };

  div.querySelector(".ss-discard-btn").onclick = () => {
    div.remove();
    showToast("🗑 Screenshot discarded");
  };
}

function addBotMessage(text) {
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
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mdToHtml(text) {
  let h = escapeHtml(text);
  // fenced code blocks
  h = h.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code${lang ? ` class="lang-${lang}"` : ""}>${code.trimEnd()}</code></pre>`,
  );
  // inline code
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  // headings
  h = h.replace(/^### (.+)$/gm, "<strong><em>$1</em></strong>");
  h = h.replace(/^## (.+)$/gm, "<strong>$1</strong>");
  h = h.replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
  // bold + italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // strikethrough
  h = h.replace(/~~(.+?)~~/g, "<del>$1</del>");
  // unordered list items
  h = h.replace(/^[\-\*] (.+)$/gm, '<span class="md-li">• $1</span>');
  // ordered list items
  h = h.replace(/^\d+\. (.+)$/gm, '<span class="md-li">$1</span>');
  // blockquote
  h = h.replace(/^&gt; (.+)$/gm, '<span class="md-bq">$1</span>');
  // horizontal rule
  h = h.replace(/^---$/gm, '<hr class="md-hr">');
  // links
  h = h.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="md-link">$1</a>',
  );
  // newlines (skip inside pre)
  h = h.replace(/\n/g, "<br>");
  return h;
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

function setChatOpen(open) {
  chatOpen = open;
  chatWrapper.classList.toggle("chat-closed", !open);
  aiChatToggleBtn.classList.toggle("active", open);
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════

let toastTimer = null;
function showToast(msg, duration = 3000) {
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
      if (on) startElementPicker();
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
    otherP.style.display = "none";
    otherBtn.classList.remove("tools-open");
    p.style.display = open ? "block" : "none";
    btn.classList.toggle("tools-open", open);
  }

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

  panelBtn.onclick = (e) => {
    e.stopPropagation();
    togglePanel(panelBtn, panel, quickBtn, quickPanel);
  };
  quickBtn.onclick = (e) => {
    e.stopPropagation();
    togglePanel(quickBtn, quickPanel, panelBtn, panel);
  };

  closeBtn.onclick = () => {
    panel.style.display = "none";
    panelBtn.classList.remove("tools-open");
  };

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== panelBtn) {
      panel.style.display = "none";
      panelBtn.classList.remove("tools-open");
    }
    if (!quickPanel.contains(e.target) && e.target !== quickBtn) {
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
  if (!rearm)
    addBotMessage(
      "📷 **Element Screenshot active** — click any element. Press Esc to cancel.",
    );

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
      startElementScreenshot(true);
    },
    () => {
      stopElementScreenshot();
      addBotMessage("📷 Element screenshot cancelled.");
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

function startElementPicker() {
  if (pickerActive) {
    stopElementPicker();
    return;
  }
  pickerActive = true;

  syncToolState("picker", true);
  showToast("🎯 Click any element on the page to pick its selector...");
  addBotMessage(
    "🎯 **Picker active** — click any element on the page. Press Esc to cancel.",
  );

  browserFrame
    .executeJavaScript(
      `
    (function() {
      if (window.__orionPicker) return;
      window.__orionPicker = true;

      const overlay = document.createElement('div');
      overlay.id = '__orion_highlight';
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7c6af7;background:rgba(124,106,247,0.12);border-radius:3px;transition:all 0.08s;box-shadow:0 0 0 1px rgba(124,106,247,0.4);';
      document.body.appendChild(overlay);

      const label = document.createElement('div');
      label.id = '__orion_label';
      label.style.cssText = 'position:fixed;z-index:2147483647;background:#7c6af7;color:#fff;font:bold 11px/1 monospace;padding:3px 7px;border-radius:4px;pointer-events:none;white-space:nowrap;max-width:400px;overflow:hidden;text-overflow:ellipsis;';
      document.body.appendChild(label);

      function getBestSelector(el) {
        if (el.id && !/^\\d/.test(el.id)) {
          if (document.querySelectorAll('#' + CSS.escape(el.id)).length === 1)
            return '#' + el.id;
        }
        const tag = el.tagName.toLowerCase();
        if (el.name) {
          const s = tag + '[name=' + JSON.stringify(el.name) + ']';
          if (document.querySelectorAll(s).length === 1) return s;
        }
        if (el.placeholder) {
          const s = tag + '[placeholder=' + JSON.stringify(el.placeholder) + ']';
          if (document.querySelectorAll(s).length === 1) return s;
        }
        const al = el.getAttribute('aria-label');
        if (al) {
          const s = tag + '[aria-label=' + JSON.stringify(al) + ']';
          if (document.querySelectorAll(s).length === 1) return s;
        }
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-') && attr.value) {
            const s = tag + '[' + attr.name + '=' + JSON.stringify(attr.value) + ']';
            if (document.querySelectorAll(s).length === 1) return s;
          }
        }
        if (el.type) {
          const s = tag + '[type=' + JSON.stringify(el.type) + ']';
          if (document.querySelectorAll(s).length === 1) return s;
        }
        if (el.className && typeof el.className === 'string') {
          const cls = el.className.trim().split(/\\s+/).filter(c => /^[a-zA-Z_-]/.test(c));
          if (cls.length) {
            const s = tag + '.' + cls.join('.');
            try { if (document.querySelectorAll(s).length === 1) return s; } catch {}
          }
        }
        let path = tag, cur = el;
        while (cur.parentElement && cur.parentElement !== document.body) {
          const siblings = [...cur.parentElement.children].filter(c => c.tagName === cur.tagName);
          const idx = [...cur.parentElement.children].indexOf(cur) + 1;
          path = cur.tagName.toLowerCase() + (siblings.length > 1 ? ':nth-child(' + idx + ')' : '') + ' > ' + path;
          cur = cur.parentElement;
        }
        return path;
      }

      function onMove(e) {
        const el = e.target;
        if (el.id === '__orion_highlight' || el.id === '__orion_label') return;
        const r = el.getBoundingClientRect();
        overlay.style.left   = r.left   + 'px';
        overlay.style.top    = r.top    + 'px';
        overlay.style.width  = r.width  + 'px';
        overlay.style.height = r.height + 'px';
        label.textContent = getBestSelector(el);
        label.style.left = r.left + 'px';
        label.style.top  = Math.max(0, r.top - 22) + 'px';
      }

      function onClick(e) {
        e.preventDefault();
        e.stopPropagation();
        window.__orionPickedSelector = getBestSelector(e.target);
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
        addBotMessage("🎯 Picker cancelled.");
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
  browserFrame
    .executeJavaScript(
      `
    if (window.__orionPicker) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  `,
    )
    .catch(() => {});
}

// Shows an inline action card in chat after the picker selects an element
function showPickerActionPopup(sel, info, canFill, isCheckable) {
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
}

// ═══════════════════════════════════════════════════════════
//  PROFILE SYSTEM
// ═══════════════════════════════════════════════════════════

let currentProfile = null;

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
    if (!profiles.length) {
      listEl.innerHTML = '<div class="modal-empty">No profiles yet</div>';
      return;
    }
    profiles.forEach((name) => {
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
    const name = nameInput.value.trim() || "default";
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
    row.className = "side-item";
    row.innerHTML = `
      <img class="side-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(b.url).hostname)}&sz=16" onerror="this.style.display='none'" width="14" height="14"/>
      <div class="side-item-info">
        <div class="side-item-title">${escapeHtml(b.title)}</div>
        <div class="side-item-url">${escapeHtml(b.url)}</div>
      </div>
      <button class="side-item-del" title="Remove">✕</button>`;
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
  items.slice(0, 300).forEach((h) => {
    const row = document.createElement("div");
    row.className = "side-item";
    const date = new Date(h.visitedAt).toLocaleDateString();
    let hostname = "";
    try {
      hostname = new URL(h.url).hostname;
    } catch {}
    row.innerHTML = `
      <img class="side-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=16" onerror="this.style.display='none'" width="14" height="14"/>
      <div class="side-item-info">
        <div class="side-item-title">${escapeHtml(h.title)}</div>
        <div class="side-item-url">${escapeHtml(h.url)}</div>
      </div>
      <span class="side-item-date">${date}</span>`;
    row.querySelector(".side-item-info").onclick = () => {
      navigateTo(h.url);
      closeSidePanels();
    };
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════
//  PASSWORDS
// ═══════════════════════════════════════════════════════════

function renderPasswords(filter) {
  const list = document.getElementById("passwordsList");
  if (!list) return;
  const q = (
    filter ||
    document.getElementById("passwordSearch")?.value ||
    ""
  ).toLowerCase();
  const p = getProfile();
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
    row.className = "side-item pw-item";
    row.innerHTML = `
      <div class="pw-icon">🔑</div>
      <div class="side-item-info">
        <div class="side-item-title">${escapeHtml(pw.url || "Unknown site")}</div>
        <div class="side-item-url">${escapeHtml(pw.username)}</div>
        ${pw.note ? `<div class="pw-note">${escapeHtml(pw.note)}</div>` : ""}
      </div>
      <div class="pw-actions">
        ${
          !isEncrypted
            ? `
          <button class="pw-copy-btn" data-type="user"  title="Copy username">👤</button>
          <button class="pw-copy-btn" data-type="pass"  title="Copy password">🔒</button>
          <button class="pw-del-btn"                    title="Delete">✕</button>`
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

function closeSidePanels() {
  ["bookmarksPanel", "historyPanel", "passwordsPanel"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function toggleSidePanel(id) {
  const panel = document.getElementById(id);
  const isOpen = panel.style.display !== "none";
  closeSidePanels();
  if (!isOpen) panel.style.display = "flex";
}

function initDataPanels() {
  renderBookmarks();
  renderHistory();
  renderPasswords();
}

// ── Browser Import ────────────────────────────────────────
async function runBrowserImport(target) {
  const overlay = document.getElementById("importOverlay");
  overlay.style.display = "flex";
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
    overlay.style.display = "none";
  }
}

// ── Wire up all panel buttons ─────────────────────────────
function setupDataPanelButtons() {
  // Nav bar buttons
  document.getElementById("bookmarksBtn").onclick = () =>
    toggleSidePanel("bookmarksPanel");
  document.getElementById("historyBtn").onclick = () =>
    toggleSidePanel("historyPanel");
  document.getElementById("passwordsBtn").onclick = () =>
    toggleSidePanel("passwordsPanel");

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

  // Close panels on outside click
  document.addEventListener("click", (e) => {
    ["bookmarksPanel", "historyPanel", "passwordsPanel"].forEach((id) => {
      const panel = document.getElementById(id);
      if (
        panel &&
        panel.style.display !== "none" &&
        !panel.contains(e.target) &&
        ![
          "bookmarksBtn",
          "historyBtn",
          "passwordsBtn",
          "bookmarkStarBtn",
        ].includes(e.target.id) &&
        !e.target.closest(
          "#bookmarksBtn,#historyBtn,#passwordsBtn,#bookmarkStarBtn",
        )
      ) {
        panel.style.display = "none";
      }
    });
  });

  // Ctrl+D to bookmark
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      document.getElementById("bookmarkStarBtn").click();
    }
  });
}

// ── Hook into navigation events to record history + update star ──
const _origNavigateTo = navigateTo;
// Patch did-navigate to record history
browserFrame.addEventListener("did-navigate", (e) => {
  const url = e.url || (browserFrame.getURL ? browserFrame.getURL() : "");
  if (url && currentProfile) {
    const title = getTab(activeTabId)?.title || url;
    addHistoryEntry(url, title);
    updateBookmarkStar(url);
  }
});
browserFrame.addEventListener("page-title-updated", (e) => {
  const url = browserFrame.getURL ? browserFrame.getURL() : "";
  if (url && e.title && currentProfile) {
    const p = getProfile();
    const h = p.history.find((x) => x.url === url);
    if (h) {
      h.title = e.title;
      saveProfile();
    }
  }
});
