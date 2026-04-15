import { describe, expect, it } from "vitest";
import {
  A2UI_HOST_PATCH_V1,
  isA2uiLocalPatchOptIn,
  tryBuildLocalPatchMessages,
} from "./a2ui-local-action-patch";
import type { A2uiUserActionPayload } from "./format-a2ui-user-action";

const baseUa = (): A2uiUserActionPayload => ({
  name: "noop",
  surfaceId: "surfA",
  sourceComponentId: "btn1",
  timestamp: "2026-01-01T00:00:00.000Z",
});

describe("isA2uiLocalPatchOptIn", () => {
  it("is true for host.patch.v1", () => {
    expect(
      isA2uiLocalPatchOptIn({ ...baseUa(), name: A2UI_HOST_PATCH_V1 }),
    ).toBe(true);
  });

  it("is true when context.a2uiLocalPatch is true", () => {
    expect(
      isA2uiLocalPatchOptIn({
        ...baseUa(),
        context: { a2uiLocalPatch: true },
      }),
    ).toBe(true);
  });

  it("is false without marker", () => {
    expect(isA2uiLocalPatchOptIn(baseUa())).toBe(false);
  });
});

describe("tryBuildLocalPatchMessages", () => {
  it("returns not_opt_in when not opted in", () => {
    const r = tryBuildLocalPatchMessages(baseUa());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_opt_in");
  });

  it("builds validated dataModelUpdate for host.patch.v1", () => {
    const r = tryBuildLocalPatchMessages({
      ...baseUa(),
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
        dataModelUpdate?: { surfaceId: string; path?: string; contents: unknown[] };
      };
      expect(m.dataModelUpdate?.surfaceId).toBe("surfA");
      expect(m.dataModelUpdate?.path).toBe("/");
      expect(m.dataModelUpdate?.contents[0]).toMatchObject({
        key: "n",
        valueNumber: 2,
      });
    }
  });

  it("rejects invalid contents when opted in", () => {
    const r = tryBuildLocalPatchMessages({
      ...baseUa(),
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

  it("accepts contents as a JSON string (v0.8 button context)", () => {
    const r = tryBuildLocalPatchMessages({
      ...baseUa(),
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
        dataModelUpdate?: { contents: { key: string; valueNumber?: number }[] };
      };
      expect(m.dataModelUpdate?.contents[0]).toMatchObject({
        key: "x",
        valueNumber: 1,
      });
    }
  });
});
