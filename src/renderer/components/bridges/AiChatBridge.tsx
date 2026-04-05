import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  CHAT_STORAGE_KEY_V2,
  loadConversationStateV2,
  mergeChatStatePreferNewerPerScope,
  readChatBackupStateV2,
  stripAttachmentsFromState,
  createDebouncedSaveV2,
  getScopedStore,
  setScopedStore,
  createNewConversation,
  titleFromFirstLine,
  normalizeBrowserScoped,
  DEFAULT_WELCOME_BROWSER,
  type ChatMessageV2,
  type ChatScope,
  type Conversation,
  type ConversationStoreStateV2,
  type ScopedStore,
  type ChatAttachment,
} from "../../chat/conversation-store";
import {
  chatAttachmentLimitsSummary,
  fileToChatAttachment,
  validateChatAttachmentList,
} from "../../chat/chat-attachments";
import { generateMessageId } from "../../chat/conversation-ids";
import {
  loadIntelligentSettings,
  saveIntelligentSettings,
  selectedModelIdForChatScope,
  thinkingLevelForChatScope,
  BUTCHER_BUILTIN_MCP_ID,
  INTELLIGENT_BUILTIN_MCP_ID,
  mcpServerHasConnectionParams,
  mcpServerToPayload,
  type IntelligentSettingsState,
} from "../../state/session-settings-store";
import {
  MCP_BROWSER_TOOL_DEFINITIONS,
  MCP_INTELLIGENT_TOOL_DEFINITIONS,
} from "../../../shared/mcp-tool-registry";
import { getElectronApi } from "../../services/electron-api";
import {
  appendUserMessage,
  computeIntelligentToolAllowlistFromUserText,
  ensureSystemMessage,
  getIntelligentOpenAiToolNames,
  runAiChatPipeline,
  type ChatStreamEvent,
} from "../../services/ai-chat";
import {
  filterToolNameSuggestions,
  getActiveMentionQuery,
  replaceMentionAtCaret,
} from "../../chat/ai-tool-mentions";
import type { McpBridgeState } from "../../../shared/ipc-types";
import { ModelQuickPick } from "../ModelQuickPick";
import { ThinkingPicker } from "../ThinkingPicker";
import { friendlyMcpConnectionError } from "../../shared/mcp-error-messages";
import { McpIcon } from "../icons/McpIcon";
import {
  AiChatCalculatorToolRow,
  isCalculatorToolName,
} from "./AiChatCalculatorToolRow";
import { AiChatToolResultBlock } from "./ai-chat-tool-result";
import { AiChatQueryRail } from "./AiChatQueryRail";
import { AiChatApiErrorBlock } from "./AiChatApiErrorBlock";
import {
  formatChatApiErrorMessage,
  getChatApiErrorDisplay,
  type ChatApiErrorDisplay,
} from "../../services/api-error-format";
import { renderChatMarkdownToHtml } from "../../chat/chat-markdown";

const debouncedSave = createDebouncedSaveV2(200);

/** Toast + event fallback so composer feedback is visible even if one bridge is missing. */
function notifyComposerUser(message: string, durationMs = 4500): void {
  const w = window as unknown as {
    legacyBrowser?: { showToast?: (m: string, d?: number) => void };
    browserAPI?: { showToast?: (m: string, d?: number) => void };
  };
  const fn = w.legacyBrowser?.showToast ?? w.browserAPI?.showToast;
  if (typeof fn === "function") {
    try {
      fn(message, durationMs);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    window.dispatchEvent(
      new CustomEvent("legacy-toast", {
        detail: { msg: message, duration: durationMs },
      }),
    );
  } catch {
    /* ignore */
  }
  console.warn("[ai-chat]", message);
}

function lastUserMessageContent(messages: ChatMessageV2[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") return (m.content as string) || "";
  }
  return "";
}

/** Index of the user message that prompted this assistant reply (skips tool rows). */
function findUserIndexBeforeAssistant(
  messages: ChatMessageV2[],
  assistantIdx: number,
): number {
  for (let j = assistantIdx - 1; j >= 0; j--) {
    if (messages[j]?.role === "user") return j;
  }
  return -1;
}

function renderAiChatMd(md: string): string {
  return renderChatMarkdownToHtml(md, { wrapperClass: "ai-chat-md" });
}

const COMPOSER_MIN_LINES = 2;
const COMPOSER_MAX_LINES = 10;

function formatThinkingDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return "<1s";
  if (ms < 60000) {
    const s = ms / 1000;
    return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
  }
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function IconChevronDown(): ReactElement {
  return (
    <svg
      className="ai-chat-thinking-chev-svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AiChatThoughtBlock({
  thinking,
  durationMs,
}: {
  thinking: string;
  durationMs?: number;
}): ReactElement {
  const summary =
    durationMs != null && Number.isFinite(durationMs) && durationMs >= 0
      ? `Thinking · ${formatThinkingDuration(durationMs)}`
      : "Thinking";
  return (
    <details className="ai-chat-thinking ai-chat-thinking--done">
      <summary className="ai-chat-thinking-done-summary">
        <span className="ai-chat-thinking-done-label">{summary}</span>
        <IconChevronDown />
      </summary>
      <div className="ai-chat-thinking-stream-body ai-chat-thinking-stream-body--faded">
        {thinking}
      </div>
    </details>
  );
}

function AiChatThinkingLive({
  text,
  open,
  onOpenChange,
}: {
  text: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}): ReactElement {
  const streamBodyRef = useRef<HTMLDivElement>(null);
  const stickThinkingBodyToBottomRef = useRef(true);

  const updateStickFromThinkingBodyScroll = useCallback(() => {
    const el = streamBodyRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const threshold = Math.max(48, el.clientHeight * 0.1);
    stickThinkingBodyToBottomRef.current = dist <= threshold;
  }, []);

  useEffect(() => {
    if (open) stickThinkingBodyToBottomRef.current = true;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (!stickThinkingBodyToBottomRef.current) return;
    const el = streamBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text, open]);

  return (
    <details
      className="ai-chat-thinking ai-chat-thinking--live"
      open={open}
      onToggle={(e) => {
        onOpenChange(e.currentTarget.open);
      }}
    >
      <summary className="ai-chat-thinking-live-summary">
        <span className="ai-chat-thinking-live-label">Thinking</span>
        <IconChevronDown />
      </summary>
      <div
        ref={streamBodyRef}
        className="ai-chat-thinking-stream-body ai-chat-thinking-stream-body--faded"
        onScroll={updateStickFromThinkingBodyScroll}
      >
        {text}
      </div>
    </details>
  );
}

function AiChatToolRunning({ name }: { name: string }): ReactElement {
  return (
    <div className="ai-chat-tool-running">
      <span className="ai-chat-tool-running__spinner" aria-hidden />
      <span className="ai-chat-tool-running__name">{name}</span>
    </div>
  );
}

function IconCopy(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconEdit(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconRetry(): ReactElement {
  return (
    <svg
      className="ai-chat-retry-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-8" />
      <path d="M21 3v7h-7" />
    </svg>
  );
}

function IconSendPlane(): ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function IconClearChat(): ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 4H13M5 4V2.5C5 2 5.5 1.5 6 1.5H9C9.5 1.5 10 2 10 2.5V4M12 4L11.5 12.5C11.5 13 11 13.5 10.5 13.5H4.5C4 13.5 3.5 13 3.5 12.5L3 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAttachFiles(): ReactElement {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21.44 11.05 12.25 20.24a5.98 5.98 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2.67 2.67 0 0 1-3.77-3.77l8.49-8.48" />
    </svg>
  );
}

function useIntelligentWorkspaceShell(): boolean {
  const [v, setV] = useState(
    () =>
      document
        .getElementById("appContainer")
        ?.getAttribute("data-shell-workspace") === "intelligent",
  );
  useEffect(() => {
    const el = document.getElementById("appContainer");
    if (!el) return;
    const sync = () =>
      setV(el.getAttribute("data-shell-workspace") === "intelligent");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, {
      attributes: true,
      attributeFilter: ["data-shell-workspace"],
    });
    window.addEventListener("shell-workspace-changed", sync);
    return () => {
      mo.disconnect();
      window.removeEventListener("shell-workspace-changed", sync);
    };
  }, []);
  return v;
}

async function copyPlainTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    window.legacyBrowser?.showToast?.("Copied");
  } catch {
    /* ignore */
  }
}

function AiChatMsgFooter({
  align,
  plainText,
  onEdit,
  showEdit,
  editDisabled,
  onRetry,
  retryDisabled,
}: {
  align: "start" | "end";
  plainText: string;
  onEdit?: () => void;
  showEdit?: boolean;
  editDisabled?: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
}): ReactElement {
  return (
    <div className={`ai-chat-msg-footer ai-chat-msg-footer--${align}`}>
      <button
        type="button"
        className="ai-chat-msg-icon-btn"
        aria-label="Copy message"
        onClick={() => void copyPlainTextToClipboard(plainText)}
      >
        <IconCopy />
      </button>
      {onRetry ? (
        <button
          type="button"
          className="ai-chat-msg-icon-btn ai-chat-msg-icon-btn--retry"
          aria-label="Retry — resend the prompt and replace this reply"
          disabled={retryDisabled}
          onClick={() => onRetry()}
        >
          <IconRetry />
        </button>
      ) : null}
      {showEdit && onEdit ? (
        <button
          type="button"
          className="ai-chat-msg-icon-btn"
          aria-label="Edit message"
          disabled={editDisabled}
          onClick={onEdit}
        >
          <IconEdit />
        </button>
      ) : null}
    </div>
  );
}

function SlideToggle({
  on,
  onToggle,
  ariaLabel,
}: {
  on: boolean;
  onToggle: () => void;
  ariaLabel: string;
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`ai-chat-slide-toggle${on ? " ai-chat-slide-toggle--on" : ""}`}
      onClick={onToggle}
    >
      <span className="ai-chat-slide-toggle__track" aria-hidden>
        <span className="ai-chat-slide-toggle__thumb" />
      </span>
    </button>
  );
}

function scopeFromDom(): ChatScope {
  const w = document
    .getElementById("appContainer")
    ?.getAttribute("data-shell-workspace");
  return w === "intelligent" ? "intelligent" : "browser";
}

/** One agent round that ended with tool execution (thinking captured before those tools). */
type PipelineRoundPersisted = {
  thinking: string;
  tools: ChatMessageV2[];
};

type PipelineResult = {
  /** Ordered messages to append after `stored` — interleaved assistant(thinking) + tools per round, then final assistant. */
  messagesToAppend: ChatMessageV2[];
};

