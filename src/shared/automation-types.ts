/**
 * Unified automation command schema for web + informational operations.
 * Used by chat DSL, legacyBrowser.runAutomationCommand, and future AI orchestration.
 */

export type AutomationKind = "action" | "info";

/** Discriminated union of automation commands */
export type AutomationCommand =
  | { kind: "action"; op: "goto"; url: string }
  | { kind: "action"; op: "click"; target: string }
  | { kind: "action"; op: "fill"; selector: string; value: string }
  | { kind: "action"; op: "set_date"; target: string; date: string }
  | {
      kind: "action";
      op: "type";
      text: string;
      /** Optional: target a specific element (type into). If absent, uses focused element. */
      selector?: string;
    }
  | { kind: "action"; op: "scroll"; direction: "up" | "down"; amount?: number }
  | { kind: "action"; op: "select"; selector: string; by: "label" | "value" | "index"; value: string | number }
  | { kind: "action"; op: "toggle_checkbox"; selector: string; checked?: boolean }
  | { kind: "action"; op: "toggle_radio"; selector: string }
  | { kind: "action"; op: "upload_file"; selector: string; filePath: string }
  | { kind: "action"; op: "submit"; selector?: string }
  | { kind: "action"; op: "press_key"; key: string; modifiers?: string[] }
  | { kind: "action"; op: "switch_tab"; tabId?: number; titleContains?: string; index?: number }
  | { kind: "action"; op: "close_tab"; tabId?: number }
  | { kind: "action"; op: "new_tab"; url?: string }
  | { kind: "action"; op: "wait_for_selector"; selector: string; timeoutMs?: number }
  | { kind: "action"; op: "wait_ms"; ms: number }
  | { kind: "action"; op: "reload" }
  | { kind: "action"; op: "back" }
  | { kind: "action"; op: "forward" }
  | { kind: "action"; op: "nav"; direction: "back" | "forward" | "reload" }
  | { kind: "action"; op: "tab"; action: "cycle" }
  | { kind: "action"; op: "screenshot"; mode?: "viewport" | "full" }
  | { kind: "info"; op: "get_url" }
  | { kind: "info"; op: "get_title" }
  | { kind: "info"; op: "get_viewport_md" }
  | { kind: "info"; op: "get_page_text"; maxChars?: number }
  | { kind: "info"; op: "get_form_schema" }
  | { kind: "info"; op: "list_tabs" }
  | { kind: "info"; op: "get_interactables"; limit?: number };

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
