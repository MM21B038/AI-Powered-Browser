/**
 * Default chat lines for Tools Hub "Test now" and template display.
 * Align with dispatchAutomationLine (router) and runQuickCommand templates where applicable.
 */

/** Commands that should use runQuickCommand (picker / UI tools) instead of dispatchAutomationLine. */
export function toolUsesQuickCommand(command: string): boolean {
  return ["picker", "pickerInteractive", "elemshot", "click"].includes(command);
}

const SESSION_PLACEHOLDER = "s_ab12cd";

function withSession(line: string, sessionId?: string): string {
  const sid = (sessionId || "").trim() || SESSION_PLACEHOLDER;
  return `${line} in session ${sid}`;
}

/** Single-line template shown in the hub and used for Test now (dispatch path). */
export function getToolTemplateLine(command: string, sessionId?: string): string {
  const map: Record<string, string> = {
    navigate: withSession("go to https://example.com", sessionId),
    url: withSession("url", sessionId),
    title: withSession("title", sessionId),
    back: withSession("back", sessionId),
    forward: withSession("forward", sessionId),
    reload: withSession("reload", sessionId),
    nav: withSession("nav back", sessionId),
    tab: withSession("tab controls", sessionId),
    tabs: withSession("list tabs", sessionId),
    switchTab: withSession("switch tab 24532", sessionId),
    newTab: withSession("new tab", sessionId),
    closeTab: withSession("close tab", sessionId),
    type: withSession("type into #email with Hello", sessionId),
    scroll: withSession("scroll down", sessionId),
    wait: withSession("wait 1000ms", sessionId),
    screenshot: withSession("screenshot", sessionId),
    viewportMd: withSession("viewport md", sessionId),
    formSchema: withSession("form schema", sessionId),
    interactables: withSession("interactables", sessionId),
    click: withSession("click #submit", sessionId),
    fill: withSession('fill #email with "value"', sessionId),
    press: withSession("press #submit for 1200ms", sessionId),
    session: "session headless false",
    killSession: "kill session s_ab12cd",
    picker: "",
    pickerInteractive: "",
    elemshot: "",
  };
  return map[command] ?? command;
}

export function buildFillCommandLine(selector: string, value: string, sessionId?: string): string {
  const sel = selector.trim() || "#selector";
  const val = value.trim() || "value";
  if (/[\s"]/.test(val)) return withSession(`fill ${sel} with "${val.replace(/"/g, '\\"')}"`, sessionId);
  return withSession(`fill ${sel} with ${val}`, sessionId);
}

export function buildClickCommandLine(selector: string, sessionId?: string): string {
  const sel = selector.trim() || "#submit";
  return withSession(`click ${sel}`, sessionId);
}

/** When `selector` is set, uses `fill` / `type into` (targets a field). Otherwise `type` on the focused element. */
export function buildTypeCommandLine(selector: string, text: string, sessionId?: string): string {
  const sel = selector.trim();
  const t = (text || "").trim() || "Hello";
  const s = sel || "#selector";
  if (/[\s"]/.test(t)) return withSession(`type into ${s} with "${t.replace(/"/g, '\\"')}"`, sessionId);
  return withSession(`type into ${s} with ${t}`, sessionId);
}

export function buildNavigateLine(url: string, sessionId?: string): string {
  const u = url.trim() || "https://example.com";
  return withSession(`go to ${u}`, sessionId);
}

export function buildNavControlsLine(dir: "back" | "forward" | "reload", sessionId?: string): string {
  return withSession(`nav ${dir}`, sessionId);
}

export function buildTabCycleLine(sessionId?: string): string {
  // Kept the function name for backwards compatibility, but updated the generated command.
  return withSession("tab controls", sessionId);
}

/** Five-digit tab id for `switch tab 24532`. */
export function buildSwitchTabLine(tabId: string, sessionId?: string): string {
  const d = tabId.replace(/\D/g, "").slice(0, 5);
  const id = (d.length ? d.padStart(5, "0") : "24532").slice(-5);
  return withSession(`switch tab ${id}`, sessionId);
}

/** Without a full 5-digit id, uses `close tab` (current tab). */
export function buildCloseTabLine(tabId: string, sessionId?: string): string {
  const d = tabId.replace(/\D/g, "").slice(0, 5);
  if (d.length === 5) return withSession(`close tab ${d.padStart(5, "0").slice(-5)}`, sessionId);
  return withSession("close tab", sessionId);
}

export function buildWaitLine(amount: number, unit: "ms" | "s", sessionId?: string): string {
  const n = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : unit === "s" ? 1 : 1000;
  return unit === "s" ? withSession(`wait ${n}s`, sessionId) : withSession(`wait ${n}ms`, sessionId);
}

export function buildPressHoldLine(selector: string, holdMs: number, sessionId?: string): string {
  const sel = selector.trim() || "#submit";
  const ms = Number.isFinite(holdMs) && holdMs > 0 ? Math.floor(holdMs) : 1200;
  return withSession(`press ${sel} for ${ms}ms`, sessionId);
}
