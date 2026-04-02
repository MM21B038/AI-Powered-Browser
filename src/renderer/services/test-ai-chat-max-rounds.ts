import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_TOOL_ROUNDS } from "./ai-chat";

describe("agent tool rounds default", () => {
  it("DEFAULT_MAX_TOOL_ROUNDS is greater than legacy 8", () => {
    expect(DEFAULT_MAX_TOOL_ROUNDS).toBeGreaterThan(8);
    expect(DEFAULT_MAX_TOOL_ROUNDS).toBe(32);
  });
});
