/**
 * Injected scripts for viewport Markdown + form schema extraction (guest page context).
 */

export const VIEWPORT_MARKDOWN_SCRIPT = `
(function() {
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const s = window.getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }
  const parts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
  let n;
  const headings = [];
  while ((n = walker.nextNode())) {
    const t = n.tagName;
    if (/^H[1-6]$/.test(t) && visible(n)) {
      const level = parseInt(t[1], 10);
      headings.push({ level, text: (n.innerText || "").trim().slice(0, 200) });
    }
  }
  headings.slice(0, 40).forEach((h) => {
    parts.push("#".repeat(h.level) + " " + h.text);
  });
  const paras = [];
  document.querySelectorAll("p,li,td,th,blockquote").forEach((el) => {
    if (visible(el) && paras.length < 80) {
      const tx = (el.innerText || "").trim().replace(/\\s+/g, " ");
      if (tx.length > 2) paras.push(tx.slice(0, 300));
    }
  });
  if (paras.length) {
    parts.push("");
    parts.push("### Content");
    paras.slice(0, 50).forEach((p) => parts.push("- " + p));
  }
  const links = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    if (links.length < 30 && visible(a)) {
      links.push("- [" + (a.innerText || a.href).trim().slice(0, 80) + "](" + a.href + ")");
    }
  });
  if (links.length) {
    parts.push("");
    parts.push("### Links");
    parts.push.apply(parts, links);
  }
  return { markdown: parts.join("\\n"), length: parts.join("\\n").length };
})()
`;

export const FORM_SCHEMA_SCRIPT = `
(function() {
  const out = [];
  document.querySelectorAll("input,select,textarea,button").forEach((el, i) => {
    if (i > 120) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const tag = el.tagName.toLowerCase();
    const type = el.type || "";
    const name = el.name || "";
    const id = el.id || "";
    const ph = el.placeholder || "";
    const req = el.required ? true : false;
    let options = [];
    if (tag === "select") {
      options = Array.from(el.options).map((o) => ({ v: o.value, t: o.text }));
    }
    out.push({
      tag,
      type,
      name,
      id,
      placeholder: ph,
      required: req,
      value: tag === "input" || tag === "textarea" ? String(el.value || "").slice(0, 200) : undefined,
      options: options.length ? options : undefined,
    });
  });
  return { fields: out };
})()
`;

/** Safety cap for DOM walk when collecting interactables (performance fuse). */
export function interactablesMaxIterations(maxResults: number): number {
  return Math.min(25000, Math.max(2000, Math.floor(maxResults) * 60));
}

/** Router / MCP clamp for interactables row cap (content-first ordering uses this as output limit). */
export const INTERACTABLES_MAX_LIMIT = 400;

/**
 * Guest-page script: collect up to `maxResults` unique action elements, scanning at most
 * `maxIterations` matching nodes. Primary content (`main`, article, etc.) is listed before chrome
 * so article buttons are not buried under huge nav bars (e.g. W3Schools).
 */
