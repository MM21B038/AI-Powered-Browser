import { describe, expect, it } from "vitest";
import {
  formatChatApiErrorMessage,
  getChatApiErrorDisplay,
} from "./api-error-format";

describe("formatChatApiErrorMessage", () => {
  it("formats Gemini 429 array body", () => {
    const raw = `[{"error":{"code":429,"message":"You exceeded your current quota, please check your plan.\\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash-lite\\nPlease retry in 21.695882143s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaDimensions":{"model":"gemini-2.5-flash-lite"},"quotaValue":"20"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"21s"}]}}]`;
    const out = formatChatApiErrorMessage(raw, 429);
    expect(out).toContain("Rate limit or quota exceeded");
    expect(out).toContain("gemini-2.5-flash-lite");
    expect(out).toContain("Retry after");
    expect(out).not.toContain("type.googleapis.com");
  });

  it("formats OpenAI-style JSON", () => {
    const raw = `{"error":{"message":"Incorrect API key","type":"invalid_request_error"}}`;
    expect(formatChatApiErrorMessage(raw, 401)).toContain("Incorrect API key");
  });

  it("passes through short plain text", () => {
    expect(formatChatApiErrorMessage("Network failure")).toBe("Network failure");
  });
});

describe("getChatApiErrorDisplay", () => {
  it("maps HTTP 500 to error severity", () => {
    const d = getChatApiErrorDisplay("Server error\n\nUpstream failed", 503);
    expect(d.severity).toBe("error");
    expect(d.httpStatus).toBe(503);
    expect(d.title).toBe("Server error");
  });

  it("maps HTTP 429 to warning severity", () => {
    const d = getChatApiErrorDisplay("Rate limit or quota exceeded\n\nSlow down", 429);
    expect(d.severity).toBe("warning");
    expect(d.httpStatus).toBe(429);
  });

  it("maps settings-style copy to info when no status", () => {
    const d = getChatApiErrorDisplay("Select a model in Settings.");
    expect(d.severity).toBe("info");
  });
});
