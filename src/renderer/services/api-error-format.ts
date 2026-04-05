/**
 * Format raw HTTP/API error bodies into short, readable chat lines (OpenAI-compatible JSON, Gemini RPC, arrays).
 */

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Strip common wrappers so JSON.parse works. */
function unwrapRawErrorText(raw: string): string {
  let s = raw.trim();
  const errPrefix = /^error:\s*/i;
  if (errPrefix.test(s)) s = s.replace(errPrefix, "").trim();
  return s;
}

function parseJsonLoose(raw: string): unknown | null {
  const s = unwrapRawErrorText(raw);
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

function extractRetryDelay(details: unknown): string {
  if (!Array.isArray(details)) return "";
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const t = String(o["@type"] ?? "");
    if (t.includes("RetryInfo") && typeof o.retryDelay === "string") {
      return o.retryDelay.trim();
    }
  }
  return "";
}

function extractQuotaHint(details: unknown): { model?: string; limit?: string } {
  if (!Array.isArray(details)) return {};
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (!String(o["@type"] ?? "").includes("QuotaFailure")) continue;
    const violations = o.violations;
    if (!Array.isArray(violations) || violations.length === 0) continue;
    const v = violations[0] as Record<string, unknown>;
    const qd = v.quotaDimensions;
    const model =
      qd && typeof qd === "object" && typeof (qd as Record<string, unknown>).model === "string"
        ? String((qd as Record<string, string>).model)
        : undefined;
    const limit = typeof v.quotaValue === "string" ? v.quotaValue : undefined;
    return { model, limit };
  }
  return {};
}

function formatErrorObject(err: unknown, httpStatus?: number): string {
  if (!err || typeof err !== "object") return "Unknown API error";
  const e = err as Record<string, unknown>;
  const message = typeof e.message === "string" ? e.message : "";
  const code = e.code;
  const rpcStatus = typeof e.status === "string" ? e.status : "";
  const type = typeof e.type === "string" ? e.type : "";

  const codeNum = typeof code === "number" ? code : Number(code);
  const is429 =
    codeNum === 429 ||
    httpStatus === 429 ||
    rpcStatus === "RESOURCE_EXHAUSTED" ||
    /quota exceeded|rate limit|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(message);

  const retryDelay = extractRetryDelay(e.details);
  const { model, limit } = extractQuotaHint(e.details);

  const title = is429
    ? "Rate limit or quota exceeded"
    : type
      ? `API error (${type})`
      : `API error${!Number.isNaN(codeNum) && codeNum ? ` (${codeNum})` : httpStatus ? ` (HTTP ${httpStatus})` : ""}`;

  const lines: string[] = [title];

  if (message) {
    const firstBlock = message.split("\n\n")[0]?.trim() ?? message.trim();
    lines.push(truncate(firstBlock, 600));
  }

  if (model || limit) {
    const bits: string[] = [];
    if (model) bits.push(`model: ${model}`);
    if (limit) bits.push(`limit: ${limit}`);
    lines.push(bits.join(" · "));
  }

  if (retryDelay) {
    lines.push(`Retry after: ~${retryDelay}`);
  }

  const urlMatch = message.match(/https:\/\/[^\s)\]"]+/);
  if (urlMatch) {
    lines.push(`More info: ${urlMatch[0]}`);
  }

  return lines.join("\n\n");
}

function extractInnerError(parsed: unknown): unknown {
  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0];
    if (first && typeof first === "object" && "error" in first) {
      return (first as { error: unknown }).error;
    }
    return first;
  }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return (parsed as { error: unknown }).error;
  }
  return null;
}

/**
 * Turn a raw error string (JSON body, plain text, or `Error: [...]` from proxy) into readable markdown-safe text.
 */
export function formatChatApiErrorMessage(raw: string, httpStatus?: number): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return httpStatus ? `Request failed (HTTP ${httpStatus})` : "Request failed";
  }

  const parsed = parseJsonLoose(trimmed);
  if (parsed !== null) {
    const inner = extractInnerError(parsed);
    if (inner !== null) {
      return formatErrorObject(inner, httpStatus);
    }
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const m = (parsed as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return truncate(m.trim(), 800);
    }
  }

  return truncate(trimmed, 900);
}

/** Visual severity for API error cards (streaming + persisted messages). */
export type ChatApiErrorSeverity = "error" | "warning" | "info";

/** Structured display for chat API error blocks (not raw JSON). */
export type ChatApiErrorDisplay = {
  severity: ChatApiErrorSeverity;
  title: string;
  detail: string;
  httpStatus?: number;
  /** Short label when `httpStatus` is unknown (e.g. code parsed from title). */
  codeLabel?: string;
};

function inferChatApiErrorSeverity(
  httpStatus: number | undefined,
  title: string,
  detail: string,
): ChatApiErrorSeverity {
  const blob = `${title}\n${detail}`.toLowerCase();
  if (httpStatus != null && Number.isFinite(httpStatus)) {
    const s = httpStatus;
    if (s >= 500) return "error";
    if (s === 429 || s === 408) return "warning";
    if (s >= 400 && s < 500) return "warning";
  }
  if (
    /rate limit|quota exceeded|resource_exhausted|too many requests/.test(blob)
  ) {
    return "warning";
  }
  if (
    /select a model|api key required|google api key required|custom tls ca requires/.test(
      blob,
    )
  ) {
    return "info";
  }
  if (/maximum agent tool rounds/.test(blob)) {
    return "warning";
  }
  return "error";
}

function extractCodeLabel(
  httpStatus: number | undefined,
  title: string,
): string | undefined {
  if (httpStatus != null && Number.isFinite(httpStatus)) {
    return String(httpStatus);
  }
  const paren = title.match(/\((\d{3})\)\s*$/);
  if (paren) return paren[1];
  const http = title.match(/HTTP\s+(\d{3})/i);
  if (http) return http[1];
  return undefined;
}

/**
 * Build a structured error card from the same strings used for `formatChatApiErrorMessage`
 * (pass the formatted message; optional HTTP status when known).
 */
export function getChatApiErrorDisplay(
  message: string,
  httpStatus?: number,
): ChatApiErrorDisplay {
  const trimmed = message.trim();
  const parts = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const title = parts[0] ?? "Request failed";
  const detail = parts.slice(1).join("\n\n");
  const severity = inferChatApiErrorSeverity(httpStatus, title, detail);
  const codeLabel = extractCodeLabel(httpStatus, title);
  return {
    severity,
    title,
    detail,
    ...(httpStatus != null && Number.isFinite(httpStatus) ? { httpStatus } : {}),
    ...(codeLabel ? { codeLabel } : {}),
  };
}
