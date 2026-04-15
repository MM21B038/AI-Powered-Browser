import { describe, expect, it, vi } from "vitest";
import {
  handleA2uiHostLocalAction,
  isA2uiHostReservedActionName,
} from "./a2ui-host-local-actions";
import type { A2uiUserActionPayload } from "./format-a2ui-user-action";

const baseUa = (over: Partial<A2uiUserActionPayload> = {}): A2uiUserActionPayload => ({
  name: "noop",
  surfaceId: "surf1",
  sourceComponentId: "c1",
  timestamp: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("isA2uiHostReservedActionName", () => {
  it("is true for host.openUrl", () => {
    expect(isA2uiHostReservedActionName("host.openUrl")).toBe(true);
    expect(isA2uiHostReservedActionName("a2ui.host.openUrl")).toBe(true);
  });
  it("is false for normal agent actions", () => {
    expect(isA2uiHostReservedActionName("addTask")).toBe(false);
  });
});

describe("handleA2uiHostLocalAction", () => {
  it("returns handled false for unknown names", async () => {
    const r = await handleA2uiHostLocalAction(baseUa({ name: "save" }));
    expect(r).toEqual({ handled: false });
  });

  it("rejects missing url", async () => {
    const r = await handleA2uiHostLocalAction(
      baseUa({ name: "host.openUrl", context: {} }),
    );
    expect(r).toMatchObject({
      handled: true,
      kind: "openUrl",
      success: false,
    });
  });

  it("calls electron openExternal when available", async () => {
    const openExternal = vi.fn().mockResolvedValue({ success: true });
    const g = globalThis as unknown as {
      electronAPI?: { openExternal?: typeof openExternal };
    };
    const prev = g.electronAPI;
    g.electronAPI = { openExternal };
    try {
      const r = await handleA2uiHostLocalAction(
        baseUa({
          name: "host.openUrl",
          context: { url: "https://a2ui.org/about" },
        }),
      );
      expect(r).toEqual({ handled: true, kind: "openUrl", success: true });
      expect(openExternal).toHaveBeenCalledWith("https://a2ui.org/about");
    } finally {
      g.electronAPI = prev;
    }
  });

  it("reports failure when main process rejects", async () => {
    const openExternal = vi.fn().mockResolvedValue({
      success: false,
      error: "blocked",
    });
    const g = globalThis as unknown as {
      electronAPI?: { openExternal?: typeof openExternal };
    };
    const prev = g.electronAPI;
    g.electronAPI = { openExternal };
    try {
      const r = await handleA2uiHostLocalAction(
        baseUa({
          name: "host.openUrl",
          context: { url: "https://example.com" },
        }),
      );
      expect(r).toMatchObject({
        handled: true,
        kind: "openUrl",
        success: false,
        message: "blocked",
      });
    } finally {
      g.electronAPI = prev;
    }
  });
});
