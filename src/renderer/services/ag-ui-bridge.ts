/**
 * Maps local {@link ChatStreamEvent} stream to AG-UI-style event records for debugging / future UI.
 */

import { EventType } from "@ag-ui/core";
import type { ChatStreamEvent } from "./ai-chat";

export type AgUiEventRecord = {
  type: string;
  [key: string]: unknown;
};

let runSeq = 0;

function nextRunId(): string {
  runSeq += 1;
  return `run_${Date.now()}_${runSeq}`;
}

/**
 * Convert one chat stream event to zero or more AG-UI-shaped event payloads (plain objects).
 */
export function chatStreamEventToAgUiEvents(
  e: ChatStreamEvent,
  ctx: { runId: string; messageId: string },
): AgUiEventRecord[] {
  switch (e.type) {
    case "stream_start":
      return [
        { type: EventType.RUN_STARTED, threadId: ctx.runId, runId: ctx.runId },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: ctx.messageId,
          role: "assistant",
        },
      ];
    case "assistant_delta":
      return [
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: ctx.messageId,
          delta: e.text,
        },
      ];
    case "thinking":
      return [
        {
          type: EventType.THINKING_TEXT_MESSAGE_CONTENT,
          messageId: `${ctx.messageId}_think`,
          delta: e.text,
        },
      ];
    case "tool_start":
      return [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: e.toolCallId,
          toolCallName: e.name,
        },
      ];
    case "tool_end":
      return [
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: e.toolCallId,
          content: e.resultPreview,
        },
      ];
    case "error":
      return [
        {
          type: EventType.RUN_ERROR,
          message: e.message,
          ...(e.httpStatus != null ? { httpStatus: e.httpStatus } : {}),
        },
      ];
    case "done":
      return [
        { type: EventType.TEXT_MESSAGE_END, messageId: ctx.messageId },
        { type: EventType.RUN_FINISHED, runId: ctx.runId },
      ];
    case "round_end":
      return [];
    default:
      return [];
  }
}

export function createAgUiRunContext(): { runId: string; messageId: string } {
  const runId = nextRunId();
  return { runId, messageId: `msg_${runId}` };
}
