import { describe, expect, it } from "vitest";
import { ADVANCED_TODO_LIST_A2UI_JSONL } from "./a2ui-example-advanced-todo-jsonl";
import { validateA2uiJsonlLinesStrict } from "./a2ui-strict-validate";

describe("ADVANCED_TODO_LIST_A2UI_JSONL", () => {
  it("passes strict v0.8 validation (3 lines)", () => {
    const r = validateA2uiJsonlLinesStrict(ADVANCED_TODO_LIST_A2UI_JSONL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messages.length).toBe(3);
  });
});
