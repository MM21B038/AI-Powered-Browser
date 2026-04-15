import { describe, expect, it } from "vitest";
import {
  validateHostCatalogPolicy,
} from "./a2ui-host-catalog-policy";
import { A2UI_V08_STANDARD_COMPONENT_KEYS } from "./a2ui-catalog-constants";

describe("validateHostCatalogPolicy", () => {
  it("accepts standard Button when full catalog allowlist is used", () => {
    const r = validateHostCatalogPolicy(
      [
        {
          surfaceUpdate: {
            surfaceId: "s",
            components: [{ id: "b", component: { Button: { child: "t" } } }],
          },
        },
      ],
      new Set(A2UI_V08_STANDARD_COMPONENT_KEYS),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects components not in a restricted allowlist", () => {
    const r = validateHostCatalogPolicy(
      [
        {
          surfaceUpdate: {
            surfaceId: "s",
            components: [{ id: "b", component: { Button: { child: "t" } } }],
          },
        },
      ],
      new Set(["Text", "Column"]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Button");
    }
  });
});
