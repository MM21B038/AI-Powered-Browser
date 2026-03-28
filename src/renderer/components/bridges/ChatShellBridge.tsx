import { useEffect, type ReactElement } from "react";
import { useChatStore } from "../../state/chat-store";

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

  return null;
}
