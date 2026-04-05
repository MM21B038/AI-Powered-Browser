import type { AutomationCommand, AutomationResult, GotoWaitUntil } from "../../../shared/automation-types";
import type { PythonSandboxExecuteResult, UserSkillListItem } from "../../../shared/ipc-types";
import {
  domClick,
  domFill,
  domTypeHuman,
  domPressKey,
  domPressHold,
  domSelectSmart,
  domSetDate,
  domToggleCheckbox,
  domToggleRadio,
  domWaitForSelector,
  type WebviewLike,
} from "./dom-actions";
import {
  buildInteractablesScript,
  FORM_SCHEMA_SCRIPT,
  interactablesMaxIterations,
  INTERACTABLES_MAX_LIMIT,
  VIEWPORT_MARKDOWN_SCRIPT,
} from "./markdown-extractor";
import { searchDuckDuckGoWeb } from "./ddg-search";
import { runScientificCalculator } from "../../services/scientific-calculator";

export interface TabInfo {
  id: number;
  publicId?: number;
  title: string;
  url: string;
}

export type GuestFrameRef = { processId: number; routingId: number; url: string; name: string };

export type InteractableRow = {
  kind?: string;
  label?: string;
  selector?: string;
  role?: string;
  type?: string;
  suggestedCommand?: string;
  /** Primary Butcher MCP tool for this row, when applicable (e.g. butcher_select). */
  suggestedMcpTool?: string;
  /** Short guidance: MCP args shape, by label vs path, iframe ids, etc. */
  toolHint?: string;
  guestFrame?: GuestFrameRef;
};

