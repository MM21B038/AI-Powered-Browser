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

export const INTERACTABLES_SCRIPT = `
(function() {
  const sel = 'a,button,input,select,textarea,label,[role=button],[role=link],[role=checkbox],[role=radio],[role=combobox],[tabindex]';

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
    for (let depth = 0; cur && cur !== document.body && depth < 4; depth++) {
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
    if (tag === 'input' && type === 'checkbox') return 'checkbox';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'input' && type === 'date') return 'date';
    if (tag === 'select') return el.multiple ? 'multi-select' : 'select';
    if (role === 'combobox') return 'combobox';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') return 'input';
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'button' || role === 'button') return 'button';
    return tag;
  }

  const out = [];
  document.querySelectorAll(sel).forEach((el, i) => {
    if (i > 80) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const t = labelFor(el);
    if (!t && el.tagName !== "INPUT") return;
    const actionEl = closestInteractive(el);
    const kind = kindFor(actionEl);
    const selector = buildSelector(actionEl);
    const role = actionEl.getAttribute('role') || '';
    const type = actionEl.type || '';
    let suggestedCommand = '';
    if (kind === 'checkbox') suggestedCommand = 'toggle_checkbox ' + selector;
    else if (kind === 'radio') suggestedCommand = 'toggle_radio ' + selector;
    else if (kind === 'select' || kind === 'multi-select') suggestedCommand = 'select ' + selector + ' by label \"...\"';
    else if (kind === 'date') suggestedCommand = 'date ' + selector + ' = Mar 25 2026';
    else if (kind === 'input' || kind === 'textarea' || kind === 'combobox') suggestedCommand = 'fill ' + selector + ' with \"...\"';
    else suggestedCommand = 'click ' + selector;
    out.push({
      kind,
      label: t,
      selector,
      tag: actionEl.tagName.toLowerCase(),
      role,
      type,
      id: actionEl.id || "",
      name: actionEl.name || "",
      suggestedCommand,
    });
  });
  return { items: out };
})()
`;
