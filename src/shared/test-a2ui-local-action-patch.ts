import { describe, expect, it } from "vitest";
import {
  A2UI_HOST_PATCH_V1,
  isA2uiLocalPatchOptIn,
  tryBuildLocalPatchMessagesV09,
} from "./a2ui-local-action-patch";
import type { A2uiClientAction } from "@a2ui/web_core/v0_9/schema/client-to-server.js";

const baseAction = (): A2uiClientAction => ({
  name: "noop",
  surfaceId: "surfA",
  sourceComponentId: "btn1",
  timestamp: "2026-01-01T00:00:00.000Z",
  context: {},
});

describe("isA2uiLocalPatchOptIn", () => {
  it("is true for host.patch.v1", () => {
    expect(
      isA2uiLocalPatchOptIn({ ...baseAction(), name: A2UI_HOST_PATCH_V1 }),
    ).toBe(true);
  });

  it("is true when context.a2uiLocalPatch is true", () => {
    expect(
      isA2uiLocalPatchOptIn({
        ...baseAction(),
        context: { a2uiLocalPatch: true },
      }),
    ).toBe(true);
  });

  it("is false without marker", () => {
    expect(isA2uiLocalPatchOptIn(baseAction())).toBe(false);
  });
});

describe("tryBuildLocalPatchMessagesV09", () => {
  it("returns not_opt_in when not opted in", () => {
    const r = tryBuildLocalPatchMessagesV09(baseAction());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_opt_in");
  });

  it("builds validated updateDataModel for host.patch.v1", () => {
    const r = tryBuildLocalPatchMessagesV09({
      ...baseAction(),
      name: A2UI_HOST_PATCH_V1,
      context: {
        patchKind: "dataModelUpdate",
        path: "/",
        contents: [{ key: "n", valueNumber: 2 }],
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messages).toHaveLength(1);
      const m = r.messages[0] as {
        version?: string;
        updateDataModel?: { surfaceId: string; path?: string; value: unknown };
      };
      expect(m.version).toBe("v0.9");
      expect(m.updateDataModel?.surfaceId).toBe("surfA");
      expect(m.updateDataModel?.path).toBe("/");
      expect(m.updateDataModel?.value).toMatchObject({ n: 2 });
    }
  });

  it("rejects invalid contents when opted in", () => {
    const r = tryBuildLocalPatchMessagesV09({
      ...baseAction(),
      context: {
        a2uiLocalPatch: true,
        patchKind: "dataModelUpdate",
        path: "/",
        contents: [{ key: "k" }],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_contents");
  });

  it("accepts contents as a JSON string", () => {
    const r = tryBuildLocalPatchMessagesV09({
      ...baseAction(),
      name: A2UI_HOST_PATCH_V1,
      context: {
        patchKind: "dataModelUpdate",
        path: "/",
        contents: '[{"key":"x","valueNumber":1}]',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const m = r.messages[0] as {
        updateDataModel?: { value: Record<string, unknown> };
      };
      expect(m.updateDataModel?.value).toMatchObject({ x: 1 });
    }
  });
});
