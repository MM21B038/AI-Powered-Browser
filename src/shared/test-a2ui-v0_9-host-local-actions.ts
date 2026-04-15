import { describe, expect, it, vi } from "vitest";
import { handleA2uiV09HostLocalAction } from "./a2ui-v0_9-host-local-actions";

describe("handleA2uiV09HostLocalAction", () => {
  it("handles host.openUrl with openExternal", async () => {
    const openExternal = vi.fn(async () => ({ success: true }));
    (globalThis as any).electronAPI = { openExternal };
    const r = await handleA2uiV09HostLocalAction({
      name: "host.openUrl",
      surfaceId: "s",
      sourceComponentId: "btn",
      timestamp: new Date().toISOString(),
      context: { url: "https://example.com" },
    } as any);
    expect(r.handled).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://example.com");
  });
});

