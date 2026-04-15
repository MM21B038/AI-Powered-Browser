import { describe, expect, it } from "vitest";
import { buildA2uiHostTheme } from "./a2ui-host-theme";

describe("buildA2uiHostTheme", () => {
  it("merges additionalStyles bound to host CSS variables", () => {
    const t = buildA2uiHostTheme();
    expect(t.additionalStyles?.Button?.background).toBe("var(--accent)");
    const textExtra = t.additionalStyles?.Text;
    expect(textExtra && typeof textExtra === "object" && "body" in textExtra).toBe(true);
    if (
      textExtra &&
      typeof textExtra === "object" &&
      "body" in textExtra &&
      typeof textExtra.body === "object"
    ) {
      expect(textExtra.body.color).toBe("var(--text)");
    }
  });
});
