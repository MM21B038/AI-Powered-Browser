/**
 * Unified automation command schema for web + informational operations.
 * Used by chat DSL, legacyBrowser.runAutomationCommand, and future AI orchestration.
 */

export type AutomationKind = "action" | "info";

type SessionScoped = { sessionId?: string };

/** When `goto` should resolve (Playwright-style names; `networkidle` is best-effort in Electron). */
export type GotoWaitUntil = "commit" | "domcontentloaded" | "load" | "networkidle";

/** Discriminated union of automation commands */
export type AutomationCommand =
  | ({
      kind: "action";
      op: "goto";
      url: string;
      /** Default: `load`. Use `commit` for fire-and-forget (legacy). */
      waitUntil?: GotoWaitUntil;
      /** Max wait for navigation phase (ms). Default 60000. */
      timeoutMs?: number;
      /** Debounce for `networkidle` after main load (ms). Default 500. */
      networkIdleMs?: number;
    } & SessionScoped)
  | ({
      kind: "action";
      op: "click";
      target: string;
      /** When set, click runs inside this guest iframe (cross-origin safe). */
      guestFrame?: { processId: number; routingId: number };
    } & SessionScoped)
  | ({ kind: "action"; op: "fill"; selector: string; value: string } & SessionScoped)
  | ({ kind: "action"; op: "set_date"; target: string; date: string } & SessionScoped)
  | {
      kind: "action";
      op: "type";
      text: string;
      /** Optional: target a specific element (type into). If absent, uses focused element. */
      selector?: string;
      sessionId?: string;
    }
  | ({ kind: "action"; op: "scroll"; direction: "up" | "down"; amount?: number } & SessionScoped)
  | ({
      kind: "action";
      op: "select";
      /** CSS selector or visible label / control text (same resolution idea as click). */
      selector: string;
      by: "label" | "value" | "index" | "path";
      /** For `path`, use `"Segment1 > Segment2"` (quoted in DSL if needed). */
      value: string | number;
    } & SessionScoped)
  | ({ kind: "action"; op: "toggle_checkbox"; selector: string; checked?: boolean } & SessionScoped)
  | ({ kind: "action"; op: "toggle_radio"; selector: string } & SessionScoped)
  | ({ kind: "action"; op: "upload_file"; selector: string; filePath: string } & SessionScoped)
  | ({ kind: "action"; op: "submit"; selector?: string } & SessionScoped)
  | ({ kind: "action"; op: "press_key"; key: string; modifiers?: string[] } & SessionScoped)
  | ({ kind: "action"; op: "press"; selector: string; holdMs: number } & SessionScoped)
  | ({ kind: "action"; op: "switch_tab"; tabId?: number; titleContains?: string; index?: number } & SessionScoped)
  | ({ kind: "action"; op: "close_tab"; tabId?: number } & SessionScoped)
  | ({ kind: "action"; op: "new_tab"; url?: string } & SessionScoped)
  | ({ kind: "action"; op: "wait_for_selector"; selector: string; timeoutMs?: number } & SessionScoped)
  | ({ kind: "action"; op: "run_js"; script: string; args?: unknown; timeoutMs?: number } & SessionScoped)
  | ({ kind: "action"; op: "wait_ms"; ms: number } & SessionScoped)
  | ({ kind: "action"; op: "reload" } & SessionScoped)
  | ({ kind: "action"; op: "back" } & SessionScoped)
  | ({ kind: "action"; op: "forward" } & SessionScoped)
  | ({ kind: "action"; op: "nav"; direction: "back" | "forward" | "reload" } & SessionScoped)
  | ({ kind: "action"; op: "tab"; action: "cycle" } & SessionScoped)
  | ({ kind: "action"; op: "screenshot"; mode?: "viewport" | "full" } & SessionScoped)
  | ({ kind: "info"; op: "get_url" } & SessionScoped)
  | ({ kind: "info"; op: "get_title" } & SessionScoped)
  | ({ kind: "info"; op: "get_viewport_md" } & SessionScoped)
  | ({ kind: "info"; op: "get_page_text"; maxChars?: number } & SessionScoped)
  | ({ kind: "info"; op: "get_form_schema" } & SessionScoped)
  | ({ kind: "info"; op: "list_tabs" } & SessionScoped)
  | ({ kind: "info"; op: "get_interactables"; limit?: number } & SessionScoped)
  | ({ kind: "info"; op: "browser_search"; query: string; limit?: number } & SessionScoped)
  | ({
      kind: "info";
      op: "scientific_calc";
      expression: string;
      precision?: number;
    } & SessionScoped)
  | {
      kind: "info";
      op: "python_execute";
      packages: string[];
      code: string;
      timeoutMs?: number;
      /** Injected by chat UI: user-attached files written into the sandbox work dir before run. */
      inputFiles?: Array<{ name: string; dataBase64: string }>;
    }
  | { kind: "info"; op: "skill_list" }
  | { kind: "info"; op: "skill_read"; slug: string }
  | { kind: "info"; op: "skill_write"; slug: string; content: string }
  | { kind: "info"; op: "skill_delete"; slug: string }
  | { kind: "action"; op: "session"; headless: boolean }
  | { kind: "action"; op: "kill_session"; sessionId: string };

export interface AutomationTimings {
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface AutomationResult {
  success: boolean;
  kind: AutomationKind;
  op: string;
  error?: string;
  message?: string;
  /** Structured payload (JSON-serializable) */
  data?: unknown;
  observations?: string[];
  artifacts?: { type: "screenshot"; dataUrl?: string }[];
  timings?: AutomationTimings;
  retryable?: boolean;
}

export interface CommandContext {
  tabId?: number;
  timeoutMs?: number;
}
