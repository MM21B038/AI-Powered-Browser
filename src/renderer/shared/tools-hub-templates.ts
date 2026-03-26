/**
 * Default chat lines for Tools Hub "Test now" and template display.
 * Align with dispatchAutomationLine (router) and runQuickCommand templates where applicable.
 */

/** Commands that should use runQuickCommand (picker / UI tools) instead of dispatchAutomationLine. */
export function toolUsesQuickCommand(command: string): boolean {
  return ["picker", "pickerInteractive", "elemshot", "click"].includes(command);
}

/** Single-line template shown in the hub and used for Test now (dispatch path). */
export function getToolTemplateLine(command: string): string {
  const map: Record<string, string> = {
    navigate: "go to https://example.com",
    url: "url",
    title: "title",
    back: "back",
    forward: "forward",
    reload: "reload",
    nav: "nav back",
    tab: "tab cycle",
    tabs: "list tabs",
    switchTab: "switch tab 24532",
    newTab: "new tab",
    closeTab: "close tab",
    type: "type Hello",
    scroll: "scroll down",
    wait: "wait 1000ms",
    screenshot: "screenshot",
    viewportMd: "viewport md",
    formSchema: "form schema",
    interactables: "interactables",
    click: "click body",
    fill: 'fill #email with "value"',
    picker: "",
    pickerInteractive: "",
    elemshot: "",
  };
  return map[command] ?? command;
}

export function buildFillCommandLine(selector: string, value: string): string {
  const sel = selector.trim() || "#selector";
  const val = value.trim() || "value";
  if (/[\s"]/.test(val)) return `fill ${sel} with "${val.replace(/"/g, '\\"')}"`;
  return `fill ${sel} with ${val}`;
}

export function buildClickCommandLine(selector: string): string {
  const sel = selector.trim() || "#submit";
  return `click ${sel}`;
}

/** When `selector` is set, uses `fill` / `type into` (targets a field). Otherwise `type` on the focused element. */
export function buildTypeCommandLine(selector: string, text: string): string {
  const sel = selector.trim();
  const t = (text || "").trim() || "Hello";
  const s = sel || "#selector";
  if (/[\s"]/.test(t)) return `type into ${s} with "${t.replace(/"/g, '\\"')}"`;
  return `type into ${s} with ${t}`;
}

export function buildNavigateLine(url: string): string {
  const u = url.trim() || "https://example.com";
  return `go to ${u}`;
}

export function buildNavControlsLine(dir: "back" | "forward" | "reload"): string {
  return `nav ${dir}`;
}

export function buildTabCycleLine(): string {
  return "tab cycle";
}

/** Five-digit tab id for `switch tab 24532`. */
export function buildSwitchTabLine(tabId: string): string {
  const d = tabId.replace(/\D/g, "").slice(0, 5);
  const id = (d.length ? d.padStart(5, "0") : "24532").slice(-5);
  return `switch tab ${id}`;
}

/** Without a full 5-digit id, uses `close tab` (current tab). */
export function buildCloseTabLine(tabId: string): string {
  const d = tabId.replace(/\D/g, "").slice(0, 5);
  if (d.length === 5) return `close tab ${d.padStart(5, "0").slice(-5)}`;
  return "close tab";
}

export function buildWaitLine(amount: number, unit: "ms" | "s"): string {
  const n = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : unit === "s" ? 1 : 1000;
  return unit === "s" ? `wait ${n}s` : `wait ${n}ms`;
}
