import { describe, expect, it } from "vitest";
import {
  validateA2uiJsonlLinesStrict,
  validateA2uiJsonlStrictPrefix,
} from "./a2ui-strict-validate";
import { ADVANCED_TODO_LIST_A2UI_JSONL } from "./a2ui-example-advanced-todo-jsonl";

/** surfaceUpdate + beginRendering from the in-repo advanced todo (skips optional dataModel line). */
const lines = ADVANCED_TODO_LIST_A2UI_JSONL.trim().split(/\r?\n/);
const twoLineValid = [lines[0]!, lines[2]!].join("\n");

describe("validateA2uiJsonlStrictPrefix", () => {
  it("matches strict validator when all lines complete", () => {
    const full = validateA2uiJsonlLinesStrict(twoLineValid.trim());
    const pre = validateA2uiJsonlStrictPrefix(twoLineValid.trim());
    expect(full.ok).toBe(true);
    expect(pre.hardError).toBeNull();
    expect(pre.incompleteTail).toBe(false);
    if (full.ok) expect(pre.messages.length).toBe(full.messages.length);
  });

  it("returns valid prefix and incompleteTail when last line is incomplete JSON", () => {
    const partial = `${lines[0]!}\n{"beginRendering":{"surfaceId":"main","root":"roo`;
    const pre = validateA2uiJsonlStrictPrefix(partial.trim());
    expect(pre.incompleteTail).toBe(true);
    expect(pre.messages.length).toBe(1);
    expect(pre.hardError).toBeNull();
  });

  it("returns hardError when a non-last line has invalid JSON", () => {
    const bad = `${lines[0]!}\nNOT_JSON\n${lines[2]!}`;
    const pre = validateA2uiJsonlStrictPrefix(bad.trim());
    expect(pre.hardError).not.toBeNull();
    expect(pre.messages.length).toBe(1);
    expect(pre.incompleteTail).toBe(false);
  });
});
