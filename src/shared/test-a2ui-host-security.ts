import { describe, expect, it } from "vitest";
import {
  hostA2uiSecurityPromptOneLiner,
  hostA2uiSecurityPromptSection,
} from "./a2ui-host-security";

describe("a2ui-host-security", () => {
  it("includes validation and secrets guidance in the long section", () => {
    const s = hostA2uiSecurityPromptSection();
    expect(s).toContain("Validation");
    expect(s).toContain("Secrets");
    expect(s).toContain("acceptsInlineCatalogs");
  });

  it("keeps the one-liner compact", () => {
    const o = hostA2uiSecurityPromptOneLiner();
    expect(o.length).toBeLessThan(400);
    expect(o).toContain("Strict");
  });
});
