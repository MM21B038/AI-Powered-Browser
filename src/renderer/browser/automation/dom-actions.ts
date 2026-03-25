/** Low-level guest-page actions via webview.executeJavaScript */

export interface WebviewLike {
  executeJavaScript: (code: string) => Promise<unknown>;
}

export async function domClick(wv: WebviewLike, selector: string): Promise<{ success: boolean; tag?: string; error?: string }> {
  const code = `
    (function(){
      function doClick(el) {
        try {
          var r = el.getBoundingClientRect();
          var inView = r.bottom > 0 && r.top < window.innerHeight;
          if (!inView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
          el.focus();
          var r2 = el.getBoundingClientRect();
          var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
          var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new PointerEvent('pointerup', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.click();
          return { success: true, tag: el.tagName.toLowerCase() };
        } catch(e) { return { success: false, error: String(e.message) }; }
      }
      try {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (el) return doClick(el);
      } catch(e) {}
      var q = ${JSON.stringify(selector.toLowerCase())};
      var nodes = document.querySelectorAll(
        'a,button,input,select,textarea,label,summary,' +
        '[role=button],[role=link],[role=menuitem],[role=option],[role=tab],[role=checkbox],[role=radio],[tabindex]'
      );
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var tx = (n.innerText || n.textContent || '').replace(/\\s+/g,' ').trim().toLowerCase();
        var extras = [n.value||'', n.getAttribute('aria-label')||'', n.getAttribute('title')||'', n.getAttribute('placeholder')||''].join(' ').toLowerCase();
        if (tx === q || tx.indexOf(q) !== -1 || extras.indexOf(q) !== -1) return doClick(n);
      }
      return { success: false };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; tag?: string; error?: string };
}

export async function domFill(wv: WebviewLike, sel: string, value: string): Promise<{ success: boolean; tag?: string }> {
  const code = `
    (function() {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return { success: false };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.focus();
      const val = ${JSON.stringify(value)};
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find(o =>
          o.text.toLowerCase().includes(val.toLowerCase()) ||
          o.value.toLowerCase() === val.toLowerCase()
        );
        if (opt) el.value = opt.value;
      } else if (el.isContentEditable) {
        el.textContent = val;
      } else {
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter) setter.set.call(el, val); else el.value = val;
      }
      ['input','change','keydown','keyup'].forEach(t =>
        el.dispatchEvent(new Event(t, { bubbles: true }))
      );
      return { success: true, tag: el.tagName.toLowerCase() };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; tag?: string };
}

export async function domSelectBy(
  wv: WebviewLike,
  selector: string,
  by: "label" | "value" | "index",
  value: string | number,
): Promise<{ success: boolean; error?: string }> {
  const code = `
    (function(){
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.tagName !== 'SELECT') return { success: false, error: 'not a select' };
      el.focus();
      var by = ${JSON.stringify(by)};
      var val = ${typeof value === "number" ? value : JSON.stringify(value)};
      if (by === 'index') {
        var i = Number(val);
        if (i >= 0 && i < el.options.length) { el.selectedIndex = i; }
      } else if (by === 'value') {
        el.value = String(val);
      } else {
        var opt = [...el.options].find(o => o.text.toLowerCase().includes(String(val).toLowerCase()));
        if (opt) el.value = opt.value;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; error?: string };
}

export async function domToggleCheckbox(
  wv: WebviewLike,
  selector: string,
  checked?: boolean,
): Promise<{ success: boolean }> {
  const code = `
    (function(){
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.type !== 'checkbox') return { success: false };
      ${checked === undefined ? `el.checked = !el.checked;` : `el.checked = ${checked ? "true" : "false"};`}
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean };
}

export async function domToggleRadio(wv: WebviewLike, selector: string): Promise<{ success: boolean }> {
  const code = `
    (function(){
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.type !== 'radio') return { success: false };
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean };
}

export async function domWaitForSelector(
  wv: WebviewLike,
  selector: string,
  timeoutMs: number,
): Promise<{ found: boolean }> {
  const code = `
    new Promise(function(resolve) {
      var deadline = Date.now() + ${timeoutMs};
      function check() {
        try {
          if (document.querySelector(${JSON.stringify(selector)})) return resolve({ found: true });
        } catch(e) {}
        if (Date.now() > deadline) return resolve({ found: false });
        setTimeout(check, 50);
      }
      check();
    })
  `;
  return (await wv.executeJavaScript(code)) as { found: boolean };
}

export async function domPressKey(wv: WebviewLike, key: string, modifiers: string[] = []): Promise<{ success: boolean }> {
  const code = `
    (function(){
      var el = document.activeElement || document.body;
      var opts = { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true };
      ${modifiers.includes("ctrl") ? "opts.ctrlKey = true;" : ""}
      ${modifiers.includes("shift") ? "opts.shiftKey = true;" : ""}
      ${modifiers.includes("alt") ? "opts.altKey = true;" : ""}
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
      return { success: true };
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean };
}
