import { describe, expect, it } from "vitest";
import { dispatchAutomationLine, runAutomationCommand, type AutomationKernelContext } from "./router";

function ctx(): AutomationKernelContext {
  return {
    getBrowserFrame: () => null,
    navigateTo: () => {},
    beginWebviewLoadWait: async () => ({ ok: true, phase: "load" }),
    waitForWebviewAdaptiveSettle: async () => ({ ok: true, phase: "fast" }),
    canGoBack: () => true,
    canGoForward: () => true,
    resolveInput: (x) => x,
    reload: () => {},
    goBack: () => {},
    goForward: () => {},
    createTab: () => {},
    switchTab: () => {},
    closeTabById: () => {},
    getTabs: () => [
      { id: 1, publicId: 24532, title: "One", url: "https://a.example" },
      { id: 2, publicId: 15638, title: "Two", url: "https://b.example" },
    ],
    getActiveTabId: () => 1,
    applyZoom: () => {},
    getZoomLevel: () => 0,
    takeScreenshot: async () => {},
    createSession: (headless) => ({ id: "s_test", headless }),
    switchSession: () => true,
    killSession: () => true,
    hasSession: (sessionId) => sessionId === "s_test",
    showAutomationClickFx: () => {},
  };
}

describe("automation router", () => {
  it("dispatches list tabs info", async () => {
    const r = await dispatchAutomationLine("list tabs in session s_test", ctx());
    expect(r.success).toBe(true);
    expect(String(r.message)).toContain("| TabId | Active | Title | URL |");
    expect(String(r.message)).toContain("24532");
  });

  it("parses JSON command", async () => {
    const r = await dispatchAutomationLine(
      '{"kind":"info","op":"list_tabs","sessionId":"s_test"}',
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(r.kind).toBe("info");
  });

  it("returns failure for unknown command", async () => {
    const r = await dispatchAutomationLine("abracadabra", ctx());
    expect(r.success).toBe(false);
  });

  it("reload registers load wait before reload()", async () => {
    const order: string[] = [];
    const c = ctx();
    c.beginWebviewLoadWait = async () => {
      order.push("wait");
      return { ok: true, phase: "load" };
    };
    c.reload = () => {
      order.push("reload");
    };
    const r = await runAutomationCommand({ kind: "action", op: "reload", sessionId: "s_test" }, c);
    expect(r.success).toBe(true);
    expect(order).toEqual(["wait", "reload"]);
  });

  it("goto registers load wait before navigateTo", async () => {
    const order: string[] = [];
    const c = ctx();
    c.beginWebviewLoadWait = async () => {
      order.push("wait");
      return { ok: true, phase: "load" };
    };
    c.navigateTo = () => {
      order.push("nav");
    };
    const r = await runAutomationCommand(
      { kind: "action", op: "goto", url: "https://example.com", sessionId: "s_test" },
      c,
    );
    expect(r.success).toBe(true);
    expect(order).toEqual(["wait", "nav"]);
    expect(String(r.message)).toContain("Loaded");
  });

  it("switches tab by public id", async () => {
    let switched = 0;
    const c = ctx();
    c.switchTab = (id) => {
      switched = id;
    };
    const r = await runAutomationCommand(
      { kind: "action", op: "switch_tab", tabId: 15638 },
      c,
    );
    expect(r.success).toBe(false);
    const ok = await runAutomationCommand(
      { kind: "action", op: "switch_tab", tabId: 15638, sessionId: "s_test" },
      c,
    );
    expect(ok.success).toBe(true);
    expect(switched).toBe(2);
  });
});
