import { describe, expect, it } from "vitest";
import { validateA2uiV09JsonlLinesStrict } from "./a2ui-v0_9-validate";

describe("validateA2uiV09JsonlLinesStrict", () => {
  it("accepts valid v0.9 messages", () => {
    const jsonl = [
      JSON.stringify({
        version: "v0.9",
        createSurface: {
          surfaceId: "s",
          catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
        },
      }),
    ].join("\n");
    const r = validateA2uiV09JsonlLinesStrict(jsonl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messages.length).toBe(1);
  });

  it("rejects invalid JSON", () => {
    const r = validateA2uiV09JsonlLinesStrict("{");
    expect(r.ok).toBe(false);
  });
});

