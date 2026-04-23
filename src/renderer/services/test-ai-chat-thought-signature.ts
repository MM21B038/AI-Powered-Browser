import { describe, expect, it } from "vitest";
import { buildOpenAiMessagesFromChatV2 } from "./ai-chat";

describe("buildOpenAiMessagesFromChatV2 + Gemini thought_signature", () => {
  it("replays thought_signature on each function in assistant tool_calls", () => {
    const sys = "You are a test.";
    const messages = [
      { id: "u1", role: "user" as const, content: "Hi" },
      {
        id: "a1",
        role: "assistant" as const,
        content: "",
      },
      {
        id: "t1",
        role: "tool" as const,
        toolCallId: "call_1",
        name: "flowzap_create_playground",
        content: '{"ok":true}',
        arguments: "{}",
        thoughtSignature: "sig_opaque_blob",
      },
    ];
    const oa = buildOpenAiMessagesFromChatV2(sys, messages);
    const assistantWithTools = oa.find(
      (m) => m.role === "assistant" && "tool_calls" in m && m.tool_calls,
    ) as {
      role: "assistant";
      tool_calls: Array<{ function: { thought_signature?: string; name: string } }>;
    };
    expect(assistantWithTools).toBeDefined();
    expect(assistantWithTools.tool_calls[0]?.function.thought_signature).toBe("sig_opaque_blob");
    expect(assistantWithTools.tool_calls[0]?.function.name).toBe("flowzap_create_playground");
  });
});