export function buildInteractablesScript(maxResults: number, maxIterations: number): string {
  const mr = Math.max(1, Math.min(INTERACTABLES_MAX_LIMIT, Math.floor(maxResults)));
  const mi = Math.max(500, Math.min(25000, Math.floor(maxIterations)));
  return `
(function() {
  const maxResults = ${mr};
  const maxIterations = ${mi};
  const sel =
    'a,button,input,select,textarea,label,[role=button],[role=link],[role=checkbox],[role=radio],[role=combobox],[aria-haspopup=listbox],[tabindex]';

  function isInteractive(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'select' || tag === 'textarea') return true;
    if (tag === 'input') return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (['button','link','menuitem','option','tab','checkbox','radio','combobox','switch'].includes(role)) return true;
    if (el.hasAttribute('aria-haspopup')) return true;
    if (el.hasAttribute('tabindex') && el.tabIndex >= 0) return true;
    return false;
  }

  function closestInteractive(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (isInteractive(cur)) return cur;
      cur = cur.parentElement;
    }
    return el;
  }

  function resolveLabelControl(lab) {
    if (!lab || lab.tagName.toLowerCase() !== 'label') return null;
    const fid = lab.getAttribute('for');
    if (fid) {
      try {
        const c = document.getElementById(fid);
        if (c) return c;
      } catch (e) {}
    }
    return lab.querySelector('select, [role=combobox], [aria-haspopup=listbox], input, textarea, button') || null;
  }

  function unique(sel) {
    try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
  }
  function escAttr(v){ return JSON.stringify(String(v)); }

  function buildSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id && !/^\\d/.test(el.id)) {
      const s = '#' + CSS.escape(el.id);
      if (unique(s)) return s;
    }
    const dataKeys = ['data-testid','data-test','data-qa','data-cy'];
    for (const k of dataKeys) {
      const v = el.getAttribute(k);
      if (v) { const s = tag + '[' + k + '=' + escAttr(v) + ']'; if (unique(s)) return s; }
    }
    const name = el.getAttribute('name');
    if (name) {
      const s = tag + '[name=' + escAttr(name) + ']';
      if (unique(s)) return s;
    }
    const al = el.getAttribute('aria-label');
    if (al) {
      const s = tag + '[aria-label=' + escAttr(al) + ']';
      if (unique(s)) return s;
    }
    const role = el.getAttribute('role');
    if (role && al) {
      const s = '[role=' + escAttr(role) + '][aria-label=' + escAttr(al) + ']';
      if (unique(s)) return s;
    }
    let cur = el;
    const parts = [];
    for (let depth = 0; cur && cur !== document.body && depth < 10; depth++) {
      const t = cur.tagName.toLowerCase();
      let part = t;
      const pid = cur.id && !/^\\d/.test(cur.id) ? '#' + CSS.escape(cur.id) : '';
      if (pid) part += pid;
      else {
        const sibs = Array.from(cur.parentElement ? cur.parentElement.children : []).filter(x => x.tagName === cur.tagName);
        if (sibs.length > 1) {
          const idx = sibs.indexOf(cur) + 1;
          part += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(part);
      const s = parts.join(' > ');
      if (unique(s)) return s;
      cur = cur.parentElement;
    }
    return parts.join(' > ') || tag;
  }

  function labelFor(el) {
    return (
      (el.innerText || el.textContent || '').trim() ||
      (el.value != null ? String(el.value).trim() : '') ||
      (el.getAttribute('aria-label') || '').trim() ||
      (el.getAttribute('title') || '').trim() ||
      (el.getAttribute('placeholder') || '').trim()
    ).slice(0, 120);
  }

  function kindFor(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const popup = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (tag === 'input' && type === 'checkbox') return 'checkbox';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'input' && type === 'date') return 'date';
    if (tag === 'select') return el.multiple ? 'multi-select' : 'select';
    if (role === 'combobox') return 'combobox';
    if (popup === 'listbox' && tag !== 'select') return 'listbox-trigger';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') return 'input';
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'button' || role === 'button') return 'button';
    return tag;
  }

  function nativeSelectSampleLabel(selEl) {
    if (!selEl || selEl.tagName.toLowerCase() !== 'select' || !selEl.options || selEl.options.length === 0) return '';
    const idx = selEl.selectedIndex >= 0 ? selEl.selectedIndex : 0;
    const o = selEl.options[idx];
    const tx = (o && (o.text || '')).trim().replace(/\\s+/g, ' ');
    return tx.slice(0, 48);
  }

  function buildHints(kind, actionEl, selector, rowLabel) {
    const q = selector;
    let suggestedCommand = '';
    let suggestedMcpTool = '';
    let toolHint = '';
    if (kind === 'checkbox') {
      suggestedCommand = 'toggle_checkbox ' + q;
      toolHint = 'Chat DSL only (no butcher_* toggle).';
    } else if (kind === 'radio') {
      suggestedCommand = 'toggle_radio ' + q;
      toolHint = 'Chat DSL only.';
    } else if (kind === 'select') {
      const samp = nativeSelectSampleLabel(actionEl);
      const lit = samp ? JSON.stringify(samp) : '\"Option label\"';
      suggestedCommand = 'select ' + q + ' by label ' + lit + ' in session …';
      suggestedMcpTool = 'butcher_select';
      toolHint =
        'Native select: MCP by label|value|index; one path segment if by path. Ex: {"selector":' +
        JSON.stringify(q) +
        ',"by":"label","value":' +
        (samp ? JSON.stringify(samp) : '\"Canada\"') +
        '}';
    } else if (kind === 'multi-select') {
      const samp = nativeSelectSampleLabel(actionEl);
      const lit = samp ? JSON.stringify(samp) : '\"Option\"';
      suggestedCommand = 'select ' + q + ' by label ' + lit + ' in session …';
      suggestedMcpTool = 'butcher_select';
      toolHint =
        'Multi-select: use butcher_select per option or by index. Ex: {"selector":' +
        JSON.stringify(q) +
        ',"by":"index","value":0}';
    } else if (kind === 'combobox' || kind === 'listbox-trigger') {
      const targetTxt = (rowLabel || '').trim().slice(0, 56);
      const openTarget = targetTxt ? JSON.stringify(targetTxt) : JSON.stringify(q);
      suggestedCommand = 'select ' + (targetTxt ? JSON.stringify(targetTxt) : q) + ' by path \"First > Second\" in session …';
      suggestedMcpTool = 'butcher_select';
      toolHint =
        'Custom dropdown: open trigger then path. Target can be label text (like fill) or CSS selector. Ex: {"selector":' +
        openTarget +
        ',"by":"path","value":"Level1 > Level2"} also try by label after open for flat lists.';
    } else if (kind === 'date') {
      suggestedCommand = 'date ' + q + ' = 2026-03-25 in session …';
      toolHint = 'Friendly date strings supported in chat DSL.';
    } else if (kind === 'input' || kind === 'textarea') {
      suggestedCommand = 'fill ' + q + ' with \"…\" in session …';
      suggestedMcpTool = 'butcher_fill';
      toolHint = 'Ex: {"selector":' + JSON.stringify(q) + ',"value":"text"}';
    } else {
      suggestedCommand = 'click ' + q + ' in session …';
      suggestedMcpTool = 'butcher_click';
      toolHint = 'Iframe targets: use guestProcessId and guestRoutingId from this table on MCP when present.';
    }
    return { suggestedCommand, suggestedMcpTool, toolHint };
  }

  const rootSelectors = ['main', 'article', '[role=\"main\"]', '#main', '.w3-main', '#midcontent', '#content', '[itemprop=\"articleBody\"]'];
  const contentRoots = [];
  for (let ri = 0; ri < rootSelectors.length; ri++) {
    let nl;
    try { nl = document.querySelectorAll(rootSelectors[ri]); } catch (e) { continue; }
    for (let j = 0; j < nl.length; j++) {
      const n = nl[j];
      if (!n || n.nodeType !== 1) continue;
      const br = n.getBoundingClientRect();
      if (br.height < 24 && br.width < 24) continue;
      contentRoots.push(n);
    }
  }
  function inContent(actionEl) {
    for (let k = 0; k < contentRoots.length; k++) {
      if (contentRoots[k].contains(actionEl)) return true;
    }
    return false;
  }

  const entries = [];
  const seen = new WeakSet();
  const nodes = document.querySelectorAll(sel);
  let iter = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (iter >= maxIterations) break;
    iter++;
    const el = nodes[i];
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const t = labelFor(el);
    const allowEmptyLabel = ['INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    if (!t && allowEmptyLabel.indexOf(el.tagName) === -1) continue;
    let actionEl = closestInteractive(el);
    if (actionEl.tagName.toLowerCase() === 'label') {
      const resolved = resolveLabelControl(actionEl);
      if (resolved) actionEl = resolved;
    }
    if (seen.has(actionEl)) continue;
    seen.add(actionEl);
    entries.push({ el, actionEl, t });
  }

  const primary = [];
  const secondary = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (inContent(e.actionEl)) primary.push(e);
    else secondary.push(e);
  }
  const merged = primary.concat(secondary);

  const out = [];
  for (let i = 0; i < merged.length && out.length < maxResults; i++) {
    const { actionEl, t } = merged[i];
    const kind = kindFor(actionEl);
    const selector = buildSelector(actionEl);
    const role = actionEl.getAttribute('role') || '';
    const type = actionEl.type || '';
    const h = buildHints(kind, actionEl, selector, t);
    const row = {
      kind,
      label: t,
      selector,
      tag: actionEl.tagName.toLowerCase(),
      role,
      type,
      id: actionEl.id || "",
      name: actionEl.name || "",
      suggestedCommand: h.suggestedCommand,
    };
    if (h.suggestedMcpTool) row.suggestedMcpTool = h.suggestedMcpTool;
    if (h.toolHint) row.toolHint = h.toolHint;
    out.push(row);
  }
  return { items: out };
})()
`;
}

/** Default guest script; prefer `buildInteractablesScript` from router with command limit. */
export const INTERACTABLES_SCRIPT = buildInteractablesScript(200, interactablesMaxIterations(200));
