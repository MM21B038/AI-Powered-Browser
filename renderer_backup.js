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
  createTab(homePage);
  loadSystemInfo();
});

// ═══════════════════════════════════════════════════════════
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
      fav.innerHTML = `<img src="${tab.favicon}" width="14" height="14" onerror="this.style.display='none'"/>`;
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
    // Inject favicon fetch
    browserFrame
      .executeJavaScript(
        `
      (function() {
        const link = document.querySelector("link[rel~='icon']") ||
                     document.querySelector("link[rel~='shortcut']");
        return link ? link.href : (window.location.origin + '/favicon.ico');
      })()
    `,
      )
      .then((faviconUrl) => {
        const tab = getTab(activeTabId);
        if (tab && faviconUrl) {
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
    const fullImg = await browserFrame.capturePage();
    let dataUrl;
    if (mode === "fullpage") {
      dataUrl = fullImg.toDataURL();
    } else {
      // Crop to viewport: full capture size == viewport physical px at default zoom
      const dpr = window.devicePixelRatio || 1;
      const rect = browserFrame.getBoundingClientRect();
      const vw = Math.round(rect.width * dpr);
      const vh = Math.round(rect.height * dpr);
      const srcImg = new Image();
      srcImg.src = fullImg.toDataURL();
      await new Promise((r) => {
        srcImg.onload = r;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(vw, srcImg.naturalWidth);
      canvas.height = Math.min(vh, srcImg.naturalHeight);
      canvas
        .getContext("2d")
        .drawImage(
          srcImg,
          0,
          0,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      dataUrl = canvas.toDataURL("image/png");
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
      const dpr = window.devicePixelRatio || 1;
      const img = await browserFrame.capturePage({
        x: Math.max(0, Math.round(x * dpr)),
        y: Math.max(0, Math.round(y * dpr)),
        width: Math.max(1, Math.round(w * dpr)),
        height: Math.max(1, Math.round(h * dpr)),
      });
      const dataUrl = img.toDataURL();
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
      const templates = {
        navigate: "go to ",
        fill: "fill [selector] with [value]",
        click: "click [selector]",
        screenshot: "screenshot",
        scroll: "scroll down",
        help: "help",
      };
      const val = templates[btn.dataset.command] || "";
      const qp = document.getElementById("quickPanel");
      const qb = document.getElementById("quickPanelBtn");
      if (qp) qp.style.display = "none";
      if (qb) qb.classList.remove("tools-open");
      chatInputMd.style.display = "none";
      chatInputEl.style.display = "block";
      chatInputEl.value = val;
      updatePreview();
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

  // ── Navigate ──────────────────────────────────────────────
  if (
    t.startsWith("go to ") ||
    t.startsWith("navigate to ") ||
    t.startsWith("open ")
  ) {
    const raw = text.replace(/^(go to|navigate to|open)\s+/i, "").trim();
    const url = resolveInput(raw);
    navigateTo(url);
    return addBotMessage(`Navigating to **${url}**`);
  }

  // ── Screenshot ────────────────────────────────────────────
  if (t === "screenshot" || t === "take screenshot" || t === "capture") {
    await takeScreenshot("viewport");
    return;
  }

  // ── Scroll ────────────────────────────────────────────────
  if (t.startsWith("scroll")) {
    const dir = t.includes("up") ? -600 : 600;
    await browserFrame.executeJavaScript(
      `window.scrollBy({top: ${dir}, behavior: 'smooth'})`,
    );
    return addBotMessage(`Scrolled ${dir > 0 ? "down" : "up"}.`);
  }

  // ── Click ─────────────────────────────────────────────────
  const clickMatch = text.match(/^click\s+(.+)$/i);
  if (clickMatch) {
    const selector = clickMatch[1].trim();
    try {
      const result = await browserFrame.executeJavaScript(`
        (function() {
          // Try CSS selector first
          let el = null;
          try { el = document.querySelector(${JSON.stringify(selector)}); } catch {}
          // Fallback: find by text content
          if (!el) {
            const all = document.querySelectorAll('button, a, input[type="submit"], [role="button"]');
            for (const node of all) {
              if (node.textContent.trim().toLowerCase().includes(${JSON.stringify(selector.toLowerCase())})) {
                el = node; break;
              }
            }
          }
          if (el) { el.click(); return { success: true, tag: el.tagName }; }
          return { success: false };
        })()
      `);
      if (result.success)
        addBotMessage(`✅ Clicked **${selector}** (${result.tag})`);
      else addBotMessage(`❌ Could not find element: **${selector}**`);
    } catch (err) {
      addBotMessage(`❌ Click failed: ${err.message}`);
    }
    return;
  }

  // ── Fill ──────────────────────────────────────────────────
  const fillMatch = text.match(/^fill\s+(.+?)\s+with\s+(.+)$/i);
  if (fillMatch) {
    const selector = fillMatch[1].trim();
    const value = fillMatch[2].trim();
    try {
      const result = await browserFrame.executeJavaScript(`
        (function() {
          let el = null;
          try { el = document.querySelector(${JSON.stringify(selector)}); } catch {}
          if (!el) {
            const inputs = document.querySelectorAll('input, textarea');
            for (const node of inputs) {
              const label = node.placeholder || node.name || node.id || node.getAttribute('aria-label') || '';
              if (label.toLowerCase().includes(${JSON.stringify(selector.toLowerCase())})) {
                el = node; break;
              }
            }
          }
          if (el) {
            el.focus();
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            if (nativeInputValueSetter) nativeInputValueSetter.set.call(el, ${JSON.stringify(value)});
            else el.value = ${JSON.stringify(value)};
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, tag: el.tagName };
          }
          return { success: false };
        })()
      `);
      if (result.success)
        addBotMessage(`✅ Filled **${selector}** with "${value}"`);
      else addBotMessage(`❌ Could not find field: **${selector}**`);
    } catch (err) {
      addBotMessage(`❌ Fill failed: ${err.message}`);
    }
    return;
  }

  // ── Get text / read page ──────────────────────────────────
  if (t === "get text" || t === "read page" || t === "page text") {
    try {
      const text = await browserFrame.executeJavaScript(
        `document.body.innerText.slice(0, 500)`,
      );
      addBotMessage(`📄 Page text (first 500 chars):\n\n${text}`);
    } catch {
      addBotMessage("❌ Could not read page text.");
    }
    return;
  }

  // ── Get URL ───────────────────────────────────────────────
  if (t === "url" || t === "current url" || t === "what url") {
    return addBotMessage(`🔗 Current URL: **${browserFrame.getURL()}**`);
  }

  // ── Reload ────────────────────────────────────────────────
  if (t === "reload" || t === "refresh") {
    browserFrame.reload();
    setLoading(true);
    return addBotMessage("🔄 Reloading page...");
  }

  // ── Back / Forward ────────────────────────────────────────
  if (t === "back" || t === "go back") {
    if (browserFrame.canGoBack()) {
      browserFrame.goBack();
      addBotMessage("⬅ Going back.");
    } else addBotMessage("❌ No page to go back to.");
    return;
  }
  if (t === "forward" || t === "go forward") {
    if (browserFrame.canGoForward()) {
      browserFrame.goForward();
      addBotMessage("➡ Going forward.");
    } else addBotMessage("❌ No page to go forward to.");
    return;
  }

  // ── Zoom ──────────────────────────────────────────────────
  if (t === "zoom in") {
    applyZoom(zoomLevel + 1);
    return addBotMessage("🔍 Zoomed in.");
  }
  if (t === "zoom out") {
    applyZoom(zoomLevel - 1);
    return addBotMessage("🔍 Zoomed out.");
  }
  if (t === "zoom reset") {
    applyZoom(0);
    return addBotMessage("🔍 Zoom reset to 100%.");
  }

  // ── New tab ───────────────────────────────────────────────
  if (t === "new tab") {
    createTab();
    return addBotMessage("✅ Opened new tab.");
  }

  // ── Help ──────────────────────────────────────────────────
  if (t === "help") {
    return addBotMessage(
      `Here's what I can do:\n\n` +
        `• **go to [url/search]** — navigate\n` +
        `• **click [selector or text]** — click element\n` +
        `• **fill [field] with [value]** — fill input\n` +
        `• **scroll down / scroll up** — scroll page\n` +
        `• **screenshot** — capture page\n` +
        `• **get text** — read page content\n` +
        `• **reload** — refresh page\n` +
        `• **back / forward** — navigate history\n` +
        `• **zoom in / zoom out / zoom reset**\n` +
        `• **new tab** — open new tab\n` +
        `• **url** — show current URL`,
    );
  }

  // ── Fallback ──────────────────────────────────────────────
  addBotMessage(
    `I don't understand that command yet. Type **help** to see what I can do.`,
  );
}

// ── Message helpers ───────────────────────────────────────────

function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "message user-message";
  div.innerHTML = `<div class="msg-bubble">${mdToHtml(text)}</div>`;
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
        const fullImg = await browserFrame.capturePage();
        const fullDataUrl = fullImg.toDataURL();

        // r.x/y/w/h = CSS viewport px inside the webview.
        // capturePage() returns physical px = CSS px * DPR.
        // Zoom is already baked into the captured image, so only scale by DPR.
        const dpr = window.devicePixelRatio || 1;
        const px = Math.round(r.x * dpr);
        const py = Math.round(r.y * dpr);
        const pw = Math.max(1, Math.round(r.w * dpr));
        const ph = Math.max(1, Math.round(r.h * dpr));

        const srcImg = new Image();
        srcImg.src = fullDataUrl;
        await new Promise((res) => {
          srcImg.onload = res;
        });
        const canvas = document.createElement("canvas");
        canvas.width = pw;
        canvas.height = ph;
        canvas.getContext("2d").drawImage(srcImg, px, py, pw, ph, 0, 0, pw, ph);
        const dataUrl = canvas.toDataURL("image/png");

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
      // Re-inject picker for next pick (tool stays active)
      pickerActive = false;
      startElementPicker();

      const info = await browserFrame
        .executeJavaScript(
          `
        (function() {
          try {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return { tag: 'unknown', type: '', isClickable: false };
            return {
              tag: el.tagName.toLowerCase(),
              type: el.type || '',
              isClickable: ['a','button','select'].includes(el.tagName.toLowerCase()) || el.getAttribute('role') === 'button'
            };
          } catch { return { tag: 'unknown', type: '', isClickable: false }; }
        })()
      `,
        )
        .catch(() => ({ tag: "unknown", type: "", isClickable: false }));

      const isInput =
        ["input", "textarea"].includes(info.tag) &&
        !["submit", "button", "checkbox", "radio"].includes(info.type);
      const cmd = isInput ? `fill ${sel} with ` : `click ${sel}`;
      // Also paste picker result into textarea
      const chatInputEl = document.getElementById("chatInput");
      const chatInputMd = document.getElementById("chatInputMd");
      chatInputMd.style.display = "none";
      chatInputEl.style.display = "block";
      chatInputEl.value = cmd;
      chatInputEl.style.height = "auto";
      chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + "px";
      chatInputEl.focus();
      chatInputEl.setSelectionRange(cmd.length, cmd.length);
      addBotMessage(
        `✅ Selector: \`${sel}\`\nPasted into input — ${isInput ? "add your value and press Enter" : "press Enter to click"}.`,
      );
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

