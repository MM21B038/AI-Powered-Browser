import { useEffect, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../../state/toast-store";

export function ToastBridge(): ReactElement | null {
  const message = useToastStore((s) => s.message);
  const visible = useToastStore((s) => s.visible);
  const durationMs = useToastStore((s) => s.durationMs);
  const show = useToastStore((s) => s.show);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{ msg: string; duration?: number }>;
      const d = ce.detail;
      if (!d?.msg) return;
      show(d.msg, typeof d.duration === "number" ? d.duration : 3000);
    };
    window.addEventListener("legacy-toast", onToast);
    return () => window.removeEventListener("legacy-toast", onToast);
  }, [show]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => hide(), durationMs);
    return () => window.clearTimeout(t);
  }, [visible, durationMs, hide, message]);

  const host = typeof document !== "undefined" ? document.getElementById("toast") : null;
  if (!host) return null;

  return createPortal(
    <div className={`toast${visible ? " show" : ""}`}>{message}</div>,
    host,
  );
}
