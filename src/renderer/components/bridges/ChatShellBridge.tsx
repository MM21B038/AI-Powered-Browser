import { useEffect, type ReactElement } from "react";
import { useChatStore } from "../../state/chat-store";
import {
  applyIntelligentWorkspaceLayoutToDom,
  IW_HISTORY_WIDTH_DEFAULT,
  IW_HISTORY_WIDTH_MIN,
  loadIntelligentWorkspaceLayout,
  saveIntelligentWorkspaceLayout,
} from "../../state/intelligent-workspace-layout";

/**
 * Syncs chat open state with legacy `setChatOpen` and, when enabled, owns the chat resize drag
 * so listeners are not duplicated in the legacy kernel.
 */
export function ChatShellBridge(): ReactElement | null {
  const setOpen = useChatStore((s) => s.setOpen);
  const setPanelWidth = useChatStore((s) => s.setPanelWidth);

  useEffect(() => {
    const bridge = window.legacyBrowser;
    const open = bridge?.getChatOpen?.();
    if (typeof open === "boolean") setOpen(open);
  }, [setOpen]);

  useEffect(() => {
    const onLegacy = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      if (typeof ce.detail?.open === "boolean") setOpen(ce.detail.open);
    };
    window.addEventListener("legacy-chat-open", onLegacy);
    return () => window.removeEventListener("legacy-chat-open", onLegacy);
  }, [setOpen]);

  useEffect(() => {
    const onWs = (e: Event) => {
      const d = (e as CustomEvent<{ workspace?: string }>).detail;
      if (d?.workspace === "intelligent") setOpen(true);
    };
    window.addEventListener("shell-workspace-changed", onWs);
    return () => window.removeEventListener("shell-workspace-changed", onWs);
  }, [setOpen]);

  useEffect(() => {
    const applyIw = () => {
      if (
        document.getElementById("appContainer")?.getAttribute("data-shell-workspace") ===
        "intelligent"
      ) {
        applyIntelligentWorkspaceLayoutToDom();
      }
    };
    applyIw();
    window.addEventListener("shell-workspace-changed", applyIw);
    return () => window.removeEventListener("shell-workspace-changed", applyIw);
  }, []);

  useEffect(() => {
    const resizeEnabled = window.legacyBrowser?.getState?.()?.useReactChatResizeUi;
    if (!resizeEnabled) return;

    const handle = document.getElementById("resizeHandle");
    const chatWrapper = document.getElementById("chatWrapper");
    const chatSection = document.getElementById("chatSection");
    if (!handle || !chatWrapper || !chatSection) return;

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    const onDown = (e: MouseEvent) => {
      if (
        document.getElementById("appContainer")?.getAttribute("data-shell-workspace") ===
        "intelligent"
      ) {
        return;
      }
      dragging = true;
      startX = e.clientX;
      startWidth = chatSection.offsetWidth;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const newWidth = Math.max(260, Math.min(600, startWidth + (startX - e.clientX)));
      chatWrapper.style.flexBasis = `${newWidth}px`;
      chatSection.style.width = `${newWidth}px`;
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    handle.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      handle.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [setPanelWidth]);

  useEffect(() => {
    const handle = document.getElementById("chatHistoryResizeHandle");
    const chatWrapper = document.getElementById("chatWrapper");
    const panel = document.getElementById("chatHistoryPanel");
    const app = document.getElementById("appContainer");
    if (!handle || !chatWrapper || !panel || !app) return;

    let dragging = false;
    let startX = 0;
    let startW = 0;

    const isIntelligent = () => app.getAttribute("data-shell-workspace") === "intelligent";

    const maxHistoryWidth = () => {
      const w = chatWrapper.getBoundingClientRect().width;
      return Math.min(Math.max(120, Math.floor(w * 0.5)), 720);
    };

    const onDown = (e: PointerEvent) => {
      if (!isIntelligent()) return;
      if (panel.classList.contains("chat-history-panel--collapsed")) return;
      dragging = true;
      startX = e.clientX;
      startW = panel.getBoundingClientRect().width;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const maxW = maxHistoryWidth();
      const delta = e.clientX - startX;
      const newW = Math.max(IW_HISTORY_WIDTH_MIN, Math.min(maxW, startW + delta));
      app.style.setProperty("--iw-history-width", `${Math.round(newW)}px`);
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const w = panel.getBoundingClientRect().width;
      const rounded = Math.round(w);
      if (rounded >= IW_HISTORY_WIDTH_MIN) {
        saveIntelligentWorkspaceLayout({ historyWidthPx: rounded });
      }
    };

    const cap = true;
    handle.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, cap);
    document.addEventListener("pointerup", endDrag, cap);
    document.addEventListener("pointercancel", endDrag, cap);
    return () => {
      handle.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove, cap);
      document.removeEventListener("pointerup", endDrag, cap);
      document.removeEventListener("pointercancel", endDrag, cap);
    };
  }, []);

  useEffect(() => {
    const panel = document.getElementById("chatHistoryPanel");
    const collapseBtn = document.getElementById("chatHistoryCollapseBtn");
    const expandBtn = document.getElementById("chatHistoryExpandBtn");
    const app = document.getElementById("appContainer");
    const railNew = document.getElementById("chatHistoryRailNewBtn");
    const railSettings = document.getElementById("chatHistoryRailSettingsBtn");

    const setCollapsed = (collapsed: boolean) => {
      if (!panel || !app) return;
      if (app.getAttribute("data-shell-workspace") !== "intelligent") return;
      const { historyWidthPx } = loadIntelligentWorkspaceLayout();
      app.style.setProperty(
        "--iw-history-width",
        `${Math.max(IW_HISTORY_WIDTH_MIN, historyWidthPx || IW_HISTORY_WIDTH_DEFAULT)}px`,
      );
      panel.classList.toggle("chat-history-panel--collapsed", collapsed);
      panel.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const rail = document.getElementById("chatHistoryCollapsedRail");
      if (rail) {
        rail.hidden = !collapsed;
        rail.setAttribute("aria-hidden", collapsed ? "false" : "true");
      }
      saveIntelligentWorkspaceLayout({ historyCollapsed: collapsed });
    };

    const onCollapse = () => setCollapsed(true);
    const onExpand = () => setCollapsed(false);
    const onRailNew = () => document.getElementById("newChatBtn")?.click();
    const onRailSettings = () =>
      document.getElementById("intelligentWorkspaceSettingsBtn")?.click();

    collapseBtn?.addEventListener("click", onCollapse);
    expandBtn?.addEventListener("click", onExpand);
    railNew?.addEventListener("click", onRailNew);
    railSettings?.addEventListener("click", onRailSettings);
    return () => {
      collapseBtn?.removeEventListener("click", onCollapse);
      expandBtn?.removeEventListener("click", onExpand);
      railNew?.removeEventListener("click", onRailNew);
      railSettings?.removeEventListener("click", onRailSettings);
    };
  }, []);

  return null;
}
