const STORAGE_KEY = "intelligentWorkspace.layout";

export const IW_HISTORY_WIDTH_DEFAULT = 280;
export const IW_HISTORY_WIDTH_MIN = 200;
export const IW_HISTORY_COLLAPSED_WIDTH_PX = 52;

export type IntelligentWorkspaceLayoutState = {
  historyWidthPx: number;
  historyCollapsed: boolean;
};

export function loadIntelligentWorkspaceLayout(): IntelligentWorkspaceLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        historyWidthPx: IW_HISTORY_WIDTH_DEFAULT,
        historyCollapsed: false,
      };
    }
    const j = JSON.parse(raw) as Record<string, unknown>;
    const w = j.historyWidthPx;
    const historyWidthPx =
      typeof w === "number" && Number.isFinite(w)
        ? Math.round(
            Math.max(
              IW_HISTORY_WIDTH_MIN,
              Math.min(1200, w),
            ),
          )
        : IW_HISTORY_WIDTH_DEFAULT;
    return {
      historyWidthPx,
      historyCollapsed: j.historyCollapsed === true,
    };
  } catch {
    return {
      historyWidthPx: IW_HISTORY_WIDTH_DEFAULT,
      historyCollapsed: false,
    };
  }
}

export function saveIntelligentWorkspaceLayout(
  patch: Partial<IntelligentWorkspaceLayoutState>,
): void {
  const cur = loadIntelligentWorkspaceLayout();
  const next: IntelligentWorkspaceLayoutState = { ...cur, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

/** Apply persisted width and collapsed state to the shell (intelligent workspace only). */
export function applyIntelligentWorkspaceLayoutToDom(): void {
  const app = document.getElementById("appContainer");
  const panel = document.getElementById("chatHistoryPanel");
  const rail = document.getElementById("chatHistoryCollapsedRail");
  if (!app || !panel) return;
  if (app.getAttribute("data-shell-workspace") !== "intelligent") return;

  const { historyWidthPx, historyCollapsed } = loadIntelligentWorkspaceLayout();
  app.style.setProperty("--iw-history-width", `${historyWidthPx}px`);
  panel.classList.toggle("chat-history-panel--collapsed", historyCollapsed);
  panel.setAttribute("aria-expanded", historyCollapsed ? "false" : "true");
  if (rail) {
    rail.hidden = !historyCollapsed;
    rail.setAttribute("aria-hidden", historyCollapsed ? "false" : "true");
  }
}
