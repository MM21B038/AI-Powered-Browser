import { describe, expect, it } from "vitest";
import { A2UI_V09_HOST_CATALOG_JSON_URL } from "./a2ui-v0_9-constants";
import { validateA2uiV09JsonlLinesStrict } from "./a2ui-v0_9-validate";

describe("validateA2uiV09JsonlLinesStrict", () => {
  it("accepts valid v0.9 messages", () => {
    const jsonl = [
      JSON.stringify({
        version: "v0.9",
        createSurface: {
          surfaceId: "s",
          catalogId: A2UI_V09_HOST_CATALOG_JSON_URL,
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

