import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { highlightCodeBlock } from "./code-highlight";

/** Shared HTML escape for kernel + markdown renderer. */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeCodeLang(rawLang: string | undefined): string {
  const l = (rawLang || "").trim().toLowerCase();
  if (!l) return "";
  return l.replace(/[^a-z0-9_+-]/g, "");
}

const CLIPBOARD_ICON = `<svg class="md-codecopy-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;

export const CHAT_MARKDOWN_PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
  FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ADD_TAGS: ["svg", "path", "span"],
  ADD_ATTR: [
    "viewBox",
    "width",
    "height",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "xmlns",
    "d",
    "aria-hidden",
    "focusable",
    "class",
    "title",
    "data-lang",
    "data-auto-lang",
  ],
};

export function buildMarkedRenderer() {
  const r = new marked.Renderer();

  r.link = function (this: InstanceType<typeof marked.Renderer>, tok: Tokens.Link) {
    const safeHref = tok.href || "";
    const safeTitle = tok.title || "";
    const titleAttr = safeTitle ? ` title="${escapeHtml(safeTitle)}"` : "";
    const inner = this.parser.parseInline(tok.tokens);
    return `<a class="md-link" href="${escapeHtml(safeHref)}"${titleAttr}>${inner}</a>`;
  };

  r.code = (tok: Tokens.Code) => {
    const text = tok.text ?? "";
    const lang = normalizeCodeLang(tok.lang);
    const label = lang || "text";
    const { html: codeInner, hljs: useHljs, classLang } = highlightCodeBlock(String(text), lang);
    const displayLang = lang || classLang;
    const codeClass = [useHljs ? "hljs" : "", displayLang ? `language-${displayLang}` : ""]
      .filter(Boolean)
      .join(" ");
    const langAttr = lang ? ` data-lang="${lang}"` : "";
    const autoLangAttr = !lang ? ` data-auto-lang="1"` : "";
    return `
      <div class="md-codeblock"${langAttr}>
        <div class="md-codeblock-head">
          <span class="md-codeblock-lang"${autoLangAttr}>${escapeHtml(label)}</span>
          <button type="button" class="md-codecopy" aria-label="Copy code" title="Copy">
            ${CLIPBOARD_ICON}
          </button>
        </div>
        <pre><code class="${codeClass}">${codeInner}</code></pre>
      </div>
    `.trim();
  };

  return r;
}

/**
 * Markdown → sanitized HTML. Use `wrapperClass` (e.g. `ai-chat-md`) for scoped bubble styles.
 */
export function renderChatMarkdownToHtml(raw: string, opts?: { wrapperClass?: string }): string {
  const html = marked.parse(String(raw ?? ""), {
    async: false,
    gfm: true,
    breaks: true,
    renderer: buildMarkedRenderer(),
  }) as string;
  const inner = opts?.wrapperClass ? `<div class="${opts.wrapperClass}">${html}</div>` : html;
  const out = DOMPurify.sanitize(inner ?? "", {
    ...CHAT_MARKDOWN_PURIFY_CONFIG,
  });
  return typeof out === "string" ? out : String(out);
}
