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
  const sel = 'a,button,input,select,textarea,label,[role=button],[role=link],[tabindex]';
  const out = [];
  document.querySelectorAll(sel).forEach((el, i) => {
    if (i > 80) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const t = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 120);
    if (!t && el.tagName !== "INPUT") return;
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      text: t,
      id: el.id || "",
      name: el.name || "",
    });
  });
  return { items: out };
})()
`;
