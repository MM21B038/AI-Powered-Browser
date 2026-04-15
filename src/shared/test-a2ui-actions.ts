import { describe, expect, it } from "vitest";
import {
  extractUserActionFromClientMessage,
  formatA2uiUserActionMessageLine,
  planA2uiActionFollowUp,
} from "./format-a2ui-user-action";

describe("formatA2uiUserActionMessageLine", () => {
  it("formats base fields without context", () => {
    expect(
      formatA2uiUserActionMessageLine({
        name: "save",
        surfaceId: "surf1",
        sourceComponentId: "btn1",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(
      "[A2UI action] name=save surface=surf1 source=btn1",
    );
  });

  it("appends compact JSON for non-empty context", () => {
    expect(
      formatA2uiUserActionMessageLine({
        name: "go",
        surfaceId: "main",
        sourceComponentId: "x",
        timestamp: "2026-01-01T00:00:00.000Z",
        context: { k: 1, nested: { a: true } },
      }),
    ).toBe(
      '[A2UI action] name=go surface=main source=x context={"k":1,"nested":{"a":true}}',
    );
  });
});

describe("extractUserActionFromClientMessage", () => {
  it("returns userAction when valid", () => {
    const ua = {
      name: "a",
      surfaceId: "s",
      sourceComponentId: "c",
      timestamp: "t",
    };
    expect(extractUserActionFromClientMessage({ userAction: ua })).toEqual(ua);
  });

  it("returns undefined when userAction missing or malformed", () => {
    expect(extractUserActionFromClientMessage({})).toBeUndefined();
    expect(
      extractUserActionFromClientMessage({
        userAction: { name: "x" },
      }),
    ).toBeUndefined();
  });
});

describe("planA2uiActionFollowUp", () => {
  it("off never appends or sends", () => {
    expect(planA2uiActionFollowUp("off", false)).toEqual({
      appendComposer: false,
      autoSend: false,
      useBusyComposerToast: false,
    });
    expect(planA2uiActionFollowUp("off", true)).toEqual({
      appendComposer: false,
      autoSend: false,
      useBusyComposerToast: false,
    });
  });

  it("append always appends, never auto-sends", () => {
    expect(planA2uiActionFollowUp("append", false)).toEqual({
      appendComposer: true,
      autoSend: false,
      useBusyComposerToast: false,
    });
    expect(planA2uiActionFollowUp("append", true)).toEqual({
      appendComposer: true,
      autoSend: false,
      useBusyComposerToast: false,
    });
  });

  it("send auto-sends when idle, falls back when busy", () => {
    expect(planA2uiActionFollowUp("send", false)).toEqual({
      appendComposer: false,
      autoSend: true,
      useBusyComposerToast: false,
    });
    expect(planA2uiActionFollowUp("send", true)).toEqual({
      appendComposer: true,
      autoSend: false,
      useBusyComposerToast: true,
    });
  });
});