/** Ordered streaming UI segments (live assistant message while pipeline runs). */
type StreamSegment =
  | { kind: "thinking"; text: string; live: boolean }
  | { kind: "tool_running"; name: string; toolCallId: string }
  | {
      kind: "tool_done";
      name: string;
      toolCallId: string;
      arguments: string;
      content: string;
    }
  | { kind: "api_error"; display: ChatApiErrorDisplay }
  | { kind: "text"; plain: string };

/** Plain text for copy / footer for the in-flight stream (text + API error segments). */
function streamSegmentsToPlainText(segments: StreamSegment[]): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.kind === "text" && s.plain.trim()) parts.push(s.plain.trim());
    if (s.kind === "api_error") {
      const { title, detail } = s.display;
      parts.push([title, detail].filter((x) => x.trim()).join("\n\n"));
    }
  }
  return parts.join("\n\n").trim();
}

function pushSegmentSnapshot(
  segments: StreamSegment[],
  onSegmentUpdate: (segments: StreamSegment[]) => void,
): void {
  onSegmentUpdate(segments.map((s) => ({ ...s })));
}

function closeLiveThinkingSegments(segments: StreamSegment[]): StreamSegment[] {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s?.kind === "thinking" && s.live) {
      return [
        ...segments.slice(0, i),
        { kind: "thinking", text: s.text, live: false },
        ...segments.slice(i + 1),
      ];
    }
  }
  return segments;
}

/** Pin-to-bottom scroll: ignore live thinking token deltas (same as legacy `streamThinking` omission). */
function streamScrollSignature(segments: StreamSegment[]): string {
  return segments
    .map((s) => {
      if (s.kind === "thinking" && s.live) return "thinkL";
      if (s.kind === "thinking") return `thinkD:${s.text.length}`;
      if (s.kind === "text") return `txt:${s.plain.length}`;
      if (s.kind === "api_error")
        return `api:${s.display.severity}:${s.display.title.length}:${s.display.detail.length}`;
      if (s.kind === "tool_running") return `run:${s.toolCallId}`;
      return `done:${s.name}:${s.toolCallId}`;
    })
    .join("|");
}

/**
 * Single persistence path: interleaved thinking from `rounds`, every tool in `toolMsgs`
 * exactly once (orphan tools appended if `rounds` slices drift), then final assistant.
 */
function buildPersistedMessagesRobust(
  rounds: PipelineRoundPersisted[],
  toolMsgs: ChatMessageV2[],
  finalRoundThinking: string,
  assistantBuf: string,
  thinkingBufAll: string,
  apiErrorPersist: {
    display: ChatApiErrorDisplay;
    assistantPrefix: string;
  } | null,
): ChatMessageV2[] {
  const out: ChatMessageV2[] = [];
  let consumedFromFlat = 0;

  for (const r of rounds) {
    const th = r.thinking.trim();
    if (th) {
      out.push({
        id: generateMessageId(),
        role: "assistant",
        content: "",
        thinking: th,
      });
    }
    for (const t of r.tools) {
      out.push(t);
      consumedFromFlat++;
    }
  }

  while (consumedFromFlat < toolMsgs.length) {
    out.push(toolMsgs[consumedFromFlat]!);
    consumedFromFlat++;
  }

  const outText = assistantBuf.trim();
  const ft = finalRoundThinking.trim();

  if (!outText && !ft) {
    if (thinkingBufAll.trim() && out.length === 0) {
      out.push({
        id: generateMessageId(),
        role: "assistant",
        content: "",
        thinking: thinkingBufAll.trim(),
      });
    }
    return out;
  }

  out.push({
    id: generateMessageId(),
    role: "assistant",
    content: outText,
    ...(apiErrorPersist
      ? {
          apiError: {
            display: apiErrorPersist.display,
            ...(apiErrorPersist.assistantPrefix.trim()
              ? { assistantPrefix: apiErrorPersist.assistantPrefix.trim() }
              : {}),
          },
        }
      : {}),
    ...(ft ? { thinking: ft } : {}),
  });
  return out;
}

