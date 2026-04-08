import { describe, expect, it } from "vitest";
import { extractThinkingDelta } from "./ai-chat";

describe("extractThinkingDelta", () => {
  it("does not duplicate reasoning when the same key matches direct list and regex pass", () => {
    expect(
      extractThinkingDelta({
        reasoning: "step one",
      }),
    ).toBe("step one");
  });

  it("still picks up extra reasoning-like keys not in the direct list", () => {
    expect(
      extractThinkingDelta({
        reasoning: "a",
        deliberation_notes: "b",
      }),
    ).toBe("ab");
  });

  it("extracts Gemini-style content array reasoning parts", () => {
    expect(
      extractThinkingDelta({
        content: [
          { type: "reasoning", text: "plan: " },
          { type: "text", text: "Hello" },
        ],
      }),
    ).toBe("plan: ");
  });

  it("extracts content_blocks reasoning", () => {
    expect(
      extractThinkingDelta({
        content_blocks: [{ type: "thinking", text: "step" }],
      }),
    ).toBe("step");
  });
});
