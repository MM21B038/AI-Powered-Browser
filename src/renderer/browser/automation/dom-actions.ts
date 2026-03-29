/** Low-level guest-page actions via webview.executeJavaScript */

import type { ElectronApi } from "../../../shared/ipc-types";

function rendererElectronApi(): ElectronApi | undefined {
  return (globalThis as unknown as { electronAPI?: ElectronApi }).electronAPI;
}

export interface WebviewLike {
  executeJavaScript: (code: string) => Promise<unknown>;
  getWebContentsId?: () => number;
  /** Headless / background guest: run script inside a child frame by stable ids from interactables. */
  executeJavaScriptInGuestFrame?: (
    processId: number,
    routingId: number,
    code: string,
  ) => Promise<unknown>;
}

export type DomClickGuestOptions = {
  guestFrame: { processId: number; routingId: number };
};

/** Injected once into the guest document — ring + pixel burst at click point (automation click tool only). */
const CLICK_TOOL_SPARKLE_CSS = `
@keyframes butcherClickRing {
  0% { transform: scale(0.25); opacity: 0.95; }
  100% { transform: scale(18); opacity: 0; }
}
@keyframes butcherClickSpark {
  0% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.12); opacity: 0; }
}
`.trim();

export type DomClickResult = {
  success: boolean;
  tag?: string;
  error?: string;
  /** Guest viewport coords for host-shell click FX (optional). */
  fxCx?: number;
  fxCy?: number;
  fxVw?: number;
  fxVh?: number;
};

