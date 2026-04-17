import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const AUTO_HIGHLIGHT_MAX_CHARS = 24_000;

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  tsx: "typescript",
  md: "markdown",
  mkd: "markdown",
  html: "xml",
  htm: "xml",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  cpp: "cpp",
  "c#": "csharp",
  cs: "csharp",
  golang: "go",
};

let registered = false;

function ensureHljsRegistered(): void {
  if (registered) return;
  registered = true;

  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("csharp", csharp);

  hljs.registerAliases(["jsx", "mjs", "cjs"], { languageName: "javascript" });
  hljs.registerAliases(["tsx", "mts", "cts"], { languageName: "typescript" });
  hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
  hljs.registerAliases(["yml"], { languageName: "yaml" });
  hljs.registerAliases(["py"], { languageName: "python" });
  hljs.registerAliases(["rs"], { languageName: "rust" });
  hljs.registerAliases(["cs"], { languageName: "csharp" });
  hljs.registerAliases(["html", "htm"], { languageName: "xml" });
  hljs.registerAliases(["md", "mkd"], { languageName: "markdown" });
}

function resolveLanguage(normalizedLang: string): string {
  const t = normalizedLang.trim().toLowerCase();
  if (!t) return "";
  return LANG_ALIASES[t] ?? t;
}

export function highlightCodeBlock(
  code: string,
  normalizedLang: string,
): { html: string; hljs: boolean; classLang: string } {
  ensureHljsRegistered();
  const src = String(code ?? "");
  const resolved = resolveLanguage(normalizedLang);

  const tryHighlight = (langName: string): string | null => {
    if (!langName || !hljs.getLanguage(langName)) return null;
    try {
      return hljs.highlight(src, { language: langName, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  };

  if (resolved) {
    const value = tryHighlight(resolved);
    if (value != null) {
      return { html: value, hljs: true, classLang: resolved };
    }
  }

  if (src.length <= AUTO_HIGHLIGHT_MAX_CHARS) {
    try {
      const subset = hljs.listLanguages();
      const auto = hljs.highlightAuto(src, subset);
      if (auto?.value && auto.language) {
        return { html: auto.value, hljs: true, classLang: auto.language };
      }
    } catch {
      /* ignore */
    }
  }

  return {
    html: escapeHtml(src).replace(/\n$/, ""),
    hljs: false,
    classLang: resolved || "",
  };
}
