import type { AutomationCommand, AutomationResult } from "../../../shared/automation-types";
import {
  domClick,
  domFill,
  domPressKey,
  domSelectBy,
  domToggleCheckbox,
  domToggleRadio,
  domWaitForSelector,
  type WebviewLike,
} from "./dom-actions";
import { FORM_SCHEMA_SCRIPT, INTERACTABLES_SCRIPT, VIEWPORT_MARKDOWN_SCRIPT } from "./markdown-extractor";

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

export interface AutomationKernelContext {
  getBrowserFrame(): WebviewLike | null;
  navigateTo: (raw: string) => void;
  resolveInput: (raw: string) => string | null;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  createTab: (url?: string) => void;
  switchTab: (id: number) => void;
  closeTabById: (id: number) => void;
  getTabs: () => TabInfo[];
  getActiveTabId: () => number | null;
  applyZoom: (level: number) => void;
  getZoomLevel: () => number;
  takeScreenshot: (mode?: string) => Promise<void>;
}

function now() {
  return Date.now();
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

export async function runAutomationCommand(cmd: AutomationCommand, ctx: AutomationKernelContext): Promise<AutomationResult> {
  const t0 = now();
  const wv = ctx.getBrowserFrame();
  const wrap = (op: string, r: AutomationResult): AutomationResult => ({
    ...r,
    timings: { startedAt: t0, endedAt: now(), durationMs: now() - t0 },
    op,
  });

  try {
    if (cmd.kind === "info") {
      if (!wv && cmd.op !== "list_tabs") {
        return wrap(cmd.op, finish(cmd.op, false, { kind: "info", error: "No webview", message: "No page loaded." }));
      }
      switch (cmd.op) {
        case "get_url": {
          const url = (ctx.getBrowserFrame() as { getURL?: () => string } | null)?.getURL?.() ?? "";
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
          const lim = cmd.limit ?? 40;
          const r = (await wv!.executeJavaScript(INTERACTABLES_SCRIPT)) as { items: unknown[] };
          const items = (r.items || []).slice(0, lim);
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: JSON.stringify(items, null, 2), data: items }));
        }
        case "list_tabs": {
          const tabs = ctx.getTabs();
          const lines = tabs.map((t) => `- **${t.id}** ${t.title} — ${t.url}`);
          return wrap(cmd.op, finish(cmd.op, true, { kind: "info", message: lines.join("\n"), data: { tabs } }));
        }
        default:
          return wrap(cmd.op, finish(cmd.op, false, { kind: "info", error: "unknown info op" }));
      }
    }

    switch (cmd.op) {
      case "goto":
        ctx.navigateTo(cmd.url);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Navigating to **${ctx.resolveInput(cmd.url) || cmd.url}**` }));
      case "click": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domClick(wv, cmd.target);
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
        return wrap(
          cmd.op,
          finish(cmd.op, r.success, {
            message: r.success ? `Filled **${cmd.selector}**` : `Field not found: **${cmd.selector}**`,
          }),
        );
      }
      case "type": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const result = await wv.executeJavaScript(`
          (function(){var el=document.activeElement;if(!el||el===document.body)return{success:false};
          var val=${JSON.stringify(cmd.text)};
          if(el.isContentEditable){el.textContent=val;}
          else{var p=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
          var s=Object.getOwnPropertyDescriptor(p,'value');if(s)s.set.call(el,val);else el.value=val;}
          ['input','change'].forEach(function(t){el.dispatchEvent(new Event(t,{bubbles:true}));});
          return{success:true,tag:el.tagName.toLowerCase()};})()
        `);
        const o = result as { success: boolean; tag?: string };
        return wrap(
          cmd.op,
          finish(cmd.op, o.success, {
            message: o.success ? `Typed into **${o.tag}**` : "No focused element — use **fill** with a selector.",
          }),
        );
      }
      case "scroll": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const dir = cmd.direction === "up" ? -1 : 1;
        const amt = cmd.amount ?? 600;
        await wv.executeJavaScript(`window.scrollBy({top:${dir * amt},behavior:'smooth'})`);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Scrolled ${cmd.direction}.` }));
      }
      case "select": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domSelectBy(wv, cmd.selector, cmd.by, cmd.value);
        return wrap(cmd.op, finish(cmd.op, r.success, { message: r.success ? "Select updated." : r.error || "Failed" }));
      }
      case "toggle_checkbox": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domToggleCheckbox(wv, cmd.selector, cmd.checked);
        return wrap(cmd.op, finish(cmd.op, r.success, { message: r.success ? "Checkbox toggled." : "Not found" }));
      }
      case "toggle_radio": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        const r = await domToggleRadio(wv, cmd.selector);
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
        const sel = cmd.selector || "form";
        await wv.executeJavaScript(`
          (function(){
            var el = ${cmd.selector ? `document.querySelector(${JSON.stringify(cmd.selector)})` : "document.querySelector('form')"};
            if (el && el.requestSubmit) el.requestSubmit(); else if (el) el.submit();
          })()
        `);
        return wrap(cmd.op, finish(cmd.op, true, { message: "Submit dispatched." }));
      }
      case "press_key": {
        if (!wv) return wrap(cmd.op, finish(cmd.op, false, { error: "No webview", message: "No page to automate." }));
        await domPressKey(wv, cmd.key, cmd.modifiers || []);
        return wrap(cmd.op, finish(cmd.op, true, { message: `Key **${cmd.key}**` }));
      }
      case "switch_tab": {
        const tabs = ctx.getTabs();
        let id: number | undefined = cmd.tabId;
        if (cmd.index != null) {
          const i = cmd.index;
          if (i >= 0 && i < tabs.length) id = tabs[i].id;
        }
        if (!id && cmd.titleContains) {
          const m = tabs.find((t) => t.title.toLowerCase().includes(cmd.titleContains!.toLowerCase()));
          if (m) id = m.id;
        }
        if (id != null) {
          ctx.switchTab(id);
          return wrap(cmd.op, finish(cmd.op, true, { message: `Switched to tab **${id}**.` }));
        }
        return wrap(cmd.op, finish(cmd.op, false, { message: "Tab not found." }));
      }
      case "close_tab": {
        const id = cmd.tabId ?? ctx.getActiveTabId();
        if (id != null) {
          ctx.closeTabById(id);
          return wrap(cmd.op, finish(cmd.op, true, { message: `Closed tab **${id}**.` }));
        }
        return wrap(cmd.op, finish(cmd.op, false, { message: "No tab to close." }));
      }
      case "new_tab": {
        ctx.createTab(cmd.url ? ctx.resolveInput(cmd.url) || undefined : undefined);
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
      case "wait_ms":
        await new Promise((r) => setTimeout(r, cmd.ms));
        return wrap(cmd.op, finish(cmd.op, true, { message: `Waited ${cmd.ms}ms.` }));
      case "reload":
        ctx.reload();
        return wrap(cmd.op, finish(cmd.op, true, { message: "Reloading…" }));
      case "back":
        ctx.goBack();
        return wrap(cmd.op, finish(cmd.op, true, { message: "Going back." }));
      case "forward":
        ctx.goForward();
        return wrap(cmd.op, finish(cmd.op, true, { message: "Going forward." }));
      case "screenshot":
        await ctx.takeScreenshot(cmd.mode || "viewport");
        return wrap(cmd.op, finish(cmd.op, true, { message: "" }));
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

  const t = text.toLowerCase().trim();
  const raw = text.trim();

  if (t.startsWith("go to ") || t.startsWith("navigate to ") || t.startsWith("open ")) {
    const u = raw.replace(/^(go to|navigate to|open)\s+/i, "").trim();
    return runAutomationCommand({ kind: "action", op: "goto", url: u }, ctx);
  }
  if (t === "screenshot" || t === "take screenshot" || t === "capture") {
    return runAutomationCommand({ kind: "action", op: "screenshot", mode: "viewport" }, ctx);
  }
  if (t.startsWith("scroll")) {
    const up = t.includes("up");
    return runAutomationCommand({ kind: "action", op: "scroll", direction: up ? "up" : "down" }, ctx);
  }
  const clickMatch = raw.match(/^click\s+(.+)$/i);
  if (clickMatch) {
    return runAutomationCommand({ kind: "action", op: "click", target: clickMatch[1].trim() }, ctx);
  }
  const fillMatch = raw.match(/^(?:fill|type into|type in)\s+(.+?)\s+with\s+(.+)$/i);
  if (fillMatch) {
    return runAutomationCommand(
      { kind: "action", op: "fill", selector: fillMatch[1].trim(), value: fillMatch[2].trim() },
      ctx,
    );
  }
  const typeMatch = raw.match(/^type\s+(.+)$/i);
  if (typeMatch) {
    return runAutomationCommand({ kind: "action", op: "type", text: typeMatch[1].trim() }, ctx);
  }
  if (t === "get text" || t === "read page" || t === "page text") {
    return runAutomationCommand({ kind: "info", op: "get_page_text", maxChars: 500 }, ctx);
  }
  if (t === "viewport md" || t === "page md" || t === "get viewport md") {
    return runAutomationCommand({ kind: "info", op: "get_viewport_md" }, ctx);
  }
  if (t === "form schema" || t === "get form schema") {
    return runAutomationCommand({ kind: "info", op: "get_form_schema" }, ctx);
  }
  if (t === "list tabs" || t === "tabs") {
    return runAutomationCommand({ kind: "info", op: "list_tabs" }, ctx);
  }
  if (t === "url" || t === "current url" || t === "what url") {
    return runAutomationCommand({ kind: "info", op: "get_url" }, ctx);
  }
  if (t === "title" || t === "page title") {
    return runAutomationCommand({ kind: "info", op: "get_title" }, ctx);
  }
  if (t === "reload" || t === "refresh") {
    return runAutomationCommand({ kind: "action", op: "reload" }, ctx);
  }
  if (t === "back" || t === "go back") {
    return runAutomationCommand({ kind: "action", op: "back" }, ctx);
  }
  if (t === "forward" || t === "go forward") {
    return runAutomationCommand({ kind: "action", op: "forward" }, ctx);
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
    return runAutomationCommand({ kind: "action", op: "new_tab" }, ctx);
  }
  const switchTabMatch = raw.match(/^switch\s+tab\s+(\d+)$/i);
  if (switchTabMatch) {
    return runAutomationCommand({ kind: "action", op: "switch_tab", tabId: Number(switchTabMatch[1]) }, ctx);
  }
  if (t === "help") {
    return finish("help", true, {
      kind: "info",
      op: "help",
      message:
        "Commands:\n\n" +
        "• **go to [url]**\n• **click [selector or text]**\n• **fill [selector] with [value]**\n• **type [text]** (focused element)\n" +
        "• **scroll up/down**\n• **screenshot**\n• **get text** / **viewport md** / **form schema**\n• **list tabs** / **switch tab [id]**\n" +
        "• **url** / **title**\n• **reload** / **back** / **forward**\n• **zoom in/out/reset**\n• **new tab**\n\n" +
        "Or send JSON: `{\"kind\":\"info\",\"op\":\"get_viewport_md\"}`",
    });
  }

  return finish("unknown", false, {
    kind: "info",
    op: "unknown",
    message: "Unknown command. Type **help**.",
    retryable: false,
  });
}