export interface AutomationKernelContext {
  getBrowserFrame: (sessionId?: string) => WebviewLike | null;
  navigateTo: (raw: string, sessionId?: string) => void;
  resolveInput: (raw: string) => string | null;
  reload: (sessionId?: string) => void;
  goBack: (sessionId?: string) => void;
  goForward: (sessionId?: string) => void;
  createTab: (url?: string, sessionId?: string) => void;
  switchTab: (id: number, sessionId?: string) => void;
  closeTabById: (id: number, sessionId?: string) => void;
  getTabs: (sessionId?: string) => TabInfo[];
  getActiveTabId: (sessionId?: string) => number | null;
  applyZoom: (level: number) => void;
  getZoomLevel: () => number;
  takeScreenshot: (mode?: string, sessionId?: string) => Promise<void>;
  createSession: (headless: boolean) => { id: string; headless: boolean };
  switchSession: (sessionId: string) => boolean;
  killSession: (sessionId: string) => boolean;
  hasSession: (sessionId: string) => boolean;
  /** Host-shell click burst at mapped guest coordinates (survives guest navigation/CSP). */
  showAutomationClickFx?: (
    guestX: number,
    guestY: number,
    guestW: number,
    guestH: number,
    sessionId?: string,
  ) => void;
  /** Collect interactables from cross-origin iframes (main-process WebFrameMain); merges into get_interactables. */
  runGuestChildFrameCollect?: (
    sessionId: string | undefined,
    script: string,
    maxTotal: number,
  ) => Promise<InteractableRow[]>;
  /** Attach before navigateTo; resolves after the matching webview load phase. */
  beginWebviewLoadWait?: (
    sessionId: string | undefined,
    opts: { waitUntil: GotoWaitUntil; timeoutMs: number; networkIdleMs: number },
  ) => Promise<{ ok: true; phase?: string } | { ok: false; error: string; phase?: string }>;
  /** After DOM actions: fast-exit if no load burst, else quiet debounce (background sessions no-op). */
  waitForWebviewAdaptiveSettle?: (
    sessionId: string | undefined,
    opts?: { probeMs?: number; idleMs?: number; maxMs?: number },
  ) => Promise<{ ok: true; phase?: string } | { ok: false; error: string; phase?: string }>;
  canGoBack?: (sessionId?: string) => boolean;
  canGoForward?: (sessionId?: string) => boolean;
  /** Intelligent workspace: run Python in main-process sandbox. */
  runPythonSandbox?: (
    cmd: Extract<AutomationCommand, { op: "python_execute" }>,
  ) => Promise<PythonSandboxExecuteResult>;
  /** User SKILL.md CRUD (main process). */
  userSkillsList?: () => Promise<UserSkillListItem[]>;
  userSkillsRead?: (slug: string) => Promise<{ ok: true; markdown: string } | { ok: false; error: string }>;
  userSkillsWrite?: (slug: string, markdown: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  userSkillsDelete?: (slug: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

function now() {
  return Date.now();
}

const RUN_JS_TIMEOUT_DEFAULT_MS = 8000;
const RUN_JS_TIMEOUT_MAX_MS = 30000;

const GOTO_TIMEOUT_DEFAULT_MS = 60000;
const GOTO_TIMEOUT_MIN_MS = 3000;
const GOTO_TIMEOUT_MAX_MS = 120000;
const GOTO_NETWORK_IDLE_DEFAULT_MS = 500;
const GOTO_NETWORK_IDLE_MIN_MS = 100;
const GOTO_NETWORK_IDLE_MAX_MS = 10000;

function clampGotoTimeoutMs(ms?: number): number {
  const v = Number.isFinite(Number(ms)) ? Math.floor(Number(ms)) : GOTO_TIMEOUT_DEFAULT_MS;
  return Math.min(GOTO_TIMEOUT_MAX_MS, Math.max(GOTO_TIMEOUT_MIN_MS, v));
}

function clampGotoNetworkIdleMs(ms?: number): number {
  const v = Number.isFinite(Number(ms)) ? Math.floor(Number(ms)) : GOTO_NETWORK_IDLE_DEFAULT_MS;
  return Math.min(GOTO_NETWORK_IDLE_MAX_MS, Math.max(GOTO_NETWORK_IDLE_MIN_MS, v));
}

const ADAPTIVE_PROBE_MS = 50;
const ADAPTIVE_IDLE_MS = 400;
const ADAPTIVE_MAX_MS = 4000;

const defaultLoadWaitOpts = () => ({
  waitUntil: "load" as GotoWaitUntil,
  timeoutMs: clampGotoTimeoutMs(undefined),
  networkIdleMs: clampGotoNetworkIdleMs(undefined),
});

/** Attach load listeners, run navigation, await next load (same pattern as goto). */
async function runWithNavigationLoadWait(
  ctx: AutomationKernelContext,
  cmdSessionId: string | undefined,
  runNav: () => void,
): Promise<{ ok: true; unsupported?: boolean; phase?: string } | { ok: false; error: string }> {
  if (!ctx.beginWebviewLoadWait) {
    runNav();
    return { ok: true };
  }
  const waitP = ctx.beginWebviewLoadWait(cmdSessionId, defaultLoadWaitOpts());
  runNav();
  const wr = await waitP;
  if (!wr.ok) {
    if (wr.error === "navigation_wait_unsupported") {
      return { ok: true, unsupported: true, phase: wr.phase };
    }
    return { ok: false, error: wr.error };
  }
  return { ok: true, phase: wr.phase };
}

/** After a successful interaction; does not fail the outer op on timeout. */
async function maybeAdaptiveSettle(ctx: AutomationKernelContext, cmdSessionId: string | undefined): Promise<void> {
  if (!ctx.waitForWebviewAdaptiveSettle) return;
  await ctx.waitForWebviewAdaptiveSettle(cmdSessionId, {
    probeMs: ADAPTIVE_PROBE_MS,
    idleMs: ADAPTIVE_IDLE_MS,
    maxMs: ADAPTIVE_MAX_MS,
  });
}

function finish(
  op: string,
  success: boolean,
  partial: Partial<AutomationResult> & { message?: string },
): AutomationResult {
  return {
    success,
    kind: partial.kind ?? "action",
    op,
    message: partial.message,
    error: partial.error,
    data: partial.data,
    observations: partial.observations,
    artifacts: partial.artifacts,
    timings: partial.timings,
    retryable: partial.retryable,
  };
}

function mdEscapePipes(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTable(headers: string[], rows: Array<Array<string | number | boolean>>): string {
  const h = `| ${headers.map((x) => mdEscapePipes(String(x))).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${r.map((c) => mdEscapePipes(String(c))).join(" | ")} |`)
    .join("\n");
  return [h, sep, body].filter(Boolean).join("\n");
}

function truncateCell(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1))}…` : t;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseFriendlyDateToIso(input: string): string | null {
  const t = (input || "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const low = t.toLowerCase();
  if (low === "today") return toIsoDate(new Date());
  if (low === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }
  // dd/mm/yyyy or mm/dd/yyyy
  const m1 = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    const a = Number(m1[1]);
    const b = Number(m1[2]);
    const y = Number(m1[3]);
    let mm = a;
    let dd = b;
    // If first part > 12, treat as DD/MM
    if (a > 12) {
      dd = a;
      mm = b;
    }
    const d = new Date(y, mm - 1, dd);
    if (d.getFullYear() === y && d.getMonth() === mm - 1 && d.getDate() === dd) return toIsoDate(d);
  }
  // Let Date.parse handle: "Mar 25 2026", "March 25, 2026", etc.
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return toIsoDate(d);
  return null;
}

export function tryParseJsonCommand(text: string): AutomationCommand | null {
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (o && typeof o === "object" && "op" in o && typeof (o as { op: unknown }).op === "string") {
      return o as AutomationCommand;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function splitSessionSuffix(input: string): { raw: string; sessionId?: string } {
  const m = input.match(/\s+in\s+session\s+([a-zA-Z0-9_-]+)\s*$/i);
  if (!m) return { raw: input.trim() };
  return { raw: input.slice(0, m.index).trim(), sessionId: m[1] };
}

export async function runAutomationCommand(cmd: AutomationCommand, ctx: AutomationKernelContext): Promise<AutomationResult> {
  const t0 = now();
  const opName = String((cmd as { op?: unknown }).op || "");
  const sessionAwareOps = new Set([
    "goto",
    "click",
    "fill",
    "set_date",
    "type",
    "scroll",
    "select",
    "toggle_checkbox",
    "toggle_radio",
    "upload_file",
    "submit",
    "press_key",
    "press",
    "switch_tab",
    "close_tab",
    "new_tab",
    "wait_for_selector",
    "run_js",
    "reload",
    "back",
    "forward",
    "nav",
    "tab",
    "screenshot",
    "get_url",
    "get_title",
    "get_viewport_md",
    "get_page_text",
    "get_form_schema",
    "list_tabs",
    "get_interactables",
    "wait_ms",
  ]);
  const cmdSessionId = (cmd as { sessionId?: string }).sessionId;
  if (sessionAwareOps.has(opName) && (!cmdSessionId || !cmdSessionId.trim())) {
    return finish(opName || "unknown", false, {
      kind: cmd.kind,
      op: opName || "unknown",
      error: "session_id_required",
      message: "This command requires **sessionId**. Create one using `session headless true|false`.",
    });
  }
  if (cmdSessionId && !ctx.hasSession(cmdSessionId)) {
    return finish(opName || "unknown", false, {
      kind: cmd.kind,
      op: opName || "unknown",
      error: "invalid_session_id",
      message: `Session not found: **${cmdSessionId}**.`,
    });
  }
  const wv = ctx.getBrowserFrame(cmdSessionId);
  const wrap = (op: string, r: AutomationResult): AutomationResult => ({
    ...r,
    timings: { startedAt: t0, endedAt: now(), durationMs: now() - t0 },
    op,
  });

  try {
    if (cmd.kind === "info") {
      if (
        !wv &&
        cmd.op !== "list_tabs" &&
        cmd.op !== "browser_search" &&
        cmd.op !== "scientific_calc" &&
        cmd.op !== "python_execute" &&
        cmd.op !== "skill_list" &&
        cmd.op !== "skill_read" &&
        cmd.op !== "skill_write" &&
        cmd.op !== "skill_delete"
      ) {
        return wrap(cmd.op, finish(cmd.op, false, { kind: "info", error: "No webview", message: "No page loaded." }));
      }
      switch (cmd.op) {
        case "get_url": {
          const url = (ctx.getBrowserFrame(cmdSessionId) as { getURL?: () => string } | null)?.getURL?.() ?? "";
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: `Current URL: **${url}**`, data: { url } }));
        }
        case "get_title": {
          const title = (await wv!.executeJavaScript("document.title")) as string;
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: `Title: **${title}**`, data: { title } }));
        }
        case "get_viewport_md": {
          const r = (await wv!.executeJavaScript(VIEWPORT_MARKDOWN_SCRIPT)) as { markdown: string };
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message: r.markdown.slice(0, 12000),
              data: { markdown: r.markdown },
            }),
          );
        }
        case "get_page_text": {
          const max = cmd.maxChars ?? 500;
          const txt = (await wv!.executeJavaScript(`document.body.innerText.slice(0,${max})`)) as string;
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: `Page text (first ${max} chars):\n\n${txt}`, data: { text: txt } }));
        }
        case "get_form_schema": {
          const r = (await wv!.executeJavaScript(FORM_SCHEMA_SCRIPT)) as { fields: unknown[] };
          const json = JSON.stringify(r.fields, null, 2);
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: "```json\n" + json.slice(0, 8000) + "\n```", data: r }));
        }
        case "get_interactables": {
          const lim = Math.min(INTERACTABLES_MAX_LIMIT, Math.max(1, cmd.limit ?? 200));
          const iframeBudget = Math.min(120, Math.floor(lim * 0.35));
          const mainCap = lim - iframeBudget;
          const mainScript = buildInteractablesScript(mainCap, interactablesMaxIterations(mainCap));
          const r = (await wv!.executeJavaScript(mainScript)) as { items: InteractableRow[] };
          let items: InteractableRow[] = (r.items || []).map((it) => {
            const row = { ...it };
            delete row.guestFrame;
            return row;
          });

          if (iframeBudget > 0 && typeof ctx.runGuestChildFrameCollect === "function") {
            const subCap = Math.max(24, iframeBudget);
            const subScript = buildInteractablesScript(subCap, interactablesMaxIterations(subCap));
            const extra = await ctx.runGuestChildFrameCollect(cmdSessionId, subScript, iframeBudget);
            items = items.concat(extra);
          }

          items = items.slice(0, lim);
          for (const it of items) {
            if (it.guestFrame && it.selector) {
              const { processId, routingId } = it.guestFrame;
              const base = it.suggestedCommand || `click ${it.selector}`;
              it.suggestedCommand = `${base} (guestProcessId=${processId} guestRoutingId=${routingId})`;
              const ih = (it.toolHint || "").trim();
              const extra =
                " Iframe: include guestProcessId and guestRoutingId on MCP tools that support them (e.g. butcher_click).";
              it.toolHint = ih ? ih + extra : extra.trim();
            }
          }

          const rows = items.map((it) => [
            it.kind ?? "",
            (it.label ?? "").slice(0, 72),
            it.guestFrame ? it.guestFrame.url.slice(0, 56) : "—",
            (it.selector ?? "").slice(0, 96),
            [it.role ? `role=${it.role}` : "", it.type ? `type=${it.type}` : ""].filter(Boolean).join(" "),
            it.suggestedMcpTool ?? "—",
            (it.toolHint ?? "").slice(0, 160),
            (it.suggestedCommand ?? "").slice(0, 200),
          ]);
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message:
                "**Interactables**\n\n" +
                mdTable(
                  ["Kind", "Label", "Frame", "Selector", "Role/Type", "MCP", "How", "Chat command"],
                  rows,
                ) +
                "\n\nRows **select** / **combobox** / **listbox-trigger** → **butcher_select** (native: `by` label|value|index; custom: `by` path).",
              data: { interactables: items },
            }),
          );
        }
        case "browser_search": {
          const q = (cmd.query || "").trim();
          if (!q) {
            return wrap(cmd.op, finish(cmd.op, false, { kind: "info", error: "query_required", message: "Search query required." }));
          }
          const lim = Math.max(1, Math.min(5, Math.floor(cmd.limit ?? 5)));
          try {
            const items = await searchDuckDuckGoWeb(q, lim);
            if (!items.length) {
              return wrap(
                cmd.op,
                finish(cmd.op, true, {
                  kind: "info",
                  message: `No results for **${q}**.`,
                  data: { query: q, results_count: 0, results: [], error: null, items: [] },
                }),
              );
            }
            const results = items.map((it) => ({
              heading: truncateCell(it.heading, 120),
              url: truncateCell(it.url, 180),
              snippet: truncateCell(it.snippet, 200),
            }));
            const rows = results.map((it) => [it.heading, it.url, it.snippet]);
            return wrap(
              cmd.op,
              finish(cmd.op, true, {
                kind: "info",
                message: `**Browser search:** ${q}\n\n` + mdTable(["heading", "url", "snippet"], rows),
                data: { query: q, results_count: results.length, results, error: null, items: results },
              }),
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: msg,
                message: `Web search failed: ${msg}`,
                data: { query: q, results_count: 0, results: [], error: msg, items: [] },
              }),
            );
          }
        }
        case "scientific_calc": {
          const out = runScientificCalculator({
            expression: cmd.expression,
            precision: cmd.precision,
          });
          return wrap(
            cmd.op,
            finish(cmd.op, out.success, {
              kind: "info",
              message: out.success
                ? `Calculator: ${out.expression} = ${out.result ?? ""}`
                : `Calculator failed: ${out.error || "unknown error"}`,
              ...(out.success ? {} : { error: out.error || "scientific_calc_failed" }),
              data: out,
            }),
          );
        }
        case "python_execute": {
          if (!ctx.runPythonSandbox) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: "python_unavailable",
                message: "Python sandbox is not available in this environment.",
                data: {
                  python_sandbox: {
                    success: false,
                    stdout: "",
                    stderr: "",
                    error: "unavailable",
                  },
                },
              }),
            );
          }
          const r = await ctx.runPythonSandbox(cmd);
          if (!r.ok) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                message: `Python run failed: ${r.error}`,
                data: {
                  python_sandbox: {
                    success: false,
                    stdout: "",
                    stderr: "",
                    error: r.error,
                  },
                },
                error: r.error,
              }),
            );
          }
          const ps = r.python_sandbox;
          const preview = ps.stdout.trim().slice(0, 2000);
          const msg = ps.success
            ? `**Python** finished.\n\n\`\`\`text\n${preview || "(no stdout)"}\n\`\`\``
            : `**Python** error.\n\n\`\`\`text\n${String(ps.error || ps.stderr).slice(0, 4000)}\n\`\`\``;
          return wrap(
            cmd.op,
            finish(cmd.op, ps.success, {
              kind: "info",
              message: msg,
              data: { python_sandbox: ps },
              ...(ps.success ? {} : { error: ps.error || "python_failed" }),
            }),
          );
        }
        case "skill_list": {
          if (!ctx.userSkillsList) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: "skills_unavailable",
                message: "User skills are not available in this environment.",
              }),
            );
          }
          try {
            const items = await ctx.userSkillsList();
            const rows = items.map((it) => [it.slug, it.name, it.description.slice(0, 120), new Date(it.updatedAt).toISOString()]);
            return wrap(
              cmd.op,
              finish(cmd.op, true, {
                kind: "info",
                message:
                  "**User skills**\n\n" +
                  (items.length
                    ? mdTable(["slug", "name", "description", "updated"], rows)
                    : "(No skills yet. Create one in Settings or with intelligent_skill_write.)"),
                data: { skills: items },
              }),
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return wrap(
              cmd.op,
              finish(cmd.op, false, { kind: "info", error: msg, message: `Skills list failed: ${msg}` }),
            );
          }
        }
        case "skill_read": {
          if (!ctx.userSkillsRead) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: "skills_unavailable",
                message: "User skills are not available in this environment.",
              }),
            );
          }
          const r = await ctx.userSkillsRead(cmd.slug);
          if (!r.ok) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: r.error,
                message: `Read skill failed: ${r.error}`,
              }),
            );
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message: `**Skill \`${cmd.slug}\`**\n\n\`\`\`markdown\n${r.markdown.slice(0, 12000)}${r.markdown.length > 12000 ? "\n…(truncated in message)" : ""}\n\`\`\``,
              data: { slug: cmd.slug, markdown: r.markdown },
            }),
          );
        }
        case "skill_write": {
          if (!ctx.userSkillsWrite) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: "skills_unavailable",
                message: "User skills are not available in this environment.",
              }),
            );
          }
          const w = await ctx.userSkillsWrite(cmd.slug, cmd.content);
          if (!w.ok) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: w.error,
                message: `Write skill failed: ${w.error}`,
              }),
            );
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message: `Saved skill **${cmd.slug}**. Enable it in Settings if you want it in the system prompt.`,
              data: { slug: cmd.slug, ok: true },
            }),
          );
        }
        case "skill_delete": {
          if (!ctx.userSkillsDelete) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: "skills_unavailable",
                message: "User skills are not available in this environment.",
              }),
            );
          }
          const d = await ctx.userSkillsDelete(cmd.slug);
          if (!d.ok) {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                kind: "info",
                error: d.error,
                message: `Delete skill failed: ${d.error}`,
              }),
            );
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message: `Deleted skill **${cmd.slug}**.`,
              data: { slug: cmd.slug, ok: true },
            }),
          );
        }
        case "list_tabs": {
          const tabs = ctx.getTabs(cmdSessionId);
          const rows = tabs.map((t) => [
            String(t.publicId ?? ""),
            ctx.getActiveTabId(cmdSessionId) === t.id ? "✓" : "",
            t.title || "",
            t.url || "",
          ]);
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              kind: "info",
              message:
                "**Tabs**\n\n" +
                mdTable(["TabId", "Active", "Title", "URL"], rows) +
                "\n\nUse `switch tab <TabId>` (5 digits).",
              data: { tabs },
            }),
          );
        }
        default:
          // Exhaustive by type; keep a safe fallback for runtime unknowns.
          return wrap("unknown_info", finish("unknown_info", false, { kind: "info", error: "unknown info op" }));
      }
    }

    switch (cmd.op) {
      case "goto": {
        const resolved = ctx.resolveInput(cmd.url) || cmd.url;
        if (!resolved?.trim()) {
          return wrap(cmd.op, finish(cmd.op, false, { message: "Could not resolve URL.", error: "bad_url" }));
        }
        const waitUntil = (cmd.waitUntil ?? "load") as GotoWaitUntil;
        const timeoutMs = clampGotoTimeoutMs(cmd.timeoutMs);
        const networkIdleMs = clampGotoNetworkIdleMs(cmd.networkIdleMs);

        if (waitUntil === "commit") {
          ctx.navigateTo(cmd.url, cmdSessionId);
          return wrap(cmd.op, finish(cmd.op, true, { message: `Navigating to **${resolved}** (no load wait).` }));
        }

        const waitP = ctx.beginWebviewLoadWait
          ? ctx.beginWebviewLoadWait(cmdSessionId, { waitUntil, timeoutMs, networkIdleMs })
          : Promise.resolve({ ok: true as const, phase: "skipped" as const });

        ctx.navigateTo(cmd.url, cmdSessionId);
        const wr = await waitP;

        if (!wr.ok) {
          if (wr.error === "navigation_wait_unsupported") {
            return wrap(
              cmd.op,
              finish(cmd.op, true, {
                message: `Started navigation to **${resolved}** (load wait not available for background/headless session).`,
                data: { waitSkipped: true, phase: wr.phase },
              }),
            );
          }
          if (wr.error === "timeout") {
            return wrap(
              cmd.op,
              finish(cmd.op, false, {
                error: "timeout",
                message: `Timed out after **${timeoutMs}ms** waiting for **${waitUntil}** on **${resolved}**.`,
              }),
            );
          }
          return wrap(
            cmd.op,
            finish(cmd.op, false, {
              error: wr.error,
              message: `Navigation wait failed (**${wr.error}**). URL: **${resolved}**.`,
            }),
          );
        }

        return wrap(
          cmd.op,
          finish(cmd.op, true, {
            message: `Loaded **${resolved}** (wait: **${waitUntil}**).`,
            data: { waitUntil, phase: wr.phase },
          }),
        );
      }
      case "nav": {
        const d = cmd.direction;
        if (d === "back") {
          if (ctx.canGoBack && !ctx.canGoBack(cmdSessionId)) {
            return wrap(cmd.op, finish(cmd.op, false, { message: "Cannot go back." }));
          }
          const r = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.goBack(cmdSessionId));
          if (!r.ok) {
            return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${r.error}**` }));
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              message: r.unsupported ? "Went back (load wait skipped for this session)." : "Went back.",
            }),
          );
        }
        if (d === "forward") {
          if (ctx.canGoForward && !ctx.canGoForward(cmdSessionId)) {
            return wrap(cmd.op, finish(cmd.op, false, { message: "Cannot go forward." }));
          }
          const r = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.goForward(cmdSessionId));
          if (!r.ok) {
            return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${r.error}**` }));
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              message: r.unsupported ? "Went forward (load wait skipped for this session)." : "Went forward.",
            }),
          );
        }
        {
          const r = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.reload(cmdSessionId));
          if (!r.ok) {
            return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${r.error}**` }));
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              message: r.unsupported ? "Reloading… (load wait skipped for this session)." : "Reload complete.",
            }),
          );
        }
      }
      case "tab": {
        if (cmd.action !== "cycle") {
          return wrap(cmd.op, finish(cmd.op, false, { message: "Unknown tab action." }));
        }
        const tabsBefore = ctx.getTabs(cmdSessionId);
        const beforeId = ctx.getActiveTabId(cmdSessionId);
        if (!tabsBefore.length || beforeId == null) {
          return wrap(cmd.op, finish(cmd.op, false, { message: "No active tab." }));
        }
        ctx.createTab(undefined, cmdSessionId);
        const createdId = ctx.getActiveTabId(cmdSessionId);
        const tabsAfterCreate = ctx.getTabs(cmdSessionId);
        if (tabsAfterCreate.some((t2) => t2.id === beforeId)) ctx.switchTab(beforeId, cmdSessionId);
        if (createdId != null && createdId !== beforeId) {
          const tabsNow = ctx.getTabs(cmdSessionId);
          if (tabsNow.length > 1 && tabsNow.some((t2) => t2.id === createdId)) {
            ctx.closeTabById(createdId, cmdSessionId);
          }
        }
        return wrap(cmd.op, finish(cmd.op, true, { message: "Tab cycle complete." }));
      }
      case "press": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domPressHold(wv, cmd.selector, cmd.holdMs);
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(
          cmd.op,
          finish(cmd.op, r.success, {
            message: r.success
              ? `Pressed **${cmd.selector}** for **${r.heldMs ?? cmd.holdMs}ms**.`
              : `Could not press: **${cmd.selector}**`,
            data: r.success ? { selector: cmd.selector, holdMs: r.heldMs ?? cmd.holdMs } : undefined,
          }),
        );
      }
      case "click": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const guest = cmd.guestFrame ? { guestFrame: cmd.guestFrame } : undefined;
        const r = await domClick(wv, cmd.target, guest);
        if (
          !cmd.guestFrame &&
          r.success &&
          typeof r.fxCx === "number" &&
          typeof r.fxCy === "number" &&
          typeof ctx.showAutomationClickFx === "function"
        ) {
          ctx.showAutomationClickFx(r.fxCx, r.fxCy, r.fxVw ?? 0, r.fxVh ?? 0, cmdSessionId);
        }
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(
          cmd.op,
          finish(cmd.op, r.success, {
            message: r.success ? `Clicked **${cmd.target}** (${r.tag})` : `Could not find: **${cmd.target}**`,
          }),
        );
      }
      case "fill": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domFill(wv, cmd.selector, cmd.value);
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(
          cmd.op,
          finish(cmd.op, r.success, {
            message: r.success ? `Filled **${cmd.selector}**` : `Field not found: **${cmd.selector}**`,
          }),
        );
      }
      case "set_date": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const iso = parseFriendlyDateToIso(cmd.date);
        if (!iso) return wrap(cmd.op, finish(cmd.op, false, { message: "Invalid date. Try `Mar 25 2026` or `2026-03-25`." }));
        const r = await domSetDate(wv, cmd.target, iso);
        if (r.success) {
          await maybeAdaptiveSettle(ctx, cmdSessionId);
          return wrap(cmd.op, finish(cmd.op, true, { message: `Date set to **${iso}** (${r.mode || "ok"}).` }));
        }
        return wrap(
          cmd.op,
          finish(cmd.op, false, {
            message:
              r.error === "calendar_day_not_found"
                ? `Could not pick the day automatically. Try running **interactables** and click the day button manually.`
                : `Could not set date (${r.error || "failed"}).`,
          }),
        );
      }
      case "type": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        if (!cmd.selector || !cmd.selector.trim()) {
          return wrap(
            cmd.op,
            finish(cmd.op, false, {
              message: "Type requires a selector. Use **type into <selector> with <text>**.",
            }),
          );
        }
        const o = await domTypeHuman(wv, cmd.selector ?? null, cmd.text, {
          minDelayMs: 28,
          maxDelayMs: 120,
          mistakeRate: 0.06,
        });
        if (o.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(
          cmd.op,
          finish(cmd.op, o.success, {
            message: o.success
              ? cmd.selector
                ? `Typed into **${cmd.selector}** (${o.tag})`
                : `Typed into **${o.tag}**`
              : o.error === "no_focus"
                ? "No focused element — use **type into <selector> with <text>**."
                : o.error === "not_found"
                  ? `Field not found: **${cmd.selector || ""}**`
                  : o.error === "not_text_input"
                    ? "Focused element is not a text input."
                    : "Type failed.",
          }),
        );
      }
      case "scroll": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const dir = cmd.direction === "up" ? -1 : 1;
        const amt = cmd.amount ?? 600;
        await wv.executeJavaScript(`window.scrollBy({top:${dir * amt},behavior:'smooth'})`);
        await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Scrolled ${cmd.direction}.` }));
      }
      case "select": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domSelectSmart(wv, cmd.selector, cmd.by, cmd.value);
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, r.success, { message: r.success ? "Select updated." : r.error || "Failed" }));
      }
      case "toggle_checkbox": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domToggleCheckbox(wv, cmd.selector, cmd.checked);
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, r.success, { message: r.success ? "Checkbox toggled." : "Not found" }));
      }
      case "toggle_radio": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domToggleRadio(wv, cmd.selector);
        if (r.success) await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, r.success, { message: r.success ? "Radio selected." : "Not found" }));
      }
      case "upload_file":
        return wrap(
          cmd.op,
          finish(cmd.op, false, {
            message:
              "File upload from automation needs a main-process file path. Use the **Element Picker** or Request Workbench for now.",
          }),
        );
      case "submit": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        await wv.executeJavaScript(`
          (function(){
            var el = ${cmd.selector ? `document.querySelector(${JSON.stringify(cmd.selector)})` : "document.querySelector('form')"};
            if (el && el.requestSubmit) el.requestSubmit(); else if (el) el.submit();
          })()
        `);
        await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, true, { message: "Submit dispatched." }));
      }
      case "press_key": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        await domPressKey(wv, cmd.key, cmd.modifiers || []);
        await maybeAdaptiveSettle(ctx, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Key **${cmd.key}**` }));
      }
      case "switch_tab": {
        const tabs = ctx.getTabs(cmdSessionId);
        // cmd.tabId is treated as the public 5-digit TabId for user-facing commands.
        let id: number | undefined;
        let publicId: number | undefined = cmd.tabId;
        if (publicId != null) {
          const m = tabs.find((t) => Number(t.publicId) === Number(publicId));
          if (m) id = m.id;
        }
        if (cmd.index != null) {
          const i = cmd.index;
          if (i >= 0 && i < tabs.length) {
            id = tabs[i].id;
            publicId = tabs[i].publicId;
          }
        }
        if (!id && cmd.titleContains) {
          const m = tabs.find((t) => t.title.toLowerCase().includes(cmd.titleContains!.toLowerCase()));
          if (m) {
            id = m.id;
            publicId = m.publicId;
          }
        }
        if (id != null) {
          ctx.switchTab(id, cmdSessionId);
          const t = tabs.find((x) => x.id === id);
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              message: `Switched to tab **${publicId ?? ""}**${t?.title ? ` — **${t.title}**` : ""}.`,
            }),
          );
        }
        return wrap(cmd.op, finish(cmd.op, false, { message: "Tab not found." }));
      }
      case "close_tab": {
        const tabs = ctx.getTabs(cmdSessionId);
        let id: number | null | undefined = ctx.getActiveTabId(cmdSessionId);
        let publicId: number | undefined;
        if (cmd.tabId != null) {
          // cmd.tabId is treated as public 5-digit TabId
          const m = tabs.find((t) => Number(t.publicId) === Number(cmd.tabId));
          if (m) {
            id = m.id;
            publicId = m.publicId;
          } else {
            id = null;
          }
        } else {
          const cur = tabs.find((t) => t.id === id);
          publicId = cur?.publicId;
        }
        if (id != null) {
          ctx.closeTabById(id, cmdSessionId);
          return wrap(cmd.op, finish(cmd.op, true, { message: `Closed tab **${publicId ?? ""}**.` }));
        }
        return wrap(cmd.op, finish(cmd.op, false, { message: "No tab to close." }));
      }
      case "new_tab": {
        const resolvedUrl = cmd.url ? ctx.resolveInput(cmd.url) || undefined : undefined;
        if (resolvedUrl?.trim()) {
          const r = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.createTab(resolvedUrl, cmdSessionId));
          if (!r.ok) {
            return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${r.error}**` }));
          }
          return wrap(
            cmd.op,
            finish(cmd.op, true, {
              message: r.unsupported ? "New tab opened (load wait skipped for this session)." : "New tab opened.",
            }),
          );
        }
        ctx.createTab(undefined, cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, true, { message: "New tab opened." }));
      }
      case "wait_for_selector": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const ms = cmd.timeoutMs ?? 10000;
        const r = await domWaitForSelector(wv, cmd.selector, ms);
        return wrap(
          cmd.op,
          finish(cmd.op, r.found, { message: r.found ? "Element appeared." : "Timeout waiting for selector." }),
        );
      }
      case "run_js": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const script = String(cmd.script ?? "");
        if (!script.trim()) {
          return wrap(cmd.op, finish(cmd.op, false, { error: "script_required", message: "run_js requires `script`." }));
        }
        const timeoutMs = Math.max(
          200,
          Math.min(
            RUN_JS_TIMEOUT_MAX_MS,
            Number.isFinite(Number(cmd.timeoutMs)) ? Math.floor(Number(cmd.timeoutMs)) : RUN_JS_TIMEOUT_DEFAULT_MS,
          ),
        );
        const code = `
          (async function(){
            var __src = ${JSON.stringify(script)};
            var __args = ${JSON.stringify(cmd.args ?? null)};
            var __fn = new Function("args", __src);
            return await __fn(__args);
          })()
        `;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("run_js timeout")), timeoutMs);
        });
        const result = await Promise.race([wv.executeJavaScript(code), timeoutPromise]);
        if (timer) clearTimeout(timer);
        return wrap(
          cmd.op,
          finish(cmd.op, true, {
            message: result === undefined ? "JavaScript executed (no return value)." : "JavaScript executed.",
            data: result === undefined ? {} : { result },
          }),
        );
      }
      case "wait_ms":
        await new Promise((r) => setTimeout(r, cmd.ms));
        return wrap(cmd.op, finish(cmd.op, true, { message: `Waited ${cmd.ms}ms.` }));
      case "reload": {
        const r = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.reload(cmdSessionId));
        if (!r.ok) {
          return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${r.error}**` }));
        }
        return wrap(
          cmd.op,
          finish(cmd.op, true, {
            message: r.unsupported ? "Reload complete (load wait skipped for this session)." : "Reload complete.",
          }),
        );
      }
      case "back": {
        if (ctx.canGoBack && !ctx.canGoBack(cmdSessionId)) {
          return wrap(cmd.op, finish(cmd.op, false, { message: "Cannot go back." }));
        }
        const rb = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.goBack(cmdSessionId));
        if (!rb.ok) {
          return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${rb.error}**` }));
        }
        return wrap(
          cmd.op,
          finish(cmd.op, true, {
            message: rb.unsupported ? "Went back (load wait skipped for this session)." : "Went back.",
          }),
        );
      }
      case "forward": {
        if (ctx.canGoForward && !ctx.canGoForward(cmdSessionId)) {
          return wrap(cmd.op, finish(cmd.op, false, { message: "Cannot go forward." }));
        }
        const rf = await runWithNavigationLoadWait(ctx, cmdSessionId, () => ctx.goForward(cmdSessionId));
        if (!rf.ok) {
          return wrap(cmd.op, finish(cmd.op, false, { message: `Navigation wait failed: **${rf.error}**` }));
        }
        return wrap(
          cmd.op,
          finish(cmd.op, true, {
            message: rf.unsupported ? "Went forward (load wait skipped for this session)." : "Went forward.",
          }),
        );
      }
      case "screenshot":
        await ctx.takeScreenshot(cmd.mode || "viewport", cmdSessionId);
        return wrap(cmd.op, finish(cmd.op, true, { message: "" }));
      case "session": {
        const s = ctx.createSession(!!cmd.headless);
        if (!s.headless) ctx.switchSession(s.id);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Created session **${s.id}** (headless=${s.headless}).`, data: s }));
      }
      case "kill_session": {
        const ok = ctx.killSession(cmd.sessionId);
        return wrap(
          cmd.op,
          finish(cmd.op, ok, {
            message: ok ? `Killed session **${cmd.sessionId}**.` : `Session not found: **${cmd.sessionId}**.`,
          }),
        );
      }
      default:
        return wrap(String((cmd as { op: string }).op), finish("unknown", false, { error: "unknown command" }));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return finish("error", false, { error: msg, message: `Error: ${msg}` });
  }
}

/** Natural-language and JSON line dispatcher (chat). */
export async function dispatchAutomationLine(text: string, ctx: AutomationKernelContext): Promise<AutomationResult> {
  const json = tryParseJsonCommand(text);
  if (json) return runAutomationCommand(json, ctx);

  const split = splitSessionSuffix(text.trim());
  const raw = split.raw;
  const sessionId = split.sessionId;
  const t = raw.toLowerCase().trim();

  if (/^tab\s+controls$/i.test(raw)) {
    if (!sessionId) {
      return finish("tab", false, { kind: "action", op: "tab", message: "Tab controls requires sessionId: `tab controls in session <id>`." });
    }
    const tabsBefore = ctx.getTabs(sessionId);
    const beforeId = ctx.getActiveTabId(sessionId);
    if (!tabsBefore.length || beforeId == null) {
      return finish("tab", false, { kind: "action", op: "tab", message: "No active tab." });
    }

    // 1) New tab (switches active tab in kernel)
    ctx.createTab(undefined, sessionId);
    const createdId = ctx.getActiveTabId(sessionId);

    // 2) Switch back to the original tab (if still present)
    const tabsAfterCreate = ctx.getTabs(sessionId);
    const stillHasOriginal = tabsAfterCreate.some((t2) => t2.id === beforeId);
    if (stillHasOriginal) ctx.switchTab(beforeId, sessionId);

    // 3) Close the created tab (safe: avoids closing the user's original tab)
    if (createdId != null && createdId !== beforeId) {
      const tabsNow = ctx.getTabs(sessionId);
      if (tabsNow.length > 1 && tabsNow.some((t2) => t2.id === createdId)) {
        ctx.closeTabById(createdId, sessionId);
      }
    }

    return finish("tab", true, {
      kind: "action",
      op: "tab",
      message: "Tab controls: new tab → switch back → close created tab.",
    });
  }

  const navMatch = raw.match(/^nav\s+(back|forward|reload)$/i);
  if (navMatch) {
    const dir = navMatch[1].toLowerCase() as "back" | "forward" | "reload";
    if (dir === "back") return runAutomationCommand({ kind: "action", op: "back", sessionId }, ctx);
    if (dir === "forward") return runAutomationCommand({ kind: "action", op: "forward", sessionId }, ctx);
    return runAutomationCommand({ kind: "action", op: "reload", sessionId }, ctx);
  }

  const makeSessionMatch = raw.match(/^session\s+headless\s+(true|false)$/i);
  if (makeSessionMatch) {
    return runAutomationCommand({ kind: "action", op: "session", headless: makeSessionMatch[1].toLowerCase() === "true" }, ctx);
  }
  const killSessionMatch = raw.match(/^kill\s+session\s+([a-zA-Z0-9_-]+)$/i);
  if (killSessionMatch) {
    return runAutomationCommand({ kind: "action", op: "kill_session", sessionId: killSessionMatch[1] }, ctx);
  }

  if (t.startsWith("go to ") || t.startsWith("navigate to ") || t.startsWith("open ")) {
    const u = raw.replace(/^(go to|navigate to|open)\s+/i, "").trim();
    return runAutomationCommand({ kind: "action", op: "goto", url: u, sessionId }, ctx);
  }
  if (t === "screenshot" || t === "take screenshot" || t === "capture") {
    return runAutomationCommand({ kind: "action", op: "screenshot", mode: "viewport", sessionId }, ctx);
  }
  if (t.startsWith("scroll")) {
    const up = t.includes("up");
    return runAutomationCommand({ kind: "action", op: "scroll", direction: up ? "up" : "down", sessionId }, ctx);
  }
  const clickMatch = raw.match(/^click\s+(.+)$/i);
  if (clickMatch) {
    return runAutomationCommand({ kind: "action", op: "click", target: clickMatch[1].trim(), sessionId }, ctx);
  }
  const fillMatch = raw.match(/^(?:fill)\s+(.+?)\s+with\s+(.+)$/i);
  if (fillMatch) {
    return runAutomationCommand(
      { kind: "action", op: "fill", selector: fillMatch[1].trim(), value: fillMatch[2].trim(), sessionId },
      ctx,
    );
  }
  const selectMatch = raw.match(/^select\s+(.+?)\s+by\s+(label|value|index|path)\s+(.+)$/i);
  if (selectMatch) {
    const target = selectMatch[1].trim();
    const by = selectMatch[2].toLowerCase() as "label" | "value" | "index" | "path";
    let choice = selectMatch[3].trim();
    if (by === "path") {
      if (choice.length >= 2 && choice.startsWith('"') && choice.endsWith('"')) {
        choice = choice.slice(1, -1).replace(/\\"/g, '"');
      }
      return runAutomationCommand(
        { kind: "action", op: "select", selector: target, by: "path", value: choice, sessionId },
        ctx,
      );
    }
    if (by === "index") {
      const idx = Number(choice);
      if (!Number.isFinite(idx)) {
        return finish("select", false, {
          kind: "action",
          op: "select",
          message: "Index must be a number. Example: **select #country by index 0**.",
        });
      }
      return runAutomationCommand(
        { kind: "action", op: "select", selector: target, by: "index", value: Math.floor(idx), sessionId },
        ctx,
      );
    }
    if (choice.length >= 2 && choice.startsWith('"') && choice.endsWith('"')) {
      choice = choice.slice(1, -1).replace(/\\"/g, '"');
    }
    return runAutomationCommand(
      { kind: "action", op: "select", selector: target, by, value: choice, sessionId },
      ctx,
    );
  }
  const typeIntoMatch = raw.match(/^(?:type into|type in)\s+(.+?)\s+with\s+(.+)$/i);
  if (typeIntoMatch) {
    const selector = typeIntoMatch[1].trim();
    let typeText = typeIntoMatch[2].trim();
    if (typeText.length >= 2 && typeText.startsWith('"') && typeText.endsWith('"')) {
      typeText = typeText.slice(1, -1).replace(/\\"/g, '"');
    }
    return runAutomationCommand({ kind: "action", op: "type", selector, text: typeText, sessionId }, ctx);
  }
  const pressMatch = raw.match(/^press\s+(.+?)\s+for\s+(\d+)\s*ms$/i);
  if (pressMatch) {
    return runAutomationCommand(
      { kind: "action", op: "press", selector: pressMatch[1].trim(), holdMs: Number(pressMatch[2]), sessionId },
      ctx,
    );
  }
  const dateMatch = raw.match(/^date\s+(.+?)\s*=\s*(.+)$/i);
  if (dateMatch) {
    return runAutomationCommand(
      { kind: "action", op: "set_date", target: dateMatch[1].trim(), date: dateMatch[2].trim(), sessionId },
      ctx,
    );
  }
  const typeMatch = raw.match(/^type\s+(.+)$/i);
  if (typeMatch) {
    return finish("type", false, {
      kind: "action",
      op: "type",
      message: "Type requires a selector. Use **type into <selector> with <text>**.",
    });
  }
  const runJsMatch = raw.match(/^(?:run\s+js|js)\s+([\s\S]+)$/i);
  if (runJsMatch) {
    return runAutomationCommand({ kind: "action", op: "run_js", script: runJsMatch[1].trim(), sessionId }, ctx);
  }
  if (t === "get text" || t === "read page" || t === "page text") {
    return runAutomationCommand({ kind: "info", op: "get_page_text", maxChars: 500, sessionId }, ctx);
  }
  if (t === "viewport md" || t === "page md" || t === "get viewport md") {
    return runAutomationCommand({ kind: "info", op: "get_viewport_md", sessionId }, ctx);
  }
  if (t === "form schema" || t === "get form schema") {
    return runAutomationCommand({ kind: "info", op: "get_form_schema", sessionId }, ctx);
  }
  if (t === "interactables" || t === "get interactables") {
    return runAutomationCommand({ kind: "info", op: "get_interactables", limit: 200, sessionId }, ctx);
  }
  const browserSearchMatch = raw.match(/^(?:browser\s+search|search\s+web)\s+(.+)$/i);
  if (browserSearchMatch) {
    return runAutomationCommand(
      { kind: "info", op: "browser_search", query: browserSearchMatch[1].trim(), limit: 5, sessionId },
      ctx,
    );
  }
  if (t === "list tabs" || t === "tabs") {
    return runAutomationCommand({ kind: "info", op: "list_tabs", sessionId }, ctx);
  }
  if (t === "url" || t === "current url" || t === "what url") {
    return runAutomationCommand({ kind: "info", op: "get_url", sessionId }, ctx);
  }
  if (t === "title" || t === "page title") {
    return runAutomationCommand({ kind: "info", op: "get_title", sessionId }, ctx);
  }
  if (t === "reload" || t === "refresh") {
    return runAutomationCommand({ kind: "action", op: "reload", sessionId }, ctx);
  }
  if (t === "back" || t === "go back") {
    return runAutomationCommand({ kind: "action", op: "back", sessionId }, ctx);
  }
  if (t === "forward" || t === "go forward") {
    return runAutomationCommand({ kind: "action", op: "forward", sessionId }, ctx);
  }
  if (t === "zoom in") {
    ctx.applyZoom(ctx.getZoomLevel() + 1);
    return finish("zoom", true, { kind: "action", op: "zoom", message: "Zoomed in." });
  }
  if (t === "zoom out") {
    ctx.applyZoom(ctx.getZoomLevel() - 1);
    return finish("zoom", true, { kind: "action", op: "zoom", message: "Zoomed out." });
  }
  if (t === "zoom reset") {
    ctx.applyZoom(0);
    return finish("zoom", true, { kind: "action", op: "zoom", message: "Zoom reset." });
  }
  if (t === "new tab") {
    return runAutomationCommand({ kind: "action", op: "new_tab", sessionId }, ctx);
  }
  if (t === "close tab") {
    return runAutomationCommand({ kind: "action", op: "close_tab", sessionId }, ctx);
  }
  const closeTabMatch = raw.match(/^close\s+tab\s+(\d{5})$/i);
  if (closeTabMatch) {
    return runAutomationCommand({ kind: "action", op: "close_tab", tabId: Number(closeTabMatch[1]), sessionId }, ctx);
  }
  const switchTabMatch = raw.match(/^switch\s+tab\s+(\d{5})$/i);
  if (switchTabMatch) {
    return runAutomationCommand({ kind: "action", op: "switch_tab", tabId: Number(switchTabMatch[1]), sessionId }, ctx);
  }
  const waitMatch = raw.match(/^wait\s+(\d+)\s*(ms|s)?$/i);
  if (waitMatch) {
    const n = Number(waitMatch[1]);
    const unit = (waitMatch[2] || "ms").toLowerCase();
    const ms = unit === "s" ? n * 1000 : n;
    return runAutomationCommand({ kind: "action", op: "wait_ms", ms, sessionId }, ctx);
  }
  if (t === "submit") {
    return runAutomationCommand({ kind: "action", op: "submit", sessionId }, ctx);
  }
  const submitMatch = raw.match(/^submit\s+(.+)$/i);
  if (submitMatch) {
    return runAutomationCommand({ kind: "action", op: "submit", selector: submitMatch[1].trim(), sessionId }, ctx);
  }
  if (t === "help") {
    return finish("help", true, {
      kind: "info",
      op: "help",
      message:
        "## Help\n\n" +
        "### Sessions\n" +
        "- `session headless false`\n- `session headless true`\n- `kill session s_ab12cd`\n\n" +
        "### Navigation\n" +
        "- `go to https://example.com in session s_ab12cd`\n- `back|forward|reload in session s_ab12cd`\n- `nav back|forward|reload in session s_ab12cd`\n\n" +
        "### Tabs\n" +
        "- `list tabs in session s_ab12cd` (returns a table with 5-digit TabIds)\n- `switch tab 24532 in session s_ab12cd`\n- `new tab in session s_ab12cd`\n- `close tab in session s_ab12cd`\n\n" +
        "### Page actions\n" +
        "- `click <selector or text> in session s_ab12cd`\n- `fill <selector> with <value> in session s_ab12cd`\n- `select <selector or label> by label|value|index <choice> in session s_ab12cd`\n- `select <target> by path \"Level1 > Level2\" in session s_ab12cd` (nested custom menus; native select: one segment)\n- `type into <selector> with <text> in session s_ab12cd`\n- `press <selector> for 1200ms in session s_ab12cd`\n- `submit <selector> in session s_ab12cd`\n- `scroll up|down in session s_ab12cd`\n- `screenshot in session s_ab12cd`\n- `wait 1200ms in session s_ab12cd` / `wait 2s in session s_ab12cd`\n\n" +
        "- `run js return document.title in session s_ab12cd`\n" +
        "### Info / extraction\n" +
        "- `url`, `title`\n- `viewport md`\n- `form schema`\n- `interactables`\n- `browser search <query>`\n\n" +
        "### Date picker\n" +
        "- `date <selector_or_label> = Mar 25 2026`\n- `date <selector_or_label> = 2026-03-25`\n\n" +
        "### Tools (UI toggles)\n" +
        "Use the **Tools** menu (or Quick) to enable:\n" +
        "- **Picker (Any)** (any element)\n" +
        "- **Picker (Interactive)** (snaps to clickable/input)\n" +
        "- **Element Screenshot**\n\n" +
        "### JSON mode\n" +
        "You can also send JSON like: `{\"kind\":\"info\",\"op\":\"get_viewport_md\"}`",
    });
  }

  return finish("unknown", false, {
    kind: "info",
    op: "unknown",
    message: "Unknown command. Type **help**.",
    retryable: false,
  });
}
