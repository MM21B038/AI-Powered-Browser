import { describe, expect, it } from "vitest";
import { HOST_LOCAL_DEMO_A2UI_JSONL } from "./a2ui-example-host-local-jsonl";
import { validateA2uiJsonlLinesStrict } from "./a2ui-strict-validate";

describe("HOST_LOCAL_DEMO_A2UI_JSONL", () => {
  it("passes strict v0.8 validation (3 lines)", () => {
    const r = validateA2uiJsonlLinesStrict(HOST_LOCAL_DEMO_A2UI_JSONL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messages.length).toBe(3);
  });
});