async function runChatPipelineRound(
  scope: ChatScope,
  api: NonNullable<ReturnType<typeof getElectronApi>>,
  storedMessages: ChatMessageV2[],
  onSegmentUpdate: (segments: StreamSegment[]) => void,
  toolAllowlist?: string[] | null,
  onNewThinkingRound?: () => void,
): Promise<PipelineResult> {
  const toolMsgs: ChatMessageV2[] = [];
  const rounds: PipelineRoundPersisted[] = [];
  let toolCountAtRoundStart = 0;
  /** Thinking for the stream segment before the next `round_end` or final `done`. */
  let roundThinking = "";
  /** Concatenated thinking for fallback persistence (never dropped). */
  let thinkingBufAll = "";
  let assistantBuf = "";
  let segments: StreamSegment[] = [];
  /** Preamble strip + assistantBuf reset at most once per SSE stream (first tool in batch). */
  let preambleClearedForStream = false;
  let apiErrorPersist: {
    display: ChatApiErrorDisplay;
    assistantPrefix: string;
  } | null = null;

  /** Replace trailing text segment(s) with full `assistantBuf` (used on done); keep `api_error` segments. */
  const flushAssistantBufToTextTail = () => {
    while (
      segments.length > 0 &&
      segments[segments.length - 1]?.kind === "text"
    ) {
      segments = segments.slice(0, -1);
    }
    const last = segments[segments.length - 1];
    if (last?.kind === "api_error") {
      pushSegmentSnapshot(segments, onSegmentUpdate);
      return;
    }
    const tail = assistantBuf.trim();
    if (tail) {
      segments = [...segments, { kind: "text", plain: tail }];
    }
    pushSegmentSnapshot(segments, onSegmentUpdate);
  };

  const onEvent = (e: ChatStreamEvent) => {
    switch (e.type) {
      case "stream_start":
        preambleClearedForStream = false;
        break;
      case "assistant_delta": {
        if (!e.text) break;
        assistantBuf += e.text;
        const last = segments[segments.length - 1];
        if (last?.kind === "text") {
          segments = [
            ...segments.slice(0, -1),
            { kind: "text", plain: last.plain + e.text },
          ];
        } else {
          segments = [...segments, { kind: "text", plain: e.text }];
        }
        pushSegmentSnapshot(segments, onSegmentUpdate);
        break;
      }
      case "thinking": {
        roundThinking += e.text;
        thinkingBufAll += e.text;
        const last = segments[segments.length - 1];
        if (last?.kind === "thinking" && last.live) {
          segments = [
            ...segments.slice(0, -1),
            { kind: "thinking", text: last.text + e.text, live: true },
          ];
        } else {
          segments = [
            ...segments,
            { kind: "thinking", text: e.text, live: true },
          ];
          onNewThinkingRound?.();
        }
        pushSegmentSnapshot(segments, onSegmentUpdate);
        break;
      }
      case "tool_start": {
        segments = closeLiveThinkingSegments(segments);
        const running: StreamSegment = {
          kind: "tool_running",
          name: e.name,
          toolCallId: e.toolCallId,
        };
        if (preambleClearedForStream) {
          segments = [...segments, running];
          pushSegmentSnapshot(segments, onSegmentUpdate);
          break;
        }
        preambleClearedForStream = true;
        while (
          segments.length > 0 &&
          segments[segments.length - 1]?.kind === "text"
        ) {
          segments = segments.slice(0, -1);
        }
        assistantBuf = "";
        segments = [...segments, running];
        pushSegmentSnapshot(segments, onSegmentUpdate);
        break;
      }
      case "tool_end": {
        toolMsgs.push({
          id: generateMessageId(),
          role: "tool",
          toolCallId: e.toolCallId,
          name: e.name,
          content: e.fullResult,
          arguments: e.arguments,
        });
        let idx = -1;
        for (let j = segments.length - 1; j >= 0; j--) {
          const s = segments[j];
          if (s?.kind === "tool_running" && s.toolCallId === e.toolCallId) {
            idx = j;
            break;
          }
        }
        if (idx >= 0) {
          segments = [
            ...segments.slice(0, idx),
            {
              kind: "tool_done",
              name: e.name,
              toolCallId: e.toolCallId,
              arguments: e.arguments,
              content: e.fullResult,
            },
            ...segments.slice(idx + 1),
          ];
        }
        pushSegmentSnapshot(segments, onSegmentUpdate);
        break;
      }
      case "round_end": {
        const toolsThisRound = toolMsgs.slice(toolCountAtRoundStart);
        rounds.push({ thinking: roundThinking, tools: toolsThisRound });
        toolCountAtRoundStart = toolMsgs.length;
        roundThinking = "";
        break;
      }
      case "error": {
        segments = closeLiveThinkingSegments(segments);
        const prior = assistantBuf;
        const msg = e.message;
        assistantBuf += (prior.trim() ? "\n\n" : "") + msg;
        const display = getChatApiErrorDisplay(msg, e.httpStatus);
        apiErrorPersist = {
          display,
          assistantPrefix: prior.trim(),
        };
        let i = segments.length;
        while (i > 0 && segments[i - 1]?.kind === "text") i--;
        segments = segments.slice(0, i);
        if (prior.trim()) {
          segments = [...segments, { kind: "text", plain: prior.trim() }];
        }
        segments = [...segments, { kind: "api_error", display }];
        pushSegmentSnapshot(segments, onSegmentUpdate);
        break;
      }
      case "done":
        segments = closeLiveThinkingSegments(segments);
        flushAssistantBufToTextTail();
        break;
      default: {
        const _never: never = e;
        void _never;
      }
    }
  };

  try {
    await runAiChatPipeline({
      scope,
      settings: loadIntelligentSettings(),
      api,
      messages: ensureSystemMessage(storedMessages, scope),
      onEvent,
      toolAllowlist:
        scope === "intelligent" && toolAllowlist != null && toolAllowlist.length > 0
          ? toolAllowlist
          : null,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    onEvent({
      type: "error",
      message: formatChatApiErrorMessage(raw),
    });
    onEvent({ type: "done" });
  }

  const messagesToAppend = buildPersistedMessagesRobust(
    rounds,
    toolMsgs,
    roundThinking,
    assistantBuf,
    thinkingBufAll,
    apiErrorPersist,
  );
  return { messagesToAppend };
}

function AiChatPanel(): ReactElement {
  const intelligentWorkspaceShell = useIntelligentWorkspaceShell();
  const api = getElectronApi();
  const [scope, setScope] = useState<ChatScope>(() => scopeFromDom());
  const [store, setStore] = useState<ConversationStoreStateV2>(() =>
    loadConversationStateV2(),
  );
  /** Latest chat store for synchronous persist on `pagehide` / unload (debounce may not fire in time). */
  const chatStorePersistRef = useRef(store);
  const [settings, setSettings] = useState<IntelligentSettingsState>(() =>
    loadIntelligentSettings(),
  );
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ChatAttachment[]>([]);
  const composerAttachmentsRef = useRef<ChatAttachment[]>([]);
  composerAttachmentsRef.current = composerAttachments;
  const composerAttachmentInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([]);
  /** Conversation id for the in-flight pipeline stream (UI only; keeps stream under the right thread when switching chats). */
  const [streamingConversationId, setStreamingConversationId] = useState<
    string | null
  >(null);
  /** Live streaming thinking `<details>`; reset closed on each new send / regenerate. */
  const [thinkingLiveOpen, setThinkingLiveOpen] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpBridge, setMcpBridge] = useState<McpBridgeState | null>(null);
  const [butcherToolsExpanded, setButcherToolsExpanded] = useState(false);
  const [intelligentToolsExpanded, setIntelligentToolsExpanded] = useState(false);
  const [expandedMcpIds, setExpandedMcpIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [externalToolsByServer, setExternalToolsByServer] = useState<
    Record<
      string,
      {
        status: "idle" | "loading" | "ok" | "err";
        tools: Array<{ name: string; description?: string }>;
        error?: string;
      }
    >
  >({});
  const [editModal, setEditModal] = useState<{
    messageId: string;
    text: string;
  } | null>(null);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{
    id: string;
    title: string;
  } | null>(null);
  /** Assistant message id currently playing the “retry” exit animation. */
  const [retryExitAssistantId, setRetryExitAssistantId] = useState<string | null>(
    null,
  );
  const retryRunningRef = useRef(false);
  const thinkingStartRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  /** When false, streaming updates must not reset scroll (user scrolled up to read). */
  const stickMessagesToBottomRef = useRef(true);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const userEditTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [intelligentToolNames, setIntelligentToolNames] = useState<string[]>(
    [],
  );
  const [composerCaret, setComposerCaret] = useState(0);
  const [mentionSuppress, setMentionSuppress] = useState(false);
  const toolMentionListId = useId();
  const prevMcpModalOpenRef = useRef(false);

  const adjustComposerHeight = useCallback(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight);
    const fontSize = parseFloat(cs.fontSize) || 12;
    const line =
      Number.isFinite(lineHeight) && lineHeight > 0
        ? lineHeight
        : fontSize * 1.45;
    const padY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const minH = line * COMPOSER_MIN_LINES + padY;
    const maxH = line * COMPOSER_MAX_LINES + padY;
    el.style.height = "auto";
    const sh = el.scrollHeight;
    const next = Math.min(Math.max(sh, minH), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = sh > maxH ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    adjustComposerHeight();
  }, [input, adjustComposerHeight]);

  useEffect(() => {
    const onAppend = (e: Event) => {
      const t = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof t !== "string" || !t.trim()) return;
      setInput((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${t.trim()}` : t.trim(),
      );
      queueMicrotask(() => {
        const el = composerTextareaRef.current;
        el?.focus();
        if (el)
          setComposerCaret(el.selectionStart ?? el.value.length);
        adjustComposerHeight();
      });
    };
    window.addEventListener(
      "ai-chat-append-composer",
      onAppend as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ai-chat-append-composer",
        onAppend as EventListener,
      );
  }, [adjustComposerHeight]);

  useEffect(() => {
    const onWs = () => setScope(scopeFromDom());
    window.addEventListener("shell-workspace-changed", onWs);
    return () => window.removeEventListener("shell-workspace-changed", onWs);
  }, []);

  useEffect(() => {
    if (!api) return;
    void api.mcpBridgeGetState().then(setMcpBridge);
  }, [api, mcpModalOpen]);

  useEffect(() => {
    const onSaved = () => setSettings(loadIntelligentSettings());
    window.addEventListener("butcher-intelligent-settings-saved", onSaved);
    return () =>
      window.removeEventListener("butcher-intelligent-settings-saved", onSaved);
  }, []);

  const refreshIntelligentToolNames = useCallback(async () => {
    if (!api || scope !== "intelligent") {
      setIntelligentToolNames([]);
      return;
    }
    try {
      const names = await getIntelligentOpenAiToolNames(api, settings);
      setIntelligentToolNames(names);
    } catch {
      setIntelligentToolNames([]);
    }
  }, [api, scope, settings]);

  useEffect(() => {
    void refreshIntelligentToolNames();
  }, [refreshIntelligentToolNames]);

  useEffect(() => {
    if (prevMcpModalOpenRef.current && !mcpModalOpen && scope === "intelligent") {
      void refreshIntelligentToolNames();
    }
    prevMcpModalOpenRef.current = mcpModalOpen;
  }, [mcpModalOpen, refreshIntelligentToolNames, scope]);

  useEffect(() => {
    if (scope !== "browser") return;
    setStore((s) =>
      setScopedStore(s, "browser", normalizeBrowserScoped(s.browser)),
    );
  }, [scope]);

  useEffect(() => {
    const el = document.querySelector(".chat-title");
    if (el)
      el.textContent = scope === "browser" ? "Browser Agent" : "AI Assistant";
  }, [scope]);

  const scoped = useMemo(() => getScopedStore(store, scope), [store, scope]);

  const active = useMemo(() => {
    const a =
      scoped.conversations.find((c) => c.id === scoped.activeConversationId) ??
      null;
    if (a) return a;
    return scoped.conversations[0] ?? null;
  }, [scoped]);

  const nonSystemMessages = useMemo(
    () => active?.messages.filter((m) => m.role !== "system") ?? [],
    [active?.messages],
  );
  const streamVisible = useMemo(
    () =>
      streamSegments.length > 0 &&
      streamingConversationId != null &&
      streamingConversationId === active?.id,
    [streamSegments, streamingConversationId, active?.id],
  );
  const streamScrollSig = useMemo(
    () => streamScrollSignature(streamVisible ? streamSegments : []),
    [streamVisible, streamSegments],
  );

  const welcomeSpotlightMessageId = useMemo(() => {
    const pipelineBlocksWelcome =
      streamVisible ||
      (busy &&
        (streamingConversationId == null ||
          streamingConversationId === active?.id));
    if (pipelineBlocksWelcome) return null;
    if (nonSystemMessages.length !== 1) return null;
    const only = nonSystemMessages[0];
    return only && only.role === "assistant" ? only.id : null;
  }, [
    busy,
    nonSystemMessages,
    streamVisible,
    streamingConversationId,
    active?.id,
  ]);

  const queryRailUsers = useMemo(() => {
    if (!active?.messages) return [];
    const out: { id: string; content: string }[] = [];
    for (const m of active.messages) {
      if (m.role === "user") out.push({ id: m.id, content: m.content });
    }
    return out;
  }, [active?.messages]);

  const updateStickToBottomFromScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const threshold = Math.max(72, el.clientHeight * 0.12);
    stickMessagesToBottomRef.current = dist <= threshold;
  }, []);

  /**
   * Pin to bottom only while the user is already at the tail (avoids fighting scroll during streaming).
   * Live thinking token updates are excluded via `streamScrollSig` (stable placeholder for live blocks).
   */
  useLayoutEffect(() => {
    if (!stickMessagesToBottomRef.current) return;
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    scoped.activeConversationId,
    streamScrollSig,
    nonSystemMessages.length,
    busy,
  ]);

  useEffect(() => {
    stickMessagesToBottomRef.current = true;
  }, [scoped.activeConversationId]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    type Btn = HTMLButtonElement & { __copyTimer?: ReturnType<typeof setTimeout> };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const copyBtn = t?.closest?.("button.md-codecopy");
      if (!copyBtn || !el.contains(copyBtn)) return;
      e.preventDefault();
      e.stopPropagation();
      const block = copyBtn.closest(".md-codeblock");
      const codeEl = block?.querySelector("pre code");
      const codeText = codeEl?.textContent ?? "";
      if (!codeText) return;
      const btn = copyBtn as Btn;
      const setLabel = (label: string) => {
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.classList.toggle("md-codecopy--copied", label === "Copied");
        if (btn.__copyTimer) window.clearTimeout(btn.__copyTimer);
        btn.__copyTimer = window.setTimeout(() => {
          btn.setAttribute("aria-label", "Copy code");
          btn.title = "Copy";
          btn.classList.remove("md-codecopy--copied");
        }, 1200);
      };
      void navigator.clipboard.writeText(codeText).then(
        () => setLabel("Copied"),
        () => {
          try {
            const ta = document.createElement("textarea");
            ta.value = codeText;
            ta.setAttribute("readonly", "true");
            ta.style.position = "fixed";
            ta.style.top = "-1000px";
            ta.style.left = "-1000px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            setLabel("Copied");
          } catch {
            setLabel("Failed");
          }
        },
      );
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  /** Theme overlay on webview while browser-agent LLM pipeline runs (browser workspace only). */
  useEffect(() => {
    const el = document.getElementById("browserAgentLlmOverlay");
    if (!el) return;

    const apply = () => {
      const ws =
        document
          .getElementById("appContainer")
          ?.getAttribute("data-shell-workspace") ?? "";
      const show = busy && scope === "browser" && ws === "browser";
      if (show) {
        el.style.removeProperty("display");
        el.classList.add("browser-agent-llm-overlay--visible");
        el.setAttribute("aria-hidden", "false");
      } else {
        el.classList.remove("browser-agent-llm-overlay--visible");
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      }
    };

    apply();
    window.addEventListener("shell-workspace-changed", apply);
    return () => {
      window.removeEventListener("shell-workspace-changed", apply);
      el.classList.remove("browser-agent-llm-overlay--visible");
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    };
  }, [busy, scope]);

  useEffect(() => {
    if (scoped.conversations.length === 0) return;
    const ok =
      scoped.activeConversationId &&
      scoped.conversations.some((c) => c.id === scoped.activeConversationId);
    if (!ok) {
      setStore((s) =>
        setScopedStore(s, scope, {
          ...getScopedStore(s, scope),
          activeConversationId:
            getScopedStore(s, scope).conversations[0]?.id ?? null,
        }),
      );
    }
  }, [scope, scoped.activeConversationId, scoped.conversations]);

  const updateScoped = useCallback(
    (next: ScopedStore) => {
      setStore((s) => setScopedStore(s, scope, next));
    },
    [scope],
  );

  useEffect(() => {
    debouncedSave(store);
  }, [store]);

  useLayoutEffect(() => {
    chatStorePersistRef.current = store;
  }, [store]);

  /** Merge disk backup per workspace so one tab’s backup does not wipe the other workspace; sync localStorage if updated. */
  useEffect(() => {
    void readChatBackupStateV2().then((disk) => {
      if (!disk) return;
      setStore((s) => {
        const next = mergeChatStatePreferNewerPerScope(s, disk);
        if (next === s) return s;
        try {
          localStorage.setItem(CHAT_STORAGE_KEY_V2, JSON.stringify(next));
        } catch {
          try {
            localStorage.setItem(
              CHAT_STORAGE_KEY_V2,
              JSON.stringify(stripAttachmentsFromState(next)),
            );
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const onStorageFallback = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      const msg =
        kind === "stripped"
          ? "Browser storage is full; file attachments were removed from the saved copy only (your current message is unchanged). Re-attach files if you need them again."
          : kind === "disk_only"
            ? "Browser storage is full; full chat was saved to app data on disk."
            : "Could not save chat to browser storage or app data. Free disk space or clear old history.";
      notifyComposerUser(msg, 8000);
    };
    window.addEventListener("chat-storage-fallback", onStorageFallback as EventListener);
    return () => window.removeEventListener("chat-storage-fallback", onStorageFallback as EventListener);
  }, []);

  useEffect(() => {
    const persist = () => debouncedSave.flush(chatStorePersistRef.current);
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    const onVis = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const persistSettings = useCallback((next: IntelligentSettingsState) => {
    setSettings(next);
    saveIntelligentSettings(next);
  }, []);

  const removeComposerAttachment = useCallback((id: string) => {
    setComposerAttachments((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const onComposerAttachmentInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const list = input.files;
      if (!list?.length) return;
      /** Copy before clearing — resetting `value` empties the live `FileList` in Chromium/Electron. */
      const picked = Array.from(list);
      input.value = "";
      const newItems: ChatAttachment[] = [];

      for (const f of picked) {
        try {
          const att = await fileToChatAttachment(f);
          if (!att.dataBase64?.length) {
            notifyComposerUser(`Could not read file data for “${f.name}”.`);
            continue;
          }
          newItems.push(att);
        } catch {
          notifyComposerUser(`Could not read “${f.name}”.`);
        }
      }

      if (newItems.length === 0) {
        notifyComposerUser("No files could be attached.");
        return;
      }

      const merged = [...composerAttachmentsRef.current, ...newItems];
      const err = validateChatAttachmentList(merged);
      if (err) {
        notifyComposerUser(err);
        return;
      }
      setComposerAttachments(merged);
    },
    [],
  );

  const runSendWithText = useCallback(
    async (rawText: string, attachmentBatch?: ChatAttachment[]) => {
      const text = rawText.trim();
      const att = attachmentBatch ?? [];
      const conv = active;
      if ((!text && att.length === 0) || !api || !conv || busy) return;
      const v = validateChatAttachmentList(att);
      if (v) {
        notifyComposerUser(v);
        return;
      }
      stickMessagesToBottomRef.current = true;
      setThinkingLiveOpen(false);
      setBusy(true);
      setStreamSegments([]);
      setStreamingConversationId(conv.id);
      thinkingStartRef.current = null;

      const stored = appendUserMessage([...conv.messages], text, att.length > 0 ? att : undefined);
      const convUpdated: Conversation = {
        ...conv,
        messages: stored,
        updatedAt: Date.now(),
        title:
          scope === "browser"
            ? "Browser agent"
            : conv.messages.filter((m) => m.role === "user").length === 0
              ? titleFromFirstLine(text || att[0]?.name || "Files")
              : conv.title,
      };
      updateScoped({
        ...scoped,
        activeConversationId: conv.id,
        conversations: scoped.conversations.map((c) =>
          c.id === conv.id ? convUpdated : c,
        ),
      });

      const convId = conv.id;
      let toolAllowlist: string[] | null = null;
      if (scope === "intelligent") {
        const r = await computeIntelligentToolAllowlistFromUserText(
          text,
          api,
          settings,
        );
        toolAllowlist = r.allowlist;
        if (r.unknownNames.length > 0) {
          window.legacyBrowser?.showToast?.(
            `Unknown @tools: ${r.unknownNames.join(", ")}`,
          );
        }
      }
      try {
        const { messagesToAppend } = await runChatPipelineRound(
          scope,
          api,
          stored,
          setStreamSegments,
          toolAllowlist,
          () => {
            thinkingStartRef.current = Date.now();
          },
        );

        let append = messagesToAppend;
        if (append.length > 0) {
          const last = append[append.length - 1];
          if (
            last.role === "assistant" &&
            last.thinking &&
            thinkingStartRef.current != null
          ) {
            append = [
              ...append.slice(0, -1),
              {
                ...last,
                thinkingDurationMs: Date.now() - thinkingStartRef.current,
              },
            ];
          }
        }
        thinkingStartRef.current = null;

        const finalMessages: ChatMessageV2[] = [...stored, ...append];

        setStore((s) => {
          const sc = getScopedStore(s, scope);
          const next = setScopedStore(s, scope, {
            ...sc,
            activeConversationId: convId,
            conversations: sc.conversations.map((c) =>
              c.id === convId
                ? { ...c, messages: finalMessages, updatedAt: Date.now() }
                : c,
            ),
          });
          debouncedSave.flush(next);
          return next;
        });
      } finally {
        setBusy(false);
        setStreamSegments([]);
        setStreamingConversationId(null);
        queueMicrotask(() => debouncedSave.flush(chatStorePersistRef.current));
      }
    },
    [api, active, busy, scope, scoped, settings, updateScoped],
  );

  const runPipelineAfterEdit = useCallback(
    async (convId: string, stored: ChatMessageV2[]) => {
      if (!api) return;
      stickMessagesToBottomRef.current = true;
      setThinkingLiveOpen(false);
      setBusy(true);
      setStreamSegments([]);
      setStreamingConversationId(convId);
      thinkingStartRef.current = null;
      let toolAllowlist: string[] | null = null;
      if (scope === "intelligent") {
        const u = lastUserMessageContent(stored);
        const r = await computeIntelligentToolAllowlistFromUserText(
          u,
          api,
          settings,
        );
        toolAllowlist = r.allowlist;
        if (r.unknownNames.length > 0) {
          window.legacyBrowser?.showToast?.(
            `Unknown @tools: ${r.unknownNames.join(", ")}`,
          );
        }
      }
      try {
        const { messagesToAppend } = await runChatPipelineRound(
          scope,
          api,
          stored,
          setStreamSegments,
          toolAllowlist,
          () => {
            thinkingStartRef.current = Date.now();
          },
        );

        let append = messagesToAppend;
        if (append.length > 0) {
          const last = append[append.length - 1];
          if (
            last.role === "assistant" &&
            last.thinking &&
            thinkingStartRef.current != null
          ) {
            append = [
              ...append.slice(0, -1),
              {
                ...last,
                thinkingDurationMs: Date.now() - thinkingStartRef.current,
              },
            ];
          }
        }
        thinkingStartRef.current = null;

        const finalMessages: ChatMessageV2[] = [...stored, ...append];

        setStore((s) => {
          const sc = getScopedStore(s, scope);
          const next = setScopedStore(s, scope, {
            ...sc,
            conversations: sc.conversations.map((c) =>
              c.id === convId
                ? { ...c, messages: finalMessages, updatedAt: Date.now() }
                : c,
            ),
          });
          debouncedSave.flush(next);
          return next;
        });
      } finally {
        setBusy(false);
        setStreamSegments([]);
        setStreamingConversationId(null);
        queueMicrotask(() => debouncedSave.flush(chatStorePersistRef.current));
      }
    },
    [api, scope, settings],
  );

  const executeAssistantRetry = useCallback(
    async (assistantId: string) => {
      if (retryRunningRef.current) return;
      if (!active || busy) {
        setRetryExitAssistantId(null);
        return;
      }
      const msgs = active.messages;
      const aiIdx = msgs.findIndex((x) => x.id === assistantId);
      if (aiIdx < 0 || msgs[aiIdx]?.role !== "assistant") {
        setRetryExitAssistantId(null);
        return;
      }
      const ui = findUserIndexBeforeAssistant(msgs, aiIdx);
      if (ui < 0) {
        setRetryExitAssistantId(null);
        return;
      }

      retryRunningRef.current = true;
      try {
        const stored = msgs.slice(0, ui + 1);
        const convId = active.id;
        const convUpdated: Conversation = {
          ...active,
          messages: stored,
          updatedAt: Date.now(),
        };

        setStore((s) => {
          const sc = getScopedStore(s, scope);
          return setScopedStore(s, scope, {
            ...sc,
            conversations: sc.conversations.map((c) =>
              c.id === convId ? convUpdated : c,
            ),
          });
        });

        setRetryExitAssistantId(null);

        await runPipelineAfterEdit(convId, stored);
      } finally {
        retryRunningRef.current = false;
      }
    },
    [active, busy, runPipelineAfterEdit, scope],
  );

  useEffect(() => {
    if (!retryExitAssistantId) return;
    const id = retryExitAssistantId;
    const t = window.setTimeout(() => {
      void executeAssistantRetry(id);
    }, 900);
    return () => window.clearTimeout(t);
  }, [retryExitAssistantId, executeAssistantRetry]);

  const onSend = useCallback(async () => {
    const text = input.trim();
    const batch = composerAttachments;
    if (!text && batch.length === 0) return;
    setInput("");
    setComposerAttachments([]);
    await runSendWithText(text, batch);
  }, [input, composerAttachments, runSendWithText]);

  const newChat = useCallback(() => {
    if (scope === "browser") return;
    const c = createNewConversation(scope, "New chat");
    updateScoped({
      conversations: [c, ...scoped.conversations],
      activeConversationId: c.id,
    });
  }, [scope, scoped.conversations, updateScoped]);

  const clearChat = useCallback(() => {
    if (!active) return;
    if (scope === "browser") {
      setStore((s) => {
        const sc = normalizeBrowserScoped(s.browser);
        const one = sc.conversations[0];
        if (!one) {
          const c = createNewConversation("browser");
          return setScopedStore(s, "browser", {
            conversations: [c],
            activeConversationId: c.id,
          });
        }
        const welcome: ChatMessageV2 = {
          id: generateMessageId(),
          role: "assistant",
          content: DEFAULT_WELCOME_BROWSER,
        };
        const cleared: Conversation = {
          ...one,
          messages: [welcome],
          title: "Browser agent",
          updatedAt: Date.now(),
        };
        return setScopedStore(s, "browser", {
          conversations: [cleared],
          activeConversationId: cleared.id,
        });
      });
      return;
    }
    const c = createNewConversation(scope, "New chat");
    updateScoped({
      conversations: scoped.conversations.map((x) =>
        x.id === active.id ? c : x,
      ),
      activeConversationId: c.id,
    });
  }, [active, scope, scoped.conversations, updateScoped]);

  const confirmPendingDeleteChat = useCallback(() => {
    if (!pendingDeleteChat) return;
    const { id } = pendingDeleteChat;
    setPendingDeleteChat(null);
    setStore((s) => {
      const sc = getScopedStore(s, scope);
      const rest = sc.conversations.filter((c) => c.id !== id);
      if (rest.length === 0) {
        const c = createNewConversation(scope, "New chat");
        return setScopedStore(s, scope, {
          conversations: [c],
          activeConversationId: c.id,
        });
      }
      const nextActive =
        sc.activeConversationId === id
          ? rest[0]!.id
          : (sc.activeConversationId ?? rest[0]!.id);
      return setScopedStore(s, scope, {
        conversations: rest,
        activeConversationId: nextActive,
      });
    });
  }, [pendingDeleteChat, scope]);

  const openDeleteChatModal = useCallback((id: string, title: string) => {
    const t = title.trim() || "Untitled chat";
    setPendingDeleteChat({ id, title: t });
  }, []);

  const openEditUserMessage = useCallback(
    (messageId: string, content: string) => {
      setEditModal({ messageId, text: content });
    },
    [],
  );

  const saveEditAndResend = useCallback(async () => {
    if (!editModal || !active || busy) return;
    const idx = active.messages.findIndex((m) => m.id === editModal.messageId);
    if (idx < 0 || active.messages[idx]?.role !== "user") {
      setEditModal(null);
      return;
    }
    const edited = editModal.text.trim();
    if (!edited) return;

    const head = active.messages.slice(0, idx);
    const prevUser = active.messages[idx] as Extract<ChatMessageV2, { role: "user" }>;
    const newUser: ChatMessageV2 = {
      id: generateMessageId(),
      role: "user",
      content: edited,
      ...(prevUser.attachments?.length ? { attachments: prevUser.attachments } : {}),
    };
    const stored = [...head, newUser];

    const convUpdated: Conversation = {
      ...active,
      messages: stored,
      updatedAt: Date.now(),
      title:
        scope === "browser"
          ? "Browser agent"
          : active.messages.filter((m) => m.role === "user").length <= 1
            ? titleFromFirstLine(edited)
            : active.title,
    };

    const convId = active.id;
    setStore((s) => {
      const sc = getScopedStore(s, scope);
      return setScopedStore(s, scope, {
        ...sc,
        conversations: sc.conversations.map((c) =>
          c.id === convId ? convUpdated : c,
        ),
      });
    });
    setEditModal(null);

    await runPipelineAfterEdit(convId, stored);
  }, [active, busy, editModal, runPipelineAfterEdit, scope]);

  useEffect(() => {
    (
      window as unknown as { __aiChatSubmit?: (t: string) => void }
    ).__aiChatSubmit = (t: string) => {
      void runSendWithText(t);
    };
    (
      window as unknown as { __aiChatNewConversation?: () => void }
    ).__aiChatNewConversation = newChat;
    (
      window as unknown as { __aiChatClearConversation?: () => void }
    ).__aiChatClearConversation = clearChat;
    return () => {
      delete (window as unknown as { __aiChatSubmit?: (t: string) => void })
        .__aiChatSubmit;
      delete (window as unknown as { __aiChatNewConversation?: () => void })
        .__aiChatNewConversation;
      delete (window as unknown as { __aiChatClearConversation?: () => void })
        .__aiChatClearConversation;
    };
  }, [newChat, clearChat, runSendWithText]);

  useEffect(() => {
    return () => {
      window.__reactAiChatOwnsHistoryList = false;
      window.__kernelRefreshChatHistoryList?.();
    };
  }, []);

  useEffect(() => {
    window.__reactAiChatOwnsHistoryList = scope === "intelligent";
    if (scope !== "intelligent") window.__kernelRefreshChatHistoryList?.();
  }, [scope]);

  useEffect(() => {
    const list = document.getElementById("chatHistoryList");
    if (!list || scope !== "intelligent") return;
    const sorted = [...scoped.conversations].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    list.innerHTML = "";
    for (const c of sorted) {
      const wrap = document.createElement("div");
      wrap.className = "chat-history-row-wrap";
      if (c.id === scoped.activeConversationId)
        wrap.classList.add("chat-history-row-wrap--active");

      const row = document.createElement("button");
      row.type = "button";
      row.className = "chat-history-row";
      if (c.id === scoped.activeConversationId)
        row.classList.add("chat-history-row--active");
      row.textContent = c.title || "Chat";
      row.title = c.title || "Chat";
      row.onclick = () => {
        setStore((s) => {
          const sc = getScopedStore(s, scope);
          return setScopedStore(s, scope, {
            ...sc,
            activeConversationId: c.id,
          });
        });
      };

      const del = document.createElement("button");
      del.type = "button";
      del.className = "chat-history-row-delete";
      del.title = "Delete chat";
      del.setAttribute("aria-label", "Delete chat");
      del.textContent = "×";
      del.onclick = (e) => {
        e.stopPropagation();
        openDeleteChatModal(c.id, c.title || "Chat");
      };

      wrap.appendChild(row);
      wrap.appendChild(del);
      list.appendChild(wrap);
    }
  }, [
    scope,
    scoped.conversations,
    scoped.activeConversationId,
    openDeleteChatModal,
  ]);

  useEffect(() => {
    if (!mcpModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMcpModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mcpModalOpen]);

  useEffect(() => {
    if (!pendingDeleteChat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDeleteChat(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDeleteChat]);

  useEffect(() => {
    if (!editModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editModal]);

  useLayoutEffect(() => {
    if (!editModal) return;
    const wrap = document.querySelector(
      `[data-ai-chat-user-msg="${CSS.escape(editModal.messageId)}"]`,
    );
    wrap?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const ta = userEditTextareaRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, [editModal?.messageId]);

  const isBrowserAgent = scope === "browser";

  const mentionCtx = useMemo(() => {
    if (isBrowserAgent) return null;
    const active = getActiveMentionQuery(input, composerCaret);
    if (!active) return null;
    const suggestions = filterToolNameSuggestions(
      intelligentToolNames,
      active.query,
      4,
    );
    return { active, suggestions };
  }, [composerCaret, input, intelligentToolNames, isBrowserAgent]);

  const applyMentionPick = useCallback(
    (toolName: string) => {
      if (isBrowserAgent) return;
      const el = composerTextareaRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? input.length;
      const active = getActiveMentionQuery(input, caret);
      if (!active) return;
      const { next, caret: nextCaret } = replaceMentionAtCaret(
        input,
        caret,
        active.start,
        toolName,
      );
      setInput(next);
      setMentionSuppress(false);
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setComposerCaret(nextCaret);
        adjustComposerHeight();
      });
    },
    [adjustComposerHeight, input, isBrowserAgent],
  );

  /** Defer open so the same pointer sequence isn’t eaten by focus / shell handlers (fixes flaky first click in intelligent workspace). */
  const openMcpToolsModal = useCallback(() => {
    queueMicrotask(() => setMcpModalOpen(true));
  }, []);
  const toggleScope = isBrowserAgent
    ? settings.mcpTogglesBrowser
    : settings.mcpTogglesIntelligent;
  const setConn = (id: string, v: boolean) => {
    if (isBrowserAgent && id === BUTCHER_BUILTIN_MCP_ID) return;
    if (!isBrowserAgent && id === INTELLIGENT_BUILTIN_MCP_ID && !v) return;
    persistSettings({
      ...settings,
      [isBrowserAgent ? "mcpTogglesBrowser" : "mcpTogglesIntelligent"]: {
        ...toggleScope,
        connectionEnabled: { ...toggleScope.connectionEnabled, [id]: v },
      },
    });
  };
  const setToolT = (mcpId: string, toolName: string, v: boolean) => {
    const key = isBrowserAgent ? "mcpTogglesBrowser" : "mcpTogglesIntelligent";
    const next = { ...toggleScope.toolEnabled[mcpId] };
    next[toolName] = v;
    persistSettings({
      ...settings,
      [key]: {
        ...toggleScope,
        toolEnabled: { ...toggleScope.toolEnabled, [mcpId]: next },
      },
    });
  };

  const ensureExternalToolsLoaded = useCallback(
    async (s: (typeof settings.mcpServers)[0], forceReload = false) => {
      if (!mcpServerHasConnectionParams(s)) return;
      if (!api) return;
      if (forceReload) {
        try {
          await api.mcpExternalDisconnect(s.id);
        } catch {
          // ignore transient disconnect errors and continue to list.
        }
      }
      setExternalToolsByServer((prev) => ({
        ...prev,
        [s.id]: forceReload
          ? { status: "loading", tools: [] }
          : prev[s.id]?.status === "ok"
            ? prev[s.id]!
            : { status: "loading", tools: [] },
      }));
      const payload = mcpServerToPayload(s);
      try {
        const res = await api.mcpExternalListTools(payload);
        if (!res.ok) {
          setExternalToolsByServer((prev) => ({
            ...prev,
            [s.id]: {
              status: "err",
              tools: [],
              error: friendlyMcpConnectionError(res.error),
            },
          }));
          return;
        }
        setExternalToolsByServer((prev) => ({
          ...prev,
          [s.id]: {
            status: "ok",
            tools: res.tools.map((t) => ({
              name: t.name,
              description: t.description,
            })),
          },
        }));
      } catch (err) {
        setExternalToolsByServer((prev) => ({
          ...prev,
          [s.id]: {
            status: "err",
            tools: [],
            error: friendlyMcpConnectionError(
              err instanceof Error ? err.message : String(err),
            ),
          },
        }));
      }
    },
    [api],
  );

  const mcpModal =
    mcpModalOpen &&
    createPortal(
      <div
        className="ai-chat-floating-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setMcpModalOpen(false);
        }}
      >
        <div
          className="ai-chat-floating-panel ai-chat-floating-panel--mcp"
          role="dialog"
          aria-labelledby="ai-chat-mcp-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="ai-chat-mcp-modal__head">
            <div className="ai-chat-mcp-modal__head-text">
              <span className="ai-chat-mcp-modal__badge" aria-hidden>
                {isBrowserAgent ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <McpIcon size={20} />
                )}
              </span>
              <h2
                id="ai-chat-mcp-modal-title"
                className="ai-chat-mcp-modal__title"
              >
                {isBrowserAgent ? "Browser tools" : "MCP & tools"}
              </h2>
            </div>
            <button
              type="button"
              className="ai-chat-mcp-modal__close"
              onClick={() => setMcpModalOpen(false)}
              aria-label="Close"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
          <p className="ai-chat-floating-panel__hint">
            {isBrowserAgent
              ? "Butcher browser automation is always on here. Expand the list to turn individual tools on or off. This workspace does not load external MCP servers."
              : "Enable connections and pick which tools the model may call. Intelligent workspace only; settings are saved on this device."}
          </p>
          <div className="ai-chat-mcp-modal__cards">
            <div className="ai-chat-mcp-card">
              <div className="ai-chat-mcp-card__header">
                <div>
                  <div className="ai-chat-mcp-card__name">
                    {isBrowserAgent
                      ? "Browser Server (browser automation)"
                      : "Browser Server (built-in)"}
                  </div>
                  {mcpBridge ? (
                    <div className="ai-chat-mcp-card__meta">
                      Bridge:{" "}
                      {mcpBridge.enabled && mcpBridge.listeningPort != null
                        ? `listening on ${mcpBridge.listeningPort}`
                        : "off"}
                    </div>
                  ) : null}
                </div>
                {isBrowserAgent ? (
                  <div className="ai-chat-mcp-toggle ai-chat-mcp-toggle--locked">
                    <span className="ai-chat-mcp-toggle__label">
                      Connection
                    </span>
                    <span
                      className="ai-chat-mcp-connection-pill"
                      aria-label="Always on. Cannot be disabled for Browser Agent."
                    >
                      Always on
                    </span>
                  </div>
                ) : (
                  <div className="ai-chat-mcp-toggle">
                    <span className="ai-chat-mcp-toggle__label">On</span>
                    <SlideToggle
                      on={
                        toggleScope.connectionEnabled[
                          BUTCHER_BUILTIN_MCP_ID
                        ] !== false
                      }
                      onToggle={() =>
                        setConn(
                          BUTCHER_BUILTIN_MCP_ID,
                          !(
                            toggleScope.connectionEnabled[
                              BUTCHER_BUILTIN_MCP_ID
                            ] !== false
                          ),
                        )
                      }
                      ariaLabel="Browser Server MCP connection"
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`ai-chat-mcp-card__expand${butcherToolsExpanded ? " is-expanded" : ""}`}
                aria-expanded={butcherToolsExpanded}
                onClick={() => setButcherToolsExpanded((v) => !v)}
              >
                <span
                  className="ai-chat-mcp-card__expand-chevron"
                  aria-hidden
                />
                {butcherToolsExpanded ? "Hide tools" : "Show tools"}
              </button>
              {butcherToolsExpanded ? (
                <div className="ai-chat-mcp-tool-grid">
                  {MCP_BROWSER_TOOL_DEFINITIONS.map((def) => (
                    <div key={def.name} className="ai-chat-mcp-tool-row">
                      <SlideToggle
                        on={
                          toggleScope.toolEnabled[BUTCHER_BUILTIN_MCP_ID]?.[
                            def.name
                          ] !== false
                        }
                        onToggle={() =>
                          setToolT(
                            BUTCHER_BUILTIN_MCP_ID,
                            def.name,
                            !(
                              toggleScope.toolEnabled[BUTCHER_BUILTIN_MCP_ID]?.[
                                def.name
                              ] !== false
                            ),
                          )
                        }
                        ariaLabel={`Tool ${def.name}`}
                      />
                      <div className="ai-chat-mcp-tool-row__text">
                        <span className="ai-chat-mcp-tool-row__name">
                          {def.name}
                        </span>
                        <span className="ai-chat-mcp-tool-row__desc">
                          {def.description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {!isBrowserAgent ? (
              <div className="ai-chat-mcp-card">
                <div className="ai-chat-mcp-card__header">
                  <div>
                    <div className="ai-chat-mcp-card__name">Intelligent Server (built-in)</div>
                    {mcpBridge ? (
                      <div className="ai-chat-mcp-card__meta">
                        Bridge:{" "}
                        {mcpBridge.enabled && mcpBridge.intelligentListeningPort != null
                          ? `listening on ${mcpBridge.intelligentListeningPort}`
                          : "off"}
                      </div>
                    ) : null}
                  </div>
                  <div className="ai-chat-mcp-toggle ai-chat-mcp-toggle--locked">
                    <span className="ai-chat-mcp-toggle__label">Connection</span>
                    <span
                      className="ai-chat-mcp-connection-pill"
                      aria-label="Always on. Cannot be disabled for AI Assistant."
                    >
                      Always on
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`ai-chat-mcp-card__expand${intelligentToolsExpanded ? " is-expanded" : ""}`}
                  aria-expanded={intelligentToolsExpanded}
                  onClick={() => setIntelligentToolsExpanded((v) => !v)}
                >
                  <span
                    className="ai-chat-mcp-card__expand-chevron"
                    aria-hidden
                  />
                  {intelligentToolsExpanded ? "Hide tools" : "Show tools"}
                </button>
                {intelligentToolsExpanded ? (
                  <div className="ai-chat-mcp-tool-grid">
                    {MCP_INTELLIGENT_TOOL_DEFINITIONS.map((def) => (
                      <div key={def.name} className="ai-chat-mcp-tool-row">
                        <SlideToggle
                          on={toggleScope.toolEnabled[INTELLIGENT_BUILTIN_MCP_ID]?.[def.name] !== false}
                          onToggle={() =>
                            setToolT(
                              INTELLIGENT_BUILTIN_MCP_ID,
                              def.name,
                              !(toggleScope.toolEnabled[INTELLIGENT_BUILTIN_MCP_ID]?.[def.name] !== false),
                            )
                          }
                          ariaLabel={`Tool ${def.name}`}
                        />
                        <div className="ai-chat-mcp-tool-row__text">
                          <span className="ai-chat-mcp-tool-row__name">{def.name}</span>
                          <span className="ai-chat-mcp-tool-row__desc">{def.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isBrowserAgent &&
              settings.mcpServers.map((s) => {
                const expanded = expandedMcpIds.has(s.id);
                const ext = externalToolsByServer[s.id];
                return (
                  <div key={s.id} className="ai-chat-mcp-card">
                    <div className="ai-chat-mcp-card__header">
                      <div>
                        <div className="ai-chat-mcp-card__name">
                          {s.name || s.id}
                        </div>
                        <div className="ai-chat-mcp-card__meta">
                          {s.serverMode === "remote"
                            ? (s.url || "").trim() || "No URL"
                            : s.command
                              ? s.command
                              : "No command"}
                        </div>
                      </div>
                      <div className="ai-chat-mcp-toggle">
                        <span className="ai-chat-mcp-toggle__label">On</span>
                        <SlideToggle
                          on={toggleScope.connectionEnabled[s.id] !== false}
                          onToggle={() =>
                            setConn(
                              s.id,
                              !(toggleScope.connectionEnabled[s.id] !== false),
                            )
                          }
                          ariaLabel={`MCP server ${s.name || s.id}`}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`ai-chat-mcp-card__expand${expanded ? " is-expanded" : ""}`}
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedMcpIds((prev) => {
                          const next = new Set(prev);
                          const opening = !next.has(s.id);
                          if (opening) {
                            next.add(s.id);
                            queueMicrotask(
                              () => void ensureExternalToolsLoaded(s),
                            );
                          } else next.delete(s.id);
                          return next;
                        });
                      }}
                    >
                      <span
                        className="ai-chat-mcp-card__expand-chevron"
                        aria-hidden
                      />
                      {expanded ? "Hide tools" : "Show tools"}
                    </button>
                    {expanded ? (
                      <div className="ai-chat-mcp-tool-grid">
                        {!mcpServerHasConnectionParams(s) ? (
                          <p className="ai-chat-mcp-card__meta">
                            Configure this server in Settings to list tools.
                          </p>
                        ) : ext?.status === "loading" ? (
                          <div
                            className="ai-chat-mcp-loading"
                            aria-live="polite"
                          >
                            <span className="ai-chat-mcp-loading__dot" />
                            <span className="ai-chat-mcp-loading__dot" />
                            <span className="ai-chat-mcp-loading__dot" />
                            <span className="ai-chat-mcp-loading__label">
                              Fetching tools…
                            </span>
                          </div>
                        ) : ext?.status === "err" ? (
                          <p className="ai-chat-mcp-card__meta ai-chat-mcp-card__err">
                            {ext.error}
                          </p>
                        ) : ext?.status === "ok" && ext.tools.length === 0 ? (
                          <p className="ai-chat-mcp-card__meta">
                            No tools reported.
                          </p>
                        ) : (
                          ext?.tools.map((t) => (
                            <div key={t.name} className="ai-chat-mcp-tool-row">
                              <SlideToggle
                                on={
                                  toggleScope.toolEnabled[s.id]?.[t.name] !==
                                  false
                                }
                                onToggle={() =>
                                  setToolT(
                                    s.id,
                                    t.name,
                                    !(
                                      toggleScope.toolEnabled[s.id]?.[
                                        t.name
                                      ] !== false
                                    ),
                                  )
                                }
                                ariaLabel={`Tool ${t.name}`}
                              />
                              <div className="ai-chat-mcp-tool-row__text">
                                <span className="ai-chat-mcp-tool-row__name">
                                  {t.name}
                                </span>
                                {t.description ? (
                                  <span className="ai-chat-mcp-tool-row__desc">
                                    {t.description}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      </div>,
      document.body,
    );

  const deleteChatModalEl =
    pendingDeleteChat &&
    createPortal(
      <div
        className="ai-chat-floating-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setPendingDeleteChat(null);
        }}
      >
        <div
          className="ai-chat-floating-panel ai-chat-delete-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ai-chat-delete-title"
          aria-describedby="ai-chat-delete-desc"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h3 id="ai-chat-delete-title" className="ai-chat-delete-modal__title">
            Delete this chat?
          </h3>
          <p id="ai-chat-delete-desc" className="ai-chat-delete-modal__desc">
            This removes{" "}
            <span className="ai-chat-delete-modal__chat-title">
              {pendingDeleteChat.title}
            </span>{" "}
            and all messages in it. This cannot be undone.
          </p>
          <div className="ai-chat-delete-modal__actions">
            <button
              type="button"
              className="ai-chat-delete-modal__btn ai-chat-delete-modal__btn--cancel"
              onClick={() => setPendingDeleteChat(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ai-chat-delete-modal__btn ai-chat-delete-modal__btn--danger"
              onClick={() => confirmPendingDeleteChat()}
            >
              Delete chat
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  const composerToolbarMain = (
    <>
      <button
        type="button"
        className="ai-chat-icon-btn ai-chat-icon-btn--mcp"
        aria-label={
          isBrowserAgent
            ? "Browser automation and MCP tools"
            : "MCP and tools"
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => openMcpToolsModal()}
      >
        <McpIcon size={17} />
      </button>
      <button
        type="button"
        className="ai-chat-icon-btn ai-chat-icon-btn--attach"
        aria-label="Attach files"
        title={`Attach files — ${chatAttachmentLimitsSummary()}`}
        disabled={busy}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => composerAttachmentInputRef.current?.click()}
      >
        <IconAttachFiles />
      </button>
      <input
        ref={composerAttachmentInputRef}
        type="file"
        className="ai-chat-attachment-input"
        multiple
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onComposerAttachmentInputChange(e)}
      />
      <span className="ai-chat-composer-toolbar__sep" aria-hidden />
      <ModelQuickPick
        selectedModelId={selectedModelIdForChatScope(settings, scope)}
        modelIds={settings.cachedModelIds}
        disabled={busy}
        onSelect={(id) =>
          persistSettings({
            ...settings,
            ...(scope === "browser"
              ? { browserSelectedModelId: id }
              : { intelligentSelectedModelId: id }),
          })
        }
        onOpenAssistantSettings={() =>
          window.legacyBrowser?.openIntelligentAssistantSettings?.()
        }
      />
      <ThinkingPicker
        level={thinkingLevelForChatScope(settings, scope)}
        disabled={busy}
        onSelect={(level) =>
          persistSettings({
            ...settings,
            ...(scope === "browser"
              ? { browserThinkingLevel: level }
              : { intelligentThinkingLevel: level }),
          })
        }
      />
      {intelligentWorkspaceShell ? (
        <>
          <span className="ai-chat-composer-toolbar__sep" aria-hidden />
          <button
            type="button"
            className="ai-chat-icon-btn ai-chat-icon-btn--clear"
            aria-label="Clear chat"
            disabled={busy || !active}
            onClick={() => clearChat()}
          >
            <IconClearChat />
          </button>
        </>
      ) : null}
      {isBrowserAgent ? (
        <>
          <span className="ai-chat-composer-toolbar__sep" aria-hidden />
          <span className="ai-chat-composer-toolbar__group-label">Page</span>
          <button
            type="button"
            className="ai-chat-icon-btn ai-chat-icon-btn--compact"
            aria-label="Pick any element — append CSS selector and details to the message"
            onClick={() =>
              window.legacyBrowser?.startBrowserPagePickerAny?.()
            }
          >
            CSS
          </button>
          <button
            type="button"
            className="ai-chat-icon-btn ai-chat-icon-btn--compact"
            aria-label="Pick a clickable control — append target details to the message"
            onClick={() =>
              window.legacyBrowser?.startBrowserPagePickerInteractive?.()
            }
          >
            Target
          </button>
          <button
            type="button"
            className="ai-chat-icon-btn ai-chat-icon-btn--compact"
            aria-label="Click a region to save a snapshot — filename is added to the message"
            onClick={() =>
              window.legacyBrowser?.startBrowserPageElementScreenshot?.()
            }
          >
            Snap
          </button>
        </>
      ) : null}
    </>
  );

  const composerMentionBlock =
    mentionCtx && !mentionSuppress ? (
      <div
        id={toolMentionListId}
        className="ai-chat-tool-mention-popover"
        role="listbox"
        aria-label="Matching tools"
      >
        {mentionCtx.suggestions.length === 0 ? (
          <div
            className="ai-chat-tool-mention-empty"
            role="presentation"
          >
            {intelligentToolNames.length === 0
              ? "No tools enabled — open MCP tools to connect servers."
              : "No matching tools"}
          </div>
        ) : (
          mentionCtx.suggestions.map((name, i) => (
            <button
              key={name}
              type="button"
              role="option"
              id={`${toolMentionListId}-opt-${i}`}
              aria-selected={i === 0}
              className={`ai-chat-tool-mention-option${i === 0 ? " ai-chat-tool-mention-option--first" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyMentionPick(name)}
            >
              {name}
            </button>
          ))
        )}
      </div>
    ) : null;

  const composerTextarea = (
    <textarea
      ref={composerTextareaRef}
      className="ai-chat-textarea"
      rows={COMPOSER_MIN_LINES}
      placeholder={
        isBrowserAgent
          ? "Tell the browser agent what to do…"
          : "Message the assistant…"
      }
      value={input}
      aria-autocomplete={mentionCtx && !mentionSuppress ? "list" : "none"}
      aria-expanded={!!(mentionCtx && !mentionSuppress)}
      aria-controls={
        mentionCtx && !mentionSuppress ? toolMentionListId : undefined
      }
      onChange={(e) => {
        setInput(e.target.value);
        setComposerCaret(
          e.target.selectionStart ?? e.target.value.length,
        );
        setMentionSuppress(false);
      }}
      onSelect={(e) => {
        setComposerCaret(e.currentTarget.selectionStart ?? 0);
      }}
      onKeyDown={(e) => {
        if (
          !isBrowserAgent &&
          mentionCtx &&
          !mentionSuppress &&
          mentionCtx.suggestions.length > 0
        ) {
          if (e.key === "Tab") {
            e.preventDefault();
            applyMentionPick(mentionCtx.suggestions[0]!);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setMentionSuppress(true);
            return;
          }
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void onSend();
        }
      }}
    />
  );

  const canSend = Boolean(input.trim()) || composerAttachments.length > 0;

  const composerSendBtn = (
    <button
      type="button"
      className="ai-chat-send"
      disabled={busy || !canSend}
      aria-label="Send"
      onClick={() => void onSend()}
    >
      <IconSendPlane />
    </button>
  );

  const composerSendBtnIw = (
    <button
      type="button"
      className="ai-chat-send ai-chat-send--iw"
      disabled={busy || !canSend}
      aria-label="Send"
      onClick={() => void onSend()}
    >
      <IconSendPlane />
    </button>
  );

  const composerAttachmentChips =
    composerAttachments.length > 0 ? (
      <div className="ai-chat-composer-attachments-wrap">
        <div className="ai-chat-composer-attachments" role="list" aria-label="Attachments to send">
          {composerAttachments.map((a) => (
            <div key={a.id} className="ai-chat-composer-attachment-chip" role="listitem">
              <span className="ai-chat-composer-attachment-chip__name" title={`${a.name} · ${a.mime}`}>
                {a.name}
              </span>
              <button
                type="button"
                className="ai-chat-composer-attachment-chip__rm"
                aria-label={`Remove ${a.name}`}
                disabled={busy}
                onClick={() => removeComposerAttachment(a.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="ai-chat-composer-attachment-hint" role="note">
          {chatAttachmentLimitsSummary()}
        </p>
      </div>
    ) : null;

  const showQueryRail =
    intelligentWorkspaceShell && queryRailUsers.length > 1;

  return (
    <div
      className={`ai-chat-panel${intelligentWorkspaceShell ? " ai-chat-panel--intelligent-shell" : ""}`}
    >
      <div
        className={`ai-chat-main${
          showQueryRail ? " ai-chat-main--query-rail" : ""
        }`}
      >
        <div
          className={
            intelligentWorkspaceShell ? "ai-chat-iw-assistant" : undefined
          }
          style={
            intelligentWorkspaceShell
              ? undefined
              : ({ display: "contents" } as CSSProperties)
          }
        >
          <div
            className={
              intelligentWorkspaceShell
                ? "ai-chat-messages-column ai-chat-messages-column--iw"
                : "ai-chat-messages-column"
            }
          >
            <div
              className="ai-chat-messages-scroll"
              ref={messagesScrollRef}
              onScroll={updateStickToBottomFromScroll}
            >
          {!active || nonSystemMessages.length === 0 ? (
            <div className="ai-chat-idle ai-chat-idle--empty">
              <div className="ai-chat-idle__aurora" aria-hidden />
              <div className="ai-chat-idle__content">
                <p className="ai-chat-idle__title">
                  {isBrowserAgent ? "Browser Agent" : "AI Assistant"}
                </p>
                <p className="ai-chat-idle__subtitle">
                  Start a conversation below.
                </p>
              </div>
            </div>
          ) : null}
          {active?.messages?.map((m, msgIdx) => {
            if (m.role === "system") return null;
            if (m.role === "tool") {
              const toolName = m.name?.trim() || "Tool result";
              return (
                <div key={m.id} className="ai-chat-msg ai-chat-msg--tool">
                  {isCalculatorToolName(toolName) ? (
                    <AiChatCalculatorToolRow
                      instanceKey={m.id}
                      toolArguments={m.arguments}
                      content={m.content}
                    />
                  ) : (
                    <AiChatToolResultBlock
                      name={toolName}
                      toolArguments={m.arguments}
                      content={m.content}
                    />
                  )}
                </div>
              );
            }
            if (m.role === "user") {
              const editing =
                scope === "intelligent" &&
                editModal !== null &&
                editModal.messageId === m.id;
              return (
                <div
                  key={m.id}
                  className={`ai-chat-msg ai-chat-msg--user${editing ? " ai-chat-msg--user-editing" : ""}`}
                  tabIndex={-1}
                  data-ai-chat-user-msg={m.id}
                >
                  <div className="ai-chat-msg-stack">
                    {editing ? (
                      <div
                        className="ai-chat-inline-edit"
                        role="group"
                        aria-label="Edit message"
                      >
                        <p className="ai-chat-inline-edit__hint">
                          Saving removes this message and everything after it,
                          then resends to the model. Ctrl+Enter saves; Esc
                          cancels.
                        </p>
                        <textarea
                          ref={userEditTextareaRef}
                          className="ai-chat-inline-edit__textarea"
                          rows={5}
                          value={editModal.text}
                          onChange={(e) =>
                            setEditModal({
                              messageId: m.id,
                              text: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              (e.ctrlKey || e.metaKey) &&
                              editModal.text.trim()
                            ) {
                              e.preventDefault();
                              void saveEditAndResend();
                            }
                          }}
                        />
                        <div className="ai-chat-inline-edit__actions">
                          <button
                            type="button"
                            className="ai-chat-inline-edit__btn"
                            onClick={() => setEditModal(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="ai-chat-edit-modal__submit"
                            disabled={busy || !editModal?.text.trim()}
                            onClick={() => void saveEditAndResend()}
                          >
                            Save &amp; resend
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.content.trim() ? (
                          <div
                            className="ai-chat-bubble"
                            dangerouslySetInnerHTML={{
                              __html: renderAiChatMd(m.content),
                            }}
                          />
                        ) : null}
                        {m.attachments?.length ? (
                          <div
                            className="ai-chat-msg-attachments"
                            aria-label="Attached files"
                          >
                            {m.attachments.map((a) => (
                              <span
                                key={a.id}
                                className="ai-chat-msg-attachment-pill"
                                title={`${a.name} · ${a.mime}`}
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <AiChatMsgFooter
                          align="end"
                          plainText={
                            m.content ||
                            (m.attachments?.map((a) => a.name).join(", ") ?? "")
                          }
                          showEdit={scope === "intelligent"}
                          editDisabled={busy}
                          onEdit={
                            scope === "intelligent"
                              ? () => openEditUserMessage(m.id, m.content)
                              : undefined
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            }
            const isWelcomeSpotlight = m.id === welcomeSpotlightMessageId;
            const canRetryAssistant =
              !isWelcomeSpotlight &&
              (m.content || "").trim().length > 0 &&
              findUserIndexBeforeAssistant(active?.messages ?? [], msgIdx) >= 0;
            return (
              <div
                key={m.id}
                className={`ai-chat-msg ai-chat-msg--assistant${isWelcomeSpotlight ? " ai-chat-msg--welcome-spotlight" : ""}${retryExitAssistantId === m.id ? " ai-chat-msg--retry-exit" : ""}`}
                tabIndex={-1}
                onTransitionEnd={(e) => {
                  if (retryExitAssistantId !== m.id) return;
                  if (e.target !== e.currentTarget) return;
                  if (e.propertyName !== "opacity") return;
                  void executeAssistantRetry(m.id);
                }}
              >
                {isWelcomeSpotlight ? (
                  <div className="ai-chat-welcome-shell">
                    <div
                      className="ai-chat-welcome-shell__aurora"
                      aria-hidden
                    />
                    <div className="ai-chat-welcome-shell__card">
                      <div className="ai-chat-welcome-shell__icon" aria-hidden>
                        {isBrowserAgent ? (
                          <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect x="3" y="4" width="18" height="14" rx="2" />
                            <path d="M7 20h10M12 18v2" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-.46 0-.91-.03-1.35-.09L5 21l1.35-4.38C5.48 15.42 3 13.41 3 11c0-4.42 4.03-8 9-8z" />
                          </svg>
                        )}
                      </div>
                      {m.thinking ? (
                        <AiChatThoughtBlock
                          thinking={m.thinking}
                          durationMs={m.thinkingDurationMs}
                        />
                      ) : null}
                      <div
                        className="ai-chat-bubble ai-chat-bubble--welcome"
                        dangerouslySetInnerHTML={{
                          __html: renderAiChatMd(m.content),
                        }}
                      />
                      <AiChatMsgFooter align="start" plainText={m.content} />
                      <ul className="ai-chat-welcome-shell__tips">
                        {isBrowserAgent ? (
                          <>
                            <li>
                              Use the{" "}
                              <span className="ai-chat-tip-mcp">
                                <McpIcon size={13} />
                                <strong>MCP</strong>
                              </span>{" "}
                              tools control in the bar; <strong>Page</strong>{" "}
                              buttons add selectors or snapshot notes to your
                              message.
                            </li>
                            <li>
                              Ask in plain language: open sites, click, fill
                              forms, capture the page.
                            </li>
                          </>
                        ) : (
                          <>
                            <li>
                              Choose a <strong>Model</strong> in the bar below
                              or use <strong>Workspace settings</strong> in the
                              Chats column for API keys and the full list.
                            </li>
                            <li>
                              Use the{" "}
                              <span className="ai-chat-tip-mcp">
                                <McpIcon size={13} />
                                <strong>MCP</strong>
                              </span>{" "}
                              tools control to manage built-in and external
                              servers.
                            </li>
                          </>
                        )}
                      </ul>
                      <button
                        type="button"
                        className="ai-chat-welcome-shell__cta ai-chat-welcome-shell__cta--mcp"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => openMcpToolsModal()}
                      >
                        <McpIcon size={17} />
                        <span>Open tools</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ai-chat-msg-stack">
                    {m.thinking ? (
                      <AiChatThoughtBlock
                        thinking={m.thinking}
                        durationMs={m.thinkingDurationMs}
                      />
                    ) : null}
                    {"apiError" in m && m.apiError ? (
                      <>
                        {(m.apiError.assistantPrefix || "").trim() ? (
                          <div
                            className="ai-chat-bubble"
                            dangerouslySetInnerHTML={{
                              __html: renderAiChatMd(m.apiError.assistantPrefix!),
                            }}
                          />
                        ) : null}
                        <AiChatApiErrorBlock display={m.apiError.display} />
                        <AiChatMsgFooter
                          align="start"
                          plainText={m.content}
                          onRetry={
                            canRetryAssistant
                              ? () => setRetryExitAssistantId(m.id)
                              : undefined
                          }
                          retryDisabled={busy || retryExitAssistantId != null}
                        />
                      </>
                    ) : (m.content || "").trim() ? (
                      <>
                        <div
                          className="ai-chat-bubble"
                          dangerouslySetInnerHTML={{
                            __html: renderAiChatMd(m.content),
                          }}
                        />
                        <AiChatMsgFooter
                          align="start"
                          plainText={m.content}
                          onRetry={
                            canRetryAssistant
                              ? () => setRetryExitAssistantId(m.id)
                              : undefined
                          }
                          retryDisabled={busy || retryExitAssistantId != null}
                        />
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {streamVisible ? (
            <div
              className="ai-chat-msg ai-chat-msg--assistant ai-chat-msg--streaming"
              tabIndex={-1}
            >
              <div className="ai-chat-msg-stack">
                {streamSegments.map((seg, i) => {
                  const key =
                    seg.kind === "tool_running" || seg.kind === "tool_done"
                      ? `${i}-${seg.kind}-${seg.toolCallId}`
                      : seg.kind === "api_error"
                        ? `${i}-api_error-${seg.display.title.length}-${seg.display.detail.length}`
                        : `${i}-${seg.kind}`;
                  switch (seg.kind) {
                    case "thinking":
                      return seg.live ? (
                        <AiChatThinkingLive
                          key={key}
                          text={seg.text}
                          open={thinkingLiveOpen}
                          onOpenChange={setThinkingLiveOpen}
                        />
                      ) : (
                        <AiChatThoughtBlock key={key} thinking={seg.text} />
                      );
                    case "tool_running":
                      return <AiChatToolRunning key={key} name={seg.name} />;
                    case "tool_done":
                      return isCalculatorToolName(seg.name) ? (
                        <AiChatCalculatorToolRow
                          key={key}
                          instanceKey={seg.toolCallId}
                          toolArguments={seg.arguments}
                          content={seg.content}
                        />
                      ) : (
                        <AiChatToolResultBlock
                          key={key}
                          name={seg.name}
                          toolArguments={seg.arguments}
                          content={seg.content}
                        />
                      );
                    case "api_error": {
                      const isLast = i === streamSegments.length - 1;
                      return (
                        <Fragment key={key}>
                          <AiChatApiErrorBlock display={seg.display} />
                          {isLast ? (
                            <AiChatMsgFooter
                              align="start"
                              plainText={streamSegmentsToPlainText(streamSegments)}
                            />
                          ) : null}
                        </Fragment>
                      );
                    }
                    case "text": {
                      const isLast = i === streamSegments.length - 1;
                      return (
                        <Fragment key={key}>
                          <div
                            className="ai-chat-bubble"
                            dangerouslySetInnerHTML={{
                              __html: renderAiChatMd(seg.plain),
                            }}
                          />
                          {isLast ? (
                            <AiChatMsgFooter
                              align="start"
                              plainText={streamSegmentsToPlainText(streamSegments)}
                            />
                          ) : null}
                        </Fragment>
                      );
                    }
                    default:
                      return null;
                  }
                })}
              </div>
            </div>
          ) : null}
          </div>
        </div>
        <div
          className={`ai-chat-composer${intelligentWorkspaceShell ? " ai-chat-composer--unified" : ""}`}
        >
          {!intelligentWorkspaceShell ? (
            <>
              <div className="ai-chat-composer-toolbar">
                <div className="ai-chat-composer-toolbar__main">
                  {composerToolbarMain}
                </div>
              </div>
              {composerAttachmentChips}
              <div className="ai-chat-composer-input-row ai-chat-composer-input-row--mention-wrap">
                {composerMentionBlock}
                {composerTextarea}
                {composerSendBtn}
              </div>
            </>
          ) : (
            <>
              {composerAttachmentChips}
              <div className="ai-chat-composer-input-row ai-chat-composer-input-row--mention-wrap ai-chat-composer-input-row--iw-query">
                {composerMentionBlock}
                {composerTextarea}
              </div>
              <div className="ai-chat-composer-iw-footer">
                <div className="ai-chat-composer-toolbar__main">
                  {composerToolbarMain}
                </div>
                {composerSendBtnIw}
              </div>
            </>
          )}
        </div>
        </div>
        {showQueryRail ? (
          <AiChatQueryRail
            scrollRootRef={messagesScrollRef}
            users={queryRailUsers}
            conversationId={active?.id ?? null}
          />
        ) : null}
      </div>
      {mcpModal}
      {deleteChatModalEl}
    </div>
  );
}

let root: Root | null = null;

export function AiChatBridge(): ReactElement | null {
  useEffect(() => {
    const host = document.getElementById("aiChatReactHost");
    const messagesEl = document.getElementById("chatMessages");
    const inputArea = document.querySelector(
      ".chat-input-area",
    ) as HTMLElement | null;
    if (!host) return;
    if (!root) {
      root = createRoot(host);
      root.render(<AiChatPanel />);
    }
    host.style.display = "flex";
    messagesEl?.style.setProperty("display", "none");
    if (inputArea) inputArea.style.display = "none";
    return () => {
      /* StrictMode runs this between mount passes. Do not set #aiChatReactHost to display:none —
       * the chat column would render blank (no flex child) and remount can race badly. Keep legacy
       * nodes hidden; do not removeProperty (that briefly reveals legacy transcript). */
      messagesEl?.style.setProperty("display", "none");
      if (inputArea) inputArea.style.setProperty("display", "none");
    };
  }, []);

  return null;
}
