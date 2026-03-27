/**
 * Unified automation command schema for web + informational operations.
 * Used by chat DSL, legacyBrowser.runAutomationCommand, and future AI orchestration.
 */

export type AutomationKind = "action" | "info";

type SessionScoped = { sessionId?: string };

/** Discriminated union of automation commands */
export type AutomationCommand =
  | ({ kind: "action"; op: "goto"; url: string } & SessionScoped)
  | ({ kind: "action"; op: "click"; target: string } & SessionScoped)
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
  | ({ kind: "action"; op: "select"; selector: string; by: "label" | "value" | "index"; value: string | number } & SessionScoped)
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
