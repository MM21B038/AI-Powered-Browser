/**
 * Custom tooltips for elements with `title` or `data-ui-tip`.
 * While visible, `title` is removed so the OS tooltip does not appear; it is restored on hide.
 * If the element had no prior `aria-description`, the same text is set temporarily for screen readers.
 * Opt out: `data-tooltip-native` or `data-no-ui-tip` on the element or an ancestor.
 */

let attached = false;

function resolveTarget(raw: EventTarget | null): HTMLElement | null {
  if (!(raw instanceof Element)) return null;
  const el = raw.closest("[title],[data-ui-tip]");
  return el instanceof HTMLElement ? el : null;
}

function tipText(el: HTMLElement): string {
  const d = el.getAttribute("data-ui-tip");
  if (d != null && d.trim()) return d.trim();
  const t = el.getAttribute("title");
  return t?.trim() ?? "";
}

function eligible(el: HTMLElement): boolean {
  if (el.hasAttribute("data-no-ui-tip")) return false;
  if (el.hasAttribute("data-tooltip-native")) return false;
  if (el.closest("[data-no-ui-tip]")) return false;
  const tag = el.tagName;
  if (tag === "OPTION") return false;
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el instanceof HTMLInputElement && el.disabled) return false;
  if (el instanceof HTMLSelectElement && el.disabled) return false;
  if (el instanceof HTMLTextAreaElement && el.disabled) return false;
  if (el.hasAttribute("disabled")) return false;
  return tipText(el).length > 0;
}

export function initUiTooltips(): void {
  if (typeof document === "undefined" || attached) return;
  attached = true;

  const tip = document.createElement("div");
  tip.id = "uiTooltip";
  tip.className = "ui-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tip);

  let showTimer: ReturnType<typeof window.setTimeout> | null = null;
  let anchor: HTMLElement | null = null;

  function clearTimer(): void {
    if (showTimer != null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function hide(): void {
    clearTimer();
    tip.classList.remove("ui-tooltip--visible", "ui-tooltip--instant");
    tip.textContent = "";
    tip.removeAttribute("data-ui-tip-placement");
    tip.setAttribute("aria-hidden", "true");
    if (anchor) {
      restoreTitleAndDescription(anchor);
      anchor = null;
    }
  }

  function restoreTitleAndDescription(el: HTMLElement): void {
    const b = el.dataset.titleBackup;
    if (b != null) {
      el.setAttribute("title", b);
      delete el.dataset.titleBackup;
    }
    if (el.dataset.uiTipSetDescription === "1") {
      el.removeAttribute("aria-description");
      delete el.dataset.uiTipSetDescription;
    }
  }

  function stashTitleForCustomTip(el: HTMLElement, text: string): void {
    if (!el.hasAttribute("title")) return;
    el.dataset.titleBackup = el.getAttribute("title") ?? "";
    el.removeAttribute("title");
    if (!el.hasAttribute("aria-description")) {
      el.dataset.uiTipSetDescription = "1";
      el.setAttribute("aria-description", text);
    }
  }

  function position(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    let top = r.bottom + margin;
    let place: "below" | "above" = "below";
    if (top + th > vh - 8 && r.top - margin - th >= 8) {
      top = r.top - margin - th;
      place = "above";
    }

    let left = r.left + (r.width - tw) / 2;
    left = Math.max(10, Math.min(left, vw - tw - 10));
    top = Math.max(8, Math.min(top, vh - th - 8));

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.dataset.uiTipPlacement = place;
  }

  function show(el: HTMLElement, text: string, instant: boolean): void {
    anchor = el;
    tip.textContent = text;
    tip.classList.toggle("ui-tooltip--instant", instant);
    tip.classList.remove("ui-tooltip--visible");
    tip.setAttribute("aria-hidden", "false");

    void tip.offsetWidth;
    position(el);
    requestAnimationFrame(() => {
      if (anchor !== el) return;
      position(el);
      tip.classList.add("ui-tooltip--visible");
    });
  }

  document.addEventListener(
    "pointerover",
    (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = resolveTarget(e.target);
      if (!t || !eligible(t)) return;
      if (anchor && anchor !== t) hide();
      if (anchor === t && tip.classList.contains("ui-tooltip--visible")) return;
      clearTimer();
      showTimer = window.setTimeout(() => {
        showTimer = null;
        if (!t.isConnected) return;
        const text = tipText(t);
        if (!text) return;
        stashTitleForCustomTip(t, text);
        show(t, text, false);
      }, 400);
    },
    true,
  );

  document.addEventListener(
    "pointerout",
    (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = resolveTarget(e.target);
      if (!t || !eligible(t)) return;
      const rel = e.relatedTarget;
      if (rel instanceof Node && t.contains(rel)) return;
      if (anchor === t) hide();
      else clearTimer();
    },
    true,
  );

  document.addEventListener(
    "scroll",
    () => {
      hide();
    },
    true,
  );

  window.addEventListener("blur", hide);
  window.addEventListener("resize", hide);

  document.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (anchor && el && !anchor.contains(el)) hide();
    },
    true,
  );

  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
  });

  document.addEventListener("focusin", (e: FocusEvent) => {
    const t = resolveTarget(e.target);
    if (!t || !eligible(t)) return;
    if (anchor === t && tip.classList.contains("ui-tooltip--visible")) return;
    clearTimer();
    showTimer = window.setTimeout(() => {
      showTimer = null;
      if (document.activeElement !== t || !t.isConnected) return;
      const text = tipText(t);
      if (!text) return;
      if (anchor && anchor !== t) hide();
      stashTitleForCustomTip(t, text);
      show(t, text, true);
    }, 90);
  });

  document.addEventListener("focusout", (e: FocusEvent) => {
    const t = resolveTarget(e.target);
    if (t && anchor === t) hide();
    else if (t) clearTimer();
  });
}
