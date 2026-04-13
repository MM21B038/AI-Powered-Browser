import { describe, expect, it } from "vitest";
import { EventType } from "@ag-ui/core";
import { chatStreamEventToAgUiEvents, createAgUiRunContext } from "./ag-ui-bridge";

describe("chatStreamEventToAgUiEvents", () => {
  it("maps assistant_delta to text content", () => {
    const ctx = createAgUiRunContext();
    const evs = chatStreamEventToAgUiEvents(
      { type: "assistant_delta", text: "hi" },
      ctx,
    );
    expect(evs.some((e) => e.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
  });
});