export async function domClick(
  wv: WebviewLike,
  selector: string,
  guest?: DomClickGuestOptions,
): Promise<DomClickResult> {
  const code = `
    (async function(){
      var SPARKLE_CSS = ${JSON.stringify(CLICK_TOOL_SPARKLE_CSS)};
      function ensureClickSparkleStyles() {
        if (document.getElementById('butcher-click-fx-style')) return;
        var st = document.createElement('style');
        st.id = 'butcher-click-fx-style';
        st.textContent = SPARKLE_CSS;
        document.documentElement.appendChild(st);
      }
      function clickSparkleAt(cx, cy) {
        try {
          ensureClickSparkleStyles();
          var reduce = false;
          try {
            reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          } catch (e) {}
          var root = document.createElement('div');
          root.setAttribute('data-butcher-click-fx', '1');
          root.style.cssText =
            'position:fixed;left:' +
            cx +
            'px;top:' +
            cy +
            'px;width:0;height:0;transform:translate(-50%,-50%);pointer-events:none;z-index:2147483646;contain:layout;';
          var ring = document.createElement('span');
          ring.style.cssText =
            'position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;box-sizing:border-box;' +
            'border:2px solid rgba(140,215,255,0.92);box-shadow:0 0 14px rgba(170,235,255,0.88),inset 0 0 10px rgba(255,255,255,0.35);' +
            'animation:butcherClickRing ' +
            (reduce ? '0.5s' : '0.95s') +
            ' cubic-bezier(0.2,0.82,0.18,1) forwards;';
          root.appendChild(ring);
          var count = reduce ? 12 : 96;
          var waveSplit = reduce ? 6 : 48;
          for (var i = 0; i < count; i++) {
            var wave2 = i >= waveSplit;
            var n = wave2 ? i - waveSplit : i;
            var nWave = wave2 ? count - waveSplit : waveSplit;
            var base = (6.283185307179586 * n) / nWave + (wave2 ? 0.08 : 0);
            var ang = base + (Math.random() - 0.5) * (reduce ? 0.07 : 0.35);
            var dist = (reduce ? 20 : 28) + Math.random() * (reduce ? 14 : 52);
            if (wave2) dist *= 1.22 + Math.random() * 0.42;
            var dx = Math.cos(ang) * dist;
            var dy = Math.sin(ang) * dist;
            var delay = 0;
            if (!reduce) {
              delay = wave2 ? 0.18 + Math.random() * 0.32 : Math.random() * 0.16;
            } else if (wave2) {
              delay = 0.1 + Math.random() * 0.12;
            }
            var dur = reduce ? (wave2 ? '0.62s' : '0.52s') : wave2 ? '1.38s' : '1.12s';
            var ease = wave2 ? 'cubic-bezier(0.1,0.72,0.22,1)' : 'cubic-bezier(0.14,0.78,0.2,1)';
            var sz = 2 + Math.floor(Math.random() * (reduce ? 2 : 3));
            var hue = 160 + Math.floor(Math.random() * 60);
            var p = document.createElement('i');
            p.style.cssText =
              'position:absolute;left:0;top:0;width:' +
              sz +
              'px;height:' +
              sz +
              'px;margin:' +
              -sz / 2 +
              'px 0 0 ' +
              -sz / 2 +
              'px;border-radius:1px;display:block;' +
              'background:hsla(' +
              hue +
              ',92%,70%,0.96);box-shadow:0 0 ' +
              (sz + 3) +
              'px hsla(' +
              hue +
              ',100%,78%,0.82);' +
              '--dx:' +
              dx +
              'px;--dy:' +
              dy +
              'px;animation:butcherClickSpark ' +
              dur +
              ' ' +
              ease +
              ' ' +
              delay +
              's forwards;';
            root.appendChild(p);
          }
          (document.body || document.documentElement).appendChild(root);
          setTimeout(function () {
            try {
              if (root.parentNode) root.parentNode.removeChild(root);
            } catch (e) {}
          }, reduce ? 620 : 1680);
        } catch (e) {}
      }
      function sparklePaintDelay() {
        return new Promise(function (resolve) {
          requestAnimationFrame(function () {
            requestAnimationFrame(resolve);
          });
        });
      }
      async function doClick(el) {
        try {
          var r = el.getBoundingClientRect();
          var inView = r.bottom > 0 && r.top < window.innerHeight;
          if (!inView) el.scrollIntoView({ block: 'center', behavior: 'instant' });
          el.focus();
          var r2 = el.getBoundingClientRect();
          var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
          clickSparkleAt(cx, cy);
          await sparklePaintDelay();
          var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new PointerEvent('pointerup', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.click();
          return {
            success: true,
            tag: el.tagName.toLowerCase(),
            fxCx: cx,
            fxCy: cy,
            fxVw: window.innerWidth,
            fxVh: window.innerHeight,
          };
        } catch(e) { return { success: false, error: String(e.message) }; }
      }
      try {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (el) return await doClick(el);
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
        if (tx === q || tx.indexOf(q) !== -1 || extras.indexOf(q) !== -1) return await doClick(n);
      }
      return { success: false };
    })()
  `;
  if (guest?.guestFrame) {
    const { processId, routingId } = guest.guestFrame;
    if (typeof wv.executeJavaScriptInGuestFrame === "function") {
      return (await wv.executeJavaScriptInGuestFrame(processId, routingId, code)) as DomClickResult;
    }
    const wid = typeof wv.getWebContentsId === "function" ? wv.getWebContentsId() : undefined;
    const api = rendererElectronApi();
    if (wid != null && api?.guestExecInFrame) {
      const r = await api.guestExecInFrame({
        webContentsId: wid,
        processId,
        routingId,
        script: code,
      });
      if (!r.success) return { success: false, error: r.error || "guestExecInFrame failed" };
      return r.data as DomClickResult;
    }
    return { success: false, error: "Guest iframe click requires Electron webview or background session support." };
  }
  return (await wv.executeJavaScript(code)) as DomClickResult;
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

export async function domTypeHuman(
  wv: WebviewLike,
  sel: string | null,
  text: string,
  opts?: {
    minDelayMs?: number;
    maxDelayMs?: number;
    mistakeRate?: number;
  },
): Promise<{ success: boolean; tag?: string; error?: string }> {
  const code = `
    (async function(){
      function rand(a,b){ return Math.floor(a + Math.random() * (b - a + 1)); }
      function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
      function isTextEl(el){
        if(!el) return false;
        if(el.isContentEditable) return true;
        var tag = (el.tagName||'').toUpperCase();
        if(tag === 'TEXTAREA') return true;
        if(tag === 'INPUT') {
          var t = (el.type||'text').toLowerCase();
          return ['text','search','email','url','tel','password','number'].includes(t);
        }
        return false;
      }
      function setValue(el, val){
        if(el.isContentEditable){
          el.textContent = val;
          return;
        }
        var tag = (el.tagName||'').toUpperCase();
        var proto = tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto,'value');
        if (d && d.set) d.set.call(el, val); else el.value = val;
      }
      function getValue(el){
        if(el.isContentEditable) return el.textContent || '';
        return el.value || '';
      }
      function fire(el, type, init){
        try { el.dispatchEvent(new Event(type, { bubbles:true })); } catch(e) {}
      }
      function fireKey(el, type, key){
        try {
          var ev = new KeyboardEvent(type, { key: key, bubbles:true, cancelable:true });
          el.dispatchEvent(ev);
        } catch(e) {}
      }
      function insertChar(el, ch){
        // Prefer native text insertion where available (produces realistic input events)
        try {
          if (typeof el.setRangeText === 'function' && typeof el.selectionStart === 'number') {
            var s = el.selectionStart, e = el.selectionEnd;
            el.setRangeText(ch, s, e, 'end');
            return;
          }
        } catch(e) {}
        setValue(el, getValue(el) + ch);
      }
      function backspace(el){
        try {
          if (typeof el.setRangeText === 'function' && typeof el.selectionStart === 'number') {
            var s = el.selectionStart, e = el.selectionEnd;
            if (s === e && s > 0) {
              el.setRangeText('', s - 1, s, 'end');
              return;
            }
            el.setRangeText('', s, e, 'end');
            return;
          }
        } catch(e) {}
        var v = getValue(el);
        setValue(el, v.slice(0, Math.max(0, v.length - 1)));
      }
      function maybePauseFor(ch){
        if (ch === ' ' ) return rand(70, 220);
        if (/[\\.,;:!?]/.test(ch)) return rand(120, 360);
        if (ch === '\\n') return rand(160, 420);
        return 0;
      }
      function wrongCharFor(ch){
        if (!ch || ch.length !== 1) return 'x';
        var alpha = 'abcdefghijklmnopqrstuvwxyz';
        var low = ch.toLowerCase();
        var i = alpha.indexOf(low);
        if (i === -1) return 'x';
        var j = (i + rand(1, 5)) % alpha.length;
        var out = alpha[j];
        return ch === low ? out : out.toUpperCase();
      }

      try {
        var minDelay = ${Number.isFinite(opts?.minDelayMs) ? Math.max(0, Math.floor(opts!.minDelayMs!)) : 28};
        var maxDelay = ${Number.isFinite(opts?.maxDelayMs) ? Math.max(0, Math.floor(opts!.maxDelayMs!)) : 120};
        if (maxDelay < minDelay) maxDelay = minDelay;
        var mistakeRate = ${Number.isFinite(opts?.mistakeRate) ? Math.max(0, Math.min(0.35, Number(opts!.mistakeRate))) : 0.06};

        var target = null;
        var sel = ${sel ? JSON.stringify(sel) : "null"};
        if (sel) {
          try { target = document.querySelector(sel); } catch(e) { target = null; }
          if (!target) return { success:false, error:'not_found' };
          target.scrollIntoView({ block:'center', behavior:'instant' });
          target.focus();
        } else {
          target = document.activeElement;
        }
        if (!target || target === document.body) return { success:false, error:'no_focus' };
        if (!isTextEl(target)) return { success:false, error:'not_text_input' };

        var full = ${JSON.stringify(text ?? "")};
        // Ensure caret at end
        try {
          if (typeof target.setSelectionRange === 'function' && typeof target.value === 'string') {
            var n = target.value.length;
            target.setSelectionRange(n, n);
          }
        } catch(e) {}

        for (var idx=0; idx<full.length; idx++) {
          var ch = full[idx];
          if (ch === '\\r') continue;

          // occasional mistake + correction
          if (Math.random() < mistakeRate && /[a-zA-Z]/.test(ch)) {
            var wrong = wrongCharFor(ch);
            fireKey(target, 'keydown', wrong);
            fireKey(target, 'keypress', wrong);
            insertChar(target, wrong);
            fire(target, 'input');
            fireKey(target, 'keyup', wrong);
            await sleep(rand(minDelay, maxDelay));
            fireKey(target, 'keydown', 'Backspace');
            backspace(target);
            fire(target, 'input');
            fireKey(target, 'keyup', 'Backspace');
            await sleep(rand(60, 160));
          }

          fireKey(target, 'keydown', ch === '\\n' ? 'Enter' : ch);
          fireKey(target, 'keypress', ch === '\\n' ? 'Enter' : ch);
          if (ch === '\\n') {
            // contentEditable supports newline; inputs use \\n literally
            if (target.isContentEditable) insertChar(target, '\\n');
            else insertChar(target, ' ');
          } else {
            insertChar(target, ch);
          }
          fire(target, 'input');
          fireKey(target, 'keyup', ch === '\\n' ? 'Enter' : ch);

          var extra = maybePauseFor(ch);
          await sleep(rand(minDelay, maxDelay) + extra);
        }
        fire(target, 'change');
        return { success:true, tag:(target.tagName||'').toLowerCase() };
      } catch(e) {
        return { success:false, error:String(e && e.message ? e.message : e) };
      }
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; tag?: string; error?: string };
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

export async function domPressHold(
  wv: WebviewLike,
  selector: string,
  holdMs: number,
): Promise<{ success: boolean; tag?: string; heldMs?: number; error?: string }> {
  const safeHold = Math.max(80, Math.min(30000, Math.floor(holdMs || 0)));
  const code = `
    (async function(){
      function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
      try {
        var el = null;
        try { el = document.querySelector(${JSON.stringify(selector)}); } catch(e) { el = null; }
        if (!el) return { success:false, error:'not_found' };
        var r = el.getBoundingClientRect();
        var inView = r.bottom > 0 && r.top < window.innerHeight;
        if (!inView) el.scrollIntoView({ block:'center', behavior:'instant' });
        el.focus();
        var r2 = el.getBoundingClientRect();
        var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
        var opts = { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        await wait(${safeHold});
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        return { success:true, tag:(el.tagName||'').toLowerCase(), heldMs:${safeHold} };
      } catch(e) {
        return { success:false, error:String(e && e.message ? e.message : e) };
      }
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; tag?: string; heldMs?: number; error?: string };
}

export async function domSetDate(
  wv: WebviewLike,
  target: string,
  iso: string,
): Promise<{ success: boolean; mode?: string; error?: string }> {
  const code = `
    (function(){
      function looksLikeSelector(s){
        if(!s) return false;
        if(s.startsWith('#')||s.startsWith('.')||s.startsWith('[')) return true;
        if(s.includes('>')||s.includes(':nth')||s.includes(' ')) return true;
        return false;
      }
      function findByLabel(q){
        const qq = (q||'').toLowerCase().trim();
        const nodes = document.querySelectorAll('input,button,[role=button],[aria-haspopup]');
        for(let i=0;i<nodes.length;i++){
          const n = nodes[i];
          const tx = (n.innerText||n.textContent||n.value||n.getAttribute('aria-label')||n.getAttribute('title')||'').trim().toLowerCase();
          if(!tx) continue;
          if(tx === qq || tx.includes(qq)) return n;
        }
        return null;
      }
      function click(el){
        try {
          el.scrollIntoView({ block:'center', behavior:'instant' });
          el.focus();
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width/2, cy = r.top + r.height/2;
          const opts = { bubbles:true, cancelable:true, view: window, clientX: cx, clientY: cy };
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new MouseEvent('mousedown', opts));
          el.dispatchEvent(new PointerEvent('pointerup', opts));
          el.dispatchEvent(new MouseEvent('mouseup', opts));
          el.click();
          return true;
        } catch { return false; }
      }
      function setNativeDate(input, val){
        try {
          input.scrollIntoView({ block:'center', behavior:'instant' });
          input.focus();
          const proto = window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto,'value');
          if (setter) setter.set.call(input, val); else input.value = val;
          input.dispatchEvent(new Event('input', { bubbles:true }));
          input.dispatchEvent(new Event('change', { bubbles:true }));
          return true;
        } catch { return false; }
      }
      try {
        const targetRaw = ${JSON.stringify(target)};
        const iso = ${JSON.stringify(iso)};
        let el = null;
        if (looksLikeSelector(targetRaw)) {
          try { el = document.querySelector(targetRaw); } catch {}
        }
        if (!el) el = findByLabel(targetRaw);
        if (!el) return { success:false, error:'not_found' };

        // Native input[type=date]
        if (el.tagName === 'INPUT' && (el.type||'').toLowerCase() === 'date') {
          return setNativeDate(el, iso) ? { success:true, mode:'native' } : { success:false, error:'native_failed' };
        }

        // If the input is not a date input, try: click trigger → find a calendar day button.
        click(el);

        function findCalendarRoot() {
          return document.querySelector('[role=dialog],[role=grid],[aria-modal=true]') || document.body;
        }
        const d = new Date(iso + 'T00:00:00');
        const day = String(d.getDate());
        const root = findCalendarRoot();
        // Prefer aria-label match (common in Radix calendars)
        const candidates = [];
        const fmt = (opts) => {
          try { return new Intl.DateTimeFormat(undefined, opts).format(d); } catch { return ''; }
        };
        candidates.push(fmt({ month:'long', day:'numeric', year:'numeric' }));
        candidates.push(fmt({ weekday:'long', month:'long', day:'numeric', year:'numeric' }));
        candidates.push(fmt({ month:'short', day:'numeric', year:'numeric' }));
        for (const c of candidates) {
          if (!c) continue;
          const btn = root.querySelector('button[aria-label]') && Array.from(root.querySelectorAll('button[aria-label]')).find(b => (b.getAttribute('aria-label')||'').toLowerCase() === c.toLowerCase());
          if (btn) { click(btn); return { success:true, mode:'radix-aria' }; }
        }
        // Fallback: click day by visible text
        const dayBtns = Array.from(root.querySelectorAll('button')).filter(b => (b.textContent||'').trim() === day && !b.disabled);
        if (dayBtns.length === 1) { click(dayBtns[0]); return { success:true, mode:'radix-day' }; }
        if (dayBtns.length > 1) { click(dayBtns[0]); return { success:true, mode:'radix-day-ambiguous' }; }

        return { success:false, error:'calendar_day_not_found' };
      } catch(e) {
        return { success:false, error:String(e && e.message ? e.message : e) };
      }
    })()
  `;
  return (await wv.executeJavaScript(code)) as { success: boolean; mode?: string; error?: string };
}
