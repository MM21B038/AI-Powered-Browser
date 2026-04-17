import { describe, expect, it } from "vitest";
import { buildOpenAiMessagesFromChatV2 } from "./ai-chat";
import type { ChatMessageV2 } from "../chat/conversation-store";

describe("buildOpenAiMessagesFromChatV2 apiError assistant rows", () => {
  it("sends assistantPrefix only, not polluted content, when apiError is set", () => {
    const messages: ChatMessageV2[] = [
      {
        id: "u1",
        role: "user",
        content: "hi",
      },
      {
        id: "a1",
        role: "assistant",
        content:
          "hello\n\n---\n**Request failed** (polluted legacy content that must not be replayed)",
        apiError: {
          display: {
            severity: "error" as const,
            title: "Error title",
            detail: "Detail line",
          },
          assistantPrefix: "hello",
        },
      },
    ];
    const oa = buildOpenAiMessagesFromChatV2("You are helpful.", messages);
    expect(oa[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(oa[1]).toEqual({ role: "user", content: "hi" });
    expect(oa[2]).toEqual({ role: "assistant", content: "hello" });
  });

  it("uses stub when apiError has no assistantPrefix even if content is polluted", () => {
    const messages: ChatMessageV2[] = [
      {
        id: "u1",
        role: "user",
        content: "x",
      },
      {
        id: "a1",
        role: "assistant",
        content: "HUGE_POLLUTED_ERROR_BLOB",
        apiError: {
          display: {
            severity: "error" as const,
            title: "T",
            detail: "D",
          },
        },
      },
    ];
    const oa = buildOpenAiMessagesFromChatV2("sys", messages);
    expect(oa[2]).toEqual({
      role: "assistant",
      content: "Previous request did not complete.",
    });
  });
});
