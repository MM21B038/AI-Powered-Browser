import { describe, expect, it } from "vitest";
import { dispatchAutomationLine, runAutomationCommand, type AutomationKernelContext } from "./router";

function ctx(): AutomationKernelContext {
  return {
    getBrowserFrame: () => null,
    navigateTo: () => {},
    resolveInput: (x) => x,
    reload: () => {},
    goBack: () => {},
    goForward: () => {},
    createTab: () => {},
    switchTab: () => {},
    closeTabById: () => {},
    getTabs: () => [
      { id: 1, title: "One", url: "https://a.example" },
      { id: 2, title: "Two", url: "https://b.example" },
    ],
    getActiveTabId: () => 1,
    applyZoom: () => {},
    getZoomLevel: () => 0,
    takeScreenshot: async () => {},
  };
}

describe("automation router", () => {
  it("dispatches list tabs info", async () => {
    const r = await dispatchAutomationLine("list tabs", ctx());
    expect(r.success).toBe(true);
    expect(String(r.message)).toContain("**1**");
  });

  it("parses JSON command", async () => {
    const r = await dispatchAutomationLine(
      '{"kind":"info","op":"list_tabs"}',
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(r.kind).toBe("info");
  });

  it("returns failure for unknown command", async () => {
    const r = await dispatchAutomationLine("abracadabra", ctx());
    expect(r.success).toBe(false);
  });

  it("switches tab by id", async () => {
    let switched = 0;
    const c = ctx();
    c.switchTab = (id) => {
      switched = id;
    };
    const r = await runAutomationCommand(
      { kind: "action", op: "switch_tab", tabId: 2 },
      c,
    );
    expect(r.success).toBe(true);
    expect(switched).toBe(2);
  });
});
