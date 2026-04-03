import { describe, expect, it } from "vitest";
import { responseLooksLikeToolsNotSupported } from "./ai-chat";

describe("responseLooksLikeToolsNotSupported", () => {
  it("returns true for typical OpenAI-style tool rejection", () => {
    const body = JSON.stringify({
      error: {
        message: "Invalid value for 'tool_choice': ...",
        param: "tool_choice",
        type: "invalid_request_error",
      },
    });
    expect(responseLooksLikeToolsNotSupported(400, body)).toBe(true);
  });

  it("returns false for 400 unrelated to tools", () => {
    expect(responseLooksLikeToolsNotSupported(400, '{"error":{"message":"invalid_api_key"}}')).toBe(false);
  });

  it("returns false for 401", () => {
    expect(
      responseLooksLikeToolsNotSupported(401, '{"error":{"message":"Incorrect API key"}}'),
    ).toBe(false);
  });

  it("returns true for 422 with tools param in JSON body", () => {
    expect(responseLooksLikeToolsNotSupported(422, '{"error":{"param":"tools"}}')).toBe(true);
  });

  it("returns true for OpenRouter 404 when no endpoint supports tool use", () => {
    const body = JSON.stringify({
      error: {
        message:
          "No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection",
        code: 404,
      },
    });
    expect(responseLooksLikeToolsNotSupported(404, body)).toBe(true);
  });

  it("returns false for 404 unrelated to tools", () => {
    expect(responseLooksLikeToolsNotSupported(404, '{"error":{"message":"Model not found"}}')).toBe(false);
  });
});
