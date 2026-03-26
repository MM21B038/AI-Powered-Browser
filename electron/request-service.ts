import type { RequestRunInput, RequestRunResult, RequestTemplate } from "../src/shared/ipc-types";
import { getTemplate, upsertTemplate } from "./request-store";
import {
  extractCsrfTokenFromHtml,
  getCookieHeader,
  setCookieFromSetCookieHeader,
} from "./security/cookie-token-store";

function withQuery(url: string, query?: Record<string, string>): string {
  const u = new URL(url);
  Object.entries(query ?? {}).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

function isMutating(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function preview(text: string): string {
  return text.length > 4000 ? text.slice(0, 4000) + "\n...[truncated]" : text;
}

function normalizeTemplate(input: RequestRunInput, existing: RequestTemplate | null): RequestTemplate {
  const base = existing ?? (input.template as RequestTemplate);
  if (!base) throw new Error("No request template provided");
  const merged: RequestTemplate = {
    ...base,
    ...input.override,
    headers: { ...(base.headers ?? {}), ...(input.override?.headers ?? {}) },
    query: { ...(base.query ?? {}), ...(input.override?.query ?? {}) },
    auth: input.override?.auth ?? base.auth ?? { type: "none" },
    updatedAt: Date.now(),
    createdAt: base.createdAt ?? Date.now(),
  };
  return merged;
}

export async function runRequest(input: RequestRunInput): Promise<RequestRunResult> {
  const existing = input.templateId ? await getTemplate(input.templateId) : null;
  const tpl = normalizeTemplate(input, existing);
  const method = tpl.method.toUpperCase();
  if (isMutating(method) && !input.allowMutating) {
    throw new Error("Mutating requests are blocked unless allowMutating=true");
  }

  const timeoutMs = Math.max(1000, input.timeoutMs ?? 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const url = withQuery(tpl.url, tpl.query);

  const headers = new Headers();
  Object.entries(tpl.headers ?? {}).forEach(([k, v]) => headers.set(k, v));
  if (tpl.auth?.type === "bearer" && tpl.auth.token) {
    headers.set("Authorization", `Bearer ${tpl.auth.token}`);
  }

  if (tpl.cookieProfile) {
    const cookie = await getCookieHeader(tpl.cookieProfile, url);
    if (cookie) headers.set("Cookie", cookie);
  }

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
    redirect: input.followRedirects === false ? "manual" : "follow",
  };
  if (tpl.body && method !== "GET" && method !== "HEAD") {
    init.body = tpl.body;
  }

  try {
    const resp = await fetch(url, init);
    const text = await resp.text();
    const outHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });

    if (tpl.cookieProfile) {
      const setCookie = resp.headers.get("set-cookie");
      if (setCookie) {
        await setCookieFromSetCookieHeader(tpl.cookieProfile, url, setCookie);
      }
      const csrf = extractCsrfTokenFromHtml(text);
      if (csrf?.value) {
        // keep a token snapshot in header default for next run
        await upsertTemplate({
          ...tpl,
          headers: { ...tpl.headers, [csrf.name]: csrf.value },
        });
      }
    }

    clearTimeout(timer);
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      url: resp.url,
      headers: outHeaders,
      bodyText: text,
      bodyPreview: preview(text),
      durationMs: Date.now() - started,
    };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      statusText: "Request failed",
      url,
      headers: {},
      bodyText: msg,
      bodyPreview: msg,
      durationMs: Date.now() - started,
    };
  }
}
