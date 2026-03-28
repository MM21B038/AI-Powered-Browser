import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  loadConversationStateV2,
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
} from "../../chat/conversation-store";
import { generateMessageId } from "../../chat/conversation-ids";
import {
  loadIntelligentSettings,
  saveIntelligentSettings,
  BUTCHER_BUILTIN_MCP_ID,
  mcpServerHasConnectionParams,
  mcpServerToPayload,
  type IntelligentSettingsState,
} from "../../state/session-settings-store";
import { MCP_TOOL_DEFINITIONS } from "../../../shared/mcp-tool-registry";
import { getElectronApi } from "../../services/electron-api";
import {
  appendUserMessage,
  ensureSystemMessage,
  runAiChatPipeline,
  type ChatStreamEvent,
} from "../../services/ai-chat";
import type { McpBridgeState } from "../../../shared/ipc-types";
import { ModelQuickPick } from "../ModelQuickPick";
import { friendlyMcpConnectionError } from "../../shared/mcp-error-messages";

const debouncedSave = createDebouncedSaveV2(400);

/** Stacked-layers glyph used for MCP / tool entry points in the chat UI. */
function McpLayersIcon({ className, size = 18 }: { className?: string; size?: number }): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
    </svg>
  );
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

function AiChatThoughtBlock({
  thinking,
  durationMs,
}: {
  thinking: string;
  durationMs?: number;
}): ReactElement {
  const summary =
    durationMs != null && Number.isFinite(durationMs) && durationMs >= 0
      ? `Thought · ${formatThinkingDuration(durationMs)}`
      : "Thought";
  return (
    <details className="ai-chat-thinking ai-chat-thinking--done">
      <summary>{summary}</summary>
      <div className="ai-chat-thinking-stream-body">{thinking}</div>
    </details>
  );
}

function AiChatThinkingLive({ text }: { text: string }): ReactElement {
  return (
    <details className="ai-chat-thinking ai-chat-thinking--live">
      <summary className="ai-chat-thinking-live-summary">
        <span className="ai-chat-thinking-live-label">Thinking</span>
        <span className="ai-chat-thinking-live-dots" aria-hidden />
        <span className="ai-chat-thinking-live-chev" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="ai-chat-thinking-stream-body">{text}</div>
    </details>
  );
}

function IconCopy(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconEdit(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconSendPlane(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
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
}: {
  align: "start" | "end";
  plainText: string;
  onEdit?: () => void;
  showEdit?: boolean;
  editDisabled?: boolean;
}): ReactElement {
  return (
    <div className={`ai-chat-msg-footer ai-chat-msg-footer--${align}`}>
      <button
        type="button"
        className="ai-chat-msg-icon-btn"
        title="Copy message"
        aria-label="Copy message"
        onClick={() => void copyPlainTextToClipboard(plainText)}
      >
        <IconCopy />
      </button>
      {showEdit && onEdit ? (
        <button
          type="button"
          className="ai-chat-msg-icon-btn"
          title="Edit message"
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
  const w = document.getElementById("appContainer")?.getAttribute("data-shell-workspace");
  return w === "intelligent" ? "intelligent" : "browser";
}

type PipelineResult = { toolMsgs: ChatMessageV2[]; assistantBuf: string; thinkingBuf: string };

async function runChatPipelineRound(
  scope: ChatScope,
  api: NonNullable<ReturnType<typeof getElectronApi>>,
  storedMessages: ChatMessageV2[],
  onStream: (assistantBuf: string, toolLines: string[], thinkingBuf: string) => void,
): Promise<PipelineResult> {
  const toolMsgs: ChatMessageV2[] = [];
  let assistantBuf = "";
  let thinkingBuf = "";
  const toolLineList: string[] = [];

  const onEvent = (e: ChatStreamEvent) => {
    if (e.type === "assistant_delta") {
      assistantBuf += e.text;
      onStream(assistantBuf, toolLineList, thinkingBuf);
    } else if (e.type === "thinking") {
      thinkingBuf += e.text;
      onStream(assistantBuf, toolLineList, thinkingBuf);
    } else if (e.type === "tool_start") {
      toolLineList.push(`→ ${e.name}…`);
      onStream(assistantBuf, [...toolLineList], thinkingBuf);
    } else if (e.type === "tool_end") {
      toolMsgs.push({
        id: generateMessageId(),
        role: "tool",
        toolCallId: e.toolCallId,
        name: e.name,
        content: e.fullResult,
      });
      toolLineList.push(`✓ ${e.name}`);
      onStream(assistantBuf, [...toolLineList], thinkingBuf);
    } else if (e.type === "error") {
      assistantBuf += `\n\n_Error: ${e.message}_`;
      onStream(assistantBuf, toolLineList, thinkingBuf);
    } else if (e.type === "done") {
      onStream(assistantBuf, toolLineList, thinkingBuf);
    }
  };

  await runAiChatPipeline({
    scope,
    settings: loadIntelligentSettings(),
    api,
    messages: ensureSystemMessage(storedMessages, scope),
    onEvent,
  });

  return { toolMsgs, assistantBuf, thinkingBuf };
}

function AiChatPanel(): ReactElement {
  const api = getElectronApi();
  const [scope, setScope] = useState<ChatScope>(() => scopeFromDom());
  const [store, setStore] = useState<ConversationStoreStateV2>(() => loadConversationStateV2());
  const [settings, setSettings] = useState<IntelligentSettingsState>(() => loadIntelligentSettings());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamThinking, setStreamThinking] = useState("");
  const [toolLines, setToolLines] = useState<string[]>([]);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpBridge, setMcpBridge] = useState<McpBridgeState | null>(null);
  const [butcherToolsExpanded, setButcherToolsExpanded] = useState(false);
  const [expandedMcpIds, setExpandedMcpIds] = useState<Set<string>>(() => new Set());
  const [externalToolsByServer, setExternalToolsByServer] = useState<
    Record<string, { status: "idle" | "loading" | "ok" | "err"; tools: Array<{ name: string; description?: string }>; error?: string }>
  >({});
  const [editModal, setEditModal] = useState<{ messageId: string; text: string } | null>(null);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{ id: string; title: string } | null>(null);
  const streamRef = useRef("");
  const thinkingStartRef = useRef<number | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustComposerHeight = useCallback(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight);
    const fontSize = parseFloat(cs.fontSize) || 12;
    const line = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fontSize * 1.45;
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
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
      setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${t.trim()}` : t.trim()));
      queueMicrotask(() => {
        composerTextareaRef.current?.focus();
        adjustComposerHeight();
      });
    };
    window.addEventListener("ai-chat-append-composer", onAppend as EventListener);
    return () => window.removeEventListener("ai-chat-append-composer", onAppend as EventListener);
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
    return () => window.removeEventListener("butcher-intelligent-settings-saved", onSaved);
  }, []);

  useEffect(() => {
    if (scope !== "browser") return;
    setStore((s) => setScopedStore(s, "browser", normalizeBrowserScoped(s.browser)));
  }, [scope]);

  useEffect(() => {
    const el = document.querySelector(".chat-title");
    if (el) el.textContent = scope === "browser" ? "Browser Agent" : "AI Assistant";
  }, [scope]);

  const scoped = useMemo(() => getScopedStore(store, scope), [store, scope]);

  const active = useMemo(() => {
    const a = scoped.conversations.find((c) => c.id === scoped.activeConversationId) ?? null;
    if (a) return a;
    return scoped.conversations[0] ?? null;
  }, [scoped]);

  const nonSystemMessages = useMemo(
    () => active?.messages.filter((m) => m.role !== "system") ?? [],
    [active?.messages],
  );
  const welcomeSpotlightMessageId = useMemo(() => {
    if (busy || streamText || streamThinking || toolLines.length > 0) return null;
    if (nonSystemMessages.length !== 1) return null;
    const only = nonSystemMessages[0];
    return only && only.role === "assistant" ? only.id : null;
  }, [busy, nonSystemMessages, streamText, streamThinking, toolLines.length]);

  useEffect(() => {
    if (scoped.conversations.length === 0) return;
    const ok =
      scoped.activeConversationId && scoped.conversations.some((c) => c.id === scoped.activeConversationId);
    if (!ok) {
      setStore((s) =>
        setScopedStore(s, scope, {
          ...getScopedStore(s, scope),
          activeConversationId: getScopedStore(s, scope).conversations[0]?.id ?? null,
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

  const persistSettings = useCallback((next: IntelligentSettingsState) => {
    setSettings(next);
    saveIntelligentSettings(next);
  }, []);

  const runSendWithText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      const conv = active;
      if (!text || !api || !conv || busy) return;
      setBusy(true);
      setStreamText("");
      setStreamThinking("");
      setToolLines([]);
      streamRef.current = "";
      thinkingStartRef.current = null;

      const stored = appendUserMessage([...conv.messages], text);
      const convUpdated: Conversation = {
        ...conv,
        messages: stored,
        updatedAt: Date.now(),
        title:
          scope === "browser"
            ? "Browser agent"
            : conv.messages.filter((m) => m.role === "user").length === 0
              ? titleFromFirstLine(text)
              : conv.title,
      };
      updateScoped({
        ...scoped,
        activeConversationId: conv.id,
        conversations: scoped.conversations.map((c) => (c.id === conv.id ? convUpdated : c)),
      });

      const convId = conv.id;
      try {
        const { toolMsgs, assistantBuf, thinkingBuf } = await runChatPipelineRound(scope, api, stored, (buf, lines, think) => {
          if (think.trim() && thinkingStartRef.current === null) thinkingStartRef.current = Date.now();
          streamRef.current = buf;
          setStreamText(buf);
          setStreamThinking(think);
          setToolLines(lines);
        });

        const finalMessages: ChatMessageV2[] = [...stored, ...toolMsgs];
        if (assistantBuf.trim()) {
          const t = thinkingBuf.trim();
          let thinkingDurationMs: number | undefined;
          if (t && thinkingStartRef.current != null) {
            thinkingDurationMs = Date.now() - thinkingStartRef.current;
          }
          thinkingStartRef.current = null;
          finalMessages.push({
            id: generateMessageId(),
            role: "assistant",
            content: assistantBuf.trim(),
            ...(t ? { thinking: t } : {}),
            ...(thinkingDurationMs != null && t ? { thinkingDurationMs } : {}),
          });
        } else {
          thinkingStartRef.current = null;
        }

        setStore((s) => {
          const sc = getScopedStore(s, scope);
          return setScopedStore(s, scope, {
            ...sc,
            activeConversationId: convId,
            conversations: sc.conversations.map((c) =>
              c.id === convId ? { ...c, messages: finalMessages, updatedAt: Date.now() } : c,
            ),
          });
        });
      } finally {
        setBusy(false);
        setStreamText("");
        setStreamThinking("");
        setToolLines([]);
      }
    },
    [api, active, busy, scope, scoped, updateScoped],
  );

  const runPipelineAfterEdit = useCallback(async (convId: string, stored: ChatMessageV2[]) => {
    if (!api) return;
    setBusy(true);
    setStreamText("");
    setStreamThinking("");
    setToolLines([]);
    thinkingStartRef.current = null;
    try {
      const { toolMsgs, assistantBuf, thinkingBuf } = await runChatPipelineRound(scope, api, stored, (buf, lines, think) => {
        if (think.trim() && thinkingStartRef.current === null) thinkingStartRef.current = Date.now();
        setStreamText(buf);
        setStreamThinking(think);
        setToolLines(lines);
      });

      const finalMessages: ChatMessageV2[] = [...stored, ...toolMsgs];
      if (assistantBuf.trim()) {
        const t = thinkingBuf.trim();
        let thinkingDurationMs: number | undefined;
        if (t && thinkingStartRef.current != null) {
          thinkingDurationMs = Date.now() - thinkingStartRef.current;
        }
        thinkingStartRef.current = null;
        finalMessages.push({
          id: generateMessageId(),
          role: "assistant",
          content: assistantBuf.trim(),
          ...(t ? { thinking: t } : {}),
          ...(thinkingDurationMs != null && t ? { thinkingDurationMs } : {}),
        });
      } else {
        thinkingStartRef.current = null;
      }

      setStore((s) => {
        const sc = getScopedStore(s, scope);
        return setScopedStore(s, scope, {
          ...sc,
          conversations: sc.conversations.map((c) =>
            c.id === convId ? { ...c, messages: finalMessages, updatedAt: Date.now() } : c,
          ),
        });
      });
    } finally {
      setBusy(false);
      setStreamText("");
      setStreamThinking("");
      setToolLines([]);
    }
  }, [api, scope]);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await runSendWithText(text);
  }, [input, runSendWithText]);

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
          return setScopedStore(s, "browser", { conversations: [c], activeConversationId: c.id });
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
        return setScopedStore(s, "browser", { conversations: [cleared], activeConversationId: cleared.id });
      });
      return;
    }
    const c = createNewConversation(scope, "New chat");
    updateScoped({
      conversations: scoped.conversations.map((x) => (x.id === active.id ? c : x)),
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
        return setScopedStore(s, scope, { conversations: [c], activeConversationId: c.id });
      }
      const nextActive =
        sc.activeConversationId === id ? rest[0]!.id : sc.activeConversationId ?? rest[0]!.id;
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

  const openEditUserMessage = useCallback((messageId: string, content: string) => {
    setEditModal({ messageId, text: content });
  }, []);

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
    const newUser: ChatMessageV2 = {
      id: generateMessageId(),
      role: "user",
      content: edited,
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
        conversations: sc.conversations.map((c) => (c.id === convId ? convUpdated : c)),
      });
    });
    setEditModal(null);

    await runPipelineAfterEdit(convId, stored);
  }, [active, busy, editModal, runPipelineAfterEdit, scope]);

  useEffect(() => {
    (window as unknown as { __aiChatSubmit?: (t: string) => void }).__aiChatSubmit = (t: string) => {
      void runSendWithText(t);
    };
    (window as unknown as { __aiChatNewConversation?: () => void }).__aiChatNewConversation = newChat;
    (window as unknown as { __aiChatClearConversation?: () => void }).__aiChatClearConversation = clearChat;
    return () => {
      delete (window as unknown as { __aiChatSubmit?: (t: string) => void }).__aiChatSubmit;
      delete (window as unknown as { __aiChatNewConversation?: () => void }).__aiChatNewConversation;
      delete (window as unknown as { __aiChatClearConversation?: () => void }).__aiChatClearConversation;
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
    const sorted = [...scoped.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    list.innerHTML = "";
    for (const c of sorted) {
      const wrap = document.createElement("div");
      wrap.className = "chat-history-row-wrap";
      if (c.id === scoped.activeConversationId) wrap.classList.add("chat-history-row-wrap--active");

      const row = document.createElement("button");
      row.type = "button";
      row.className = "chat-history-row";
      if (c.id === scoped.activeConversationId) row.classList.add("chat-history-row--active");
      row.textContent = c.title || "Chat";
      row.title = c.title || "Chat";
      row.onclick = () => {
        setStore((s) => {
          const sc = getScopedStore(s, scope);
          return setScopedStore(s, scope, { ...sc, activeConversationId: c.id });
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
  }, [scope, scoped.conversations, scoped.activeConversationId, openDeleteChatModal]);

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

  const renderMd = (md: string) => {
    const raw = marked.parse(md, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  };

  const isBrowserAgent = scope === "browser";
  /** Defer open so the same pointer sequence isn’t eaten by focus / shell handlers (fixes flaky first click in intelligent workspace). */
  const openMcpToolsModal = useCallback(() => {
    queueMicrotask(() => setMcpModalOpen(true));
  }, []);
  const toggleScope = isBrowserAgent ? settings.mcpTogglesBrowser : settings.mcpTogglesIntelligent;
  const setConn = (id: string, v: boolean) => {
    if (isBrowserAgent && id === BUTCHER_BUILTIN_MCP_ID) return;
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
    async (s: (typeof settings.mcpServers)[0]) => {
      if (!mcpServerHasConnectionParams(s)) return;
      setExternalToolsByServer((prev) => ({
        ...prev,
        [s.id]: prev[s.id]?.status === "ok" ? prev[s.id]! : { status: "loading", tools: [] },
      }));
      const payload = mcpServerToPayload(s);
      try {
        if (!api) throw new Error("Bridge not ready");
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
            tools: res.tools.map((t) => ({ name: t.name, description: t.description })),
          },
        }));
      } catch (err) {
        setExternalToolsByServer((prev) => ({
          ...prev,
          [s.id]: {
            status: "err",
            tools: [],
            error: friendlyMcpConnectionError(err instanceof Error ? err.message : String(err)),
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <h2 id="ai-chat-mcp-modal-title" className="ai-chat-mcp-modal__title">
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
                    {isBrowserAgent ? "Butcher (browser automation)" : "Butcher (built-in)"}
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
                    <span className="ai-chat-mcp-toggle__label">Connection</span>
                    <span className="ai-chat-mcp-connection-pill" title="Cannot be disabled for Browser Agent">
                      Always on
                    </span>
                  </div>
                ) : (
                  <div className="ai-chat-mcp-toggle">
                    <span className="ai-chat-mcp-toggle__label">On</span>
                    <SlideToggle
                      on={toggleScope.connectionEnabled[BUTCHER_BUILTIN_MCP_ID] !== false}
                      onToggle={() =>
                        setConn(BUTCHER_BUILTIN_MCP_ID, !(toggleScope.connectionEnabled[BUTCHER_BUILTIN_MCP_ID] !== false))
                      }
                      ariaLabel="Butcher MCP connection"
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
                <span className="ai-chat-mcp-card__expand-chevron" aria-hidden />
                {butcherToolsExpanded ? "Hide tools" : "Show tools"}
              </button>
              {butcherToolsExpanded ? (
                <div className="ai-chat-mcp-tool-grid">
                  {MCP_TOOL_DEFINITIONS.map((def) => (
                    <div key={def.name} className="ai-chat-mcp-tool-row">
                      <SlideToggle
                        on={toggleScope.toolEnabled[BUTCHER_BUILTIN_MCP_ID]?.[def.name] !== false}
                        onToggle={() =>
                          setToolT(
                            BUTCHER_BUILTIN_MCP_ID,
                            def.name,
                            !(toggleScope.toolEnabled[BUTCHER_BUILTIN_MCP_ID]?.[def.name] !== false),
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

            {!isBrowserAgent &&
              settings.mcpServers.map((s) => {
              const expanded = expandedMcpIds.has(s.id);
              const ext = externalToolsByServer[s.id];
              return (
                <div key={s.id} className="ai-chat-mcp-card">
                  <div className="ai-chat-mcp-card__header">
                    <div>
                      <div className="ai-chat-mcp-card__name">{s.name || s.id}</div>
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
                        onToggle={() => setConn(s.id, !(toggleScope.connectionEnabled[s.id] !== false))}
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
                          queueMicrotask(() => void ensureExternalToolsLoaded(s));
                        } else next.delete(s.id);
                        return next;
                      });
                    }}
                  >
                    <span className="ai-chat-mcp-card__expand-chevron" aria-hidden />
                    {expanded ? "Hide tools" : "Show tools"}
                  </button>
                  {expanded ? (
                    <div className="ai-chat-mcp-tool-grid">
                      {!mcpServerHasConnectionParams(s) ? (
                        <p className="ai-chat-mcp-card__meta">Configure this server in Settings to list tools.</p>
                      ) : ext?.status === "loading" ? (
                        <div className="ai-chat-mcp-loading" aria-live="polite">
                          <span className="ai-chat-mcp-loading__dot" />
                          <span className="ai-chat-mcp-loading__dot" />
                          <span className="ai-chat-mcp-loading__dot" />
                          <span className="ai-chat-mcp-loading__label">Fetching tools…</span>
                        </div>
                      ) : ext?.status === "err" ? (
                        <p className="ai-chat-mcp-card__meta ai-chat-mcp-card__err">{ext.error}</p>
                      ) : ext?.status === "ok" && ext.tools.length === 0 ? (
                        <p className="ai-chat-mcp-card__meta">No tools reported.</p>
                      ) : (
                        ext?.tools.map((t) => (
                          <div key={t.name} className="ai-chat-mcp-tool-row">
                            <SlideToggle
                              on={toggleScope.toolEnabled[s.id]?.[t.name] !== false}
                              onToggle={() =>
                                setToolT(s.id, t.name, !(toggleScope.toolEnabled[s.id]?.[t.name] !== false))
                              }
                              ariaLabel={`Tool ${t.name}`}
                            />
                            <div className="ai-chat-mcp-tool-row__text">
                              <span className="ai-chat-mcp-tool-row__name">{t.name}</span>
                              {t.description ? (
                                <span className="ai-chat-mcp-tool-row__desc">{t.description}</span>
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

  const editModalEl =
    editModal &&
    createPortal(
      <div
        className="ai-chat-floating-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setEditModal(null);
        }}
      >
        <div
          className="ai-chat-floating-panel ai-chat-floating-panel--edit ai-chat-edit-modal"
          role="dialog"
          aria-label="Edit message"
        >
          <h3 className="ai-chat-edit-modal__title">Edit message</h3>
          <p className="ai-chat-floating-panel__hint">
            Saving removes this message and everything after it, then resends to the model.
          </p>
          <textarea
            className="ai-chat-edit-modal__textarea"
            rows={6}
            value={editModal.text}
            onChange={(e) => setEditModal({ ...editModal, text: e.target.value })}
          />
          <div className="ai-chat-edit-modal__actions">
            <button type="button" className="ai-chat-icon-btn" onClick={() => setEditModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="ai-chat-edit-modal__submit"
              disabled={busy || !editModal.text.trim()}
              onClick={() => void saveEditAndResend()}
            >
              Save &amp; resend
            </button>
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
            This removes <span className="ai-chat-delete-modal__chat-title">{pendingDeleteChat.title}</span> and all
            messages in it. This cannot be undone.
          </p>
          <div className="ai-chat-delete-modal__actions">
            <button type="button" className="ai-chat-delete-modal__btn ai-chat-delete-modal__btn--cancel" onClick={() => setPendingDeleteChat(null)}>
              Cancel
            </button>
            <button type="button" className="ai-chat-delete-modal__btn ai-chat-delete-modal__btn--danger" onClick={() => confirmPendingDeleteChat()}>
              Delete chat
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-main">
        <div className="ai-chat-messages-scroll">
          {!active || nonSystemMessages.length === 0 ? (
            <div className="ai-chat-idle ai-chat-idle--empty">
              <div className="ai-chat-idle__aurora" aria-hidden />
              <div className="ai-chat-idle__content">
                <p className="ai-chat-idle__title">{isBrowserAgent ? "Browser Agent" : "AI Assistant"}</p>
                <p className="ai-chat-idle__subtitle">Start a conversation below.</p>
              </div>
            </div>
          ) : null}
          {active?.messages.map((m) => {
            if (m.role === "system") return null;
            if (m.role === "tool")
              return (
                <div key={m.id} className="ai-chat-msg ai-chat-msg--tool">
                  <span className="ai-chat-tool-label">
                    <McpLayersIcon size={14} className="ai-chat-tool-label__glyph" />
                    <span className="ai-chat-tool-label__name">{m.name?.trim() || "Tool result"}</span>
                  </span>
                  <pre className="ai-chat-tool-json">{m.content.slice(0, 2000)}</pre>
                </div>
              );
            if (m.role === "user")
              return (
                <div key={m.id} className="ai-chat-msg ai-chat-msg--user" tabIndex={-1}>
                  <div className="ai-chat-msg-stack">
                    <div className="ai-chat-bubble" dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                    <AiChatMsgFooter
                      align="end"
                      plainText={m.content}
                      showEdit={scope === "intelligent"}
                      editDisabled={busy}
                      onEdit={
                        scope === "intelligent" ? () => openEditUserMessage(m.id, m.content) : undefined
                      }
                    />
                  </div>
                </div>
              );
            const isWelcomeSpotlight = m.id === welcomeSpotlightMessageId;
            return (
              <div
                key={m.id}
                className={`ai-chat-msg ai-chat-msg--assistant${isWelcomeSpotlight ? " ai-chat-msg--welcome-spotlight" : ""}`}
                tabIndex={-1}
              >
                {isWelcomeSpotlight ? (
                  <div className="ai-chat-welcome-shell">
                    <div className="ai-chat-welcome-shell__aurora" aria-hidden />
                    <div className="ai-chat-welcome-shell__card">
                      <div className="ai-chat-welcome-shell__icon" aria-hidden>
                        {isBrowserAgent ? (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="4" width="18" height="14" rx="2" />
                            <path d="M7 20h10M12 18v2" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-.46 0-.91-.03-1.35-.09L5 21l1.35-4.38C5.48 15.42 3 13.41 3 11c0-4.42 4.03-8 9-8z" />
                          </svg>
                        )}
                      </div>
                      {m.thinking ? (
                        <AiChatThoughtBlock thinking={m.thinking} durationMs={m.thinkingDurationMs} />
                      ) : null}
                      <div
                        className="ai-chat-bubble ai-chat-bubble--welcome"
                        dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}
                      />
                      <AiChatMsgFooter align="start" plainText={m.content} />
                      <ul className="ai-chat-welcome-shell__tips">
                        {isBrowserAgent ? (
                          <>
                            <li>
                              Use the{" "}
                              <span className="ai-chat-tip-mcp">
                                <McpLayersIcon size={13} />
                                <strong>MCP</strong>
                              </span>{" "}
                              tools control in the bar; <strong>Page</strong> buttons add selectors or snapshot notes
                              to your message.
                            </li>
                            <li>Ask in plain language: open sites, click, fill forms, capture the page.</li>
                          </>
                        ) : (
                          <>
                            <li>
                              Choose a <strong>Model</strong> in the bar below or use <strong>Workspace settings</strong>{" "}
                              in the Chats column for API keys and the full list.
                            </li>
                            <li>
                              Use the{" "}
                              <span className="ai-chat-tip-mcp">
                                <McpLayersIcon size={13} />
                                <strong>MCP</strong>
                              </span>{" "}
                              tools control to manage built-in and external servers.
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
                        <McpLayersIcon size={17} />
                        <span>Open tools</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ai-chat-msg-stack">
                    {m.thinking ? (
                      <AiChatThoughtBlock thinking={m.thinking} durationMs={m.thinkingDurationMs} />
                    ) : null}
                    <div className="ai-chat-bubble" dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                    <AiChatMsgFooter align="start" plainText={m.content} />
                  </div>
                )}
              </div>
            );
          })}
          {streamText || streamThinking ? (
            <div className="ai-chat-msg ai-chat-msg--assistant ai-chat-msg--streaming" tabIndex={-1}>
              <div className="ai-chat-msg-stack">
                {streamThinking ? <AiChatThinkingLive text={streamThinking} /> : null}
                {streamText ? (
                  <div className="ai-chat-bubble" dangerouslySetInnerHTML={{ __html: renderMd(streamText) }} />
                ) : null}
                {streamText ? <AiChatMsgFooter align="start" plainText={streamText} /> : null}
              </div>
            </div>
          ) : null}
          {toolLines.length > 0 ? (
            <div className="ai-chat-tool-tray">
              {toolLines.map((t, i) => (
                <div key={i} className="ai-chat-tool-line">
                  {t}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="ai-chat-composer">
          <div className="ai-chat-composer-toolbar">
            <div className="ai-chat-composer-toolbar__main">
              <button
                type="button"
                className="ai-chat-icon-btn ai-chat-icon-btn--mcp"
                title={isBrowserAgent ? "Browser automation & MCP tools" : "MCP & tools"}
                aria-label={isBrowserAgent ? "Browser automation and MCP tools" : "MCP and tools"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => openMcpToolsModal()}
              >
                <McpLayersIcon size={17} />
              </button>
              <span className="ai-chat-composer-toolbar__sep" aria-hidden />
              <ModelQuickPick
                selectedModelId={settings.selectedModelId}
                modelIds={settings.cachedModelIds}
                disabled={busy}
                onSelect={(id) => persistSettings({ ...settings, selectedModelId: id })}
                onOpenAssistantSettings={() => window.legacyBrowser?.openIntelligentAssistantSettings?.()}
              />
              {isBrowserAgent ? (
                <>
                  <span className="ai-chat-composer-toolbar__sep" aria-hidden />
                  <span className="ai-chat-composer-toolbar__group-label">Page</span>
                  <button
                    type="button"
                    className="ai-chat-icon-btn ai-chat-icon-btn--compact"
                    title="Pick any element — append CSS selector and details to the message"
                    onClick={() => window.legacyBrowser?.startBrowserPagePickerAny?.()}
                  >
                    CSS
                  </button>
                  <button
                    type="button"
                    className="ai-chat-icon-btn ai-chat-icon-btn--compact"
                    title="Pick a clickable control — append target details to the message"
                    onClick={() => window.legacyBrowser?.startBrowserPagePickerInteractive?.()}
                  >
                    Target
                  </button>
                  <button
                    type="button"
                    className="ai-chat-icon-btn ai-chat-icon-btn--compact"
                    title="Click a region to save a snapshot — filename is added to the message"
                    onClick={() => window.legacyBrowser?.startBrowserPageElementScreenshot?.()}
                  >
                    Snap
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="ai-chat-composer-input-row">
            <textarea
              ref={composerTextareaRef}
              className="ai-chat-textarea"
              rows={COMPOSER_MIN_LINES}
              placeholder={isBrowserAgent ? "Tell the browser agent what to do…" : "Message the assistant…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <button
              type="button"
              className="ai-chat-send"
              disabled={busy || !input.trim()}
              aria-label="Send"
              title="Send"
              onClick={() => void onSend()}
            >
              <IconSendPlane />
            </button>
          </div>
        </div>
      </div>
      {mcpModal}
      {editModalEl}
      {deleteChatModalEl}
    </div>
  );
}

let root: Root | null = null;

export function AiChatBridge(): ReactElement | null {
  useEffect(() => {
    const host = document.getElementById("aiChatReactHost");
    const messagesEl = document.getElementById("chatMessages");
    const inputArea = document.querySelector(".chat-input-area") as HTMLElement | null;
    if (!host) return;
    if (!root) {
      root = createRoot(host);
      root.render(<AiChatPanel />);
    }
    host.style.display = "flex";
    messagesEl?.style.setProperty("display", "none");
    if (inputArea) inputArea.style.display = "none";
    return () => {
      host.style.display = "none";
      messagesEl?.style.removeProperty("display");
      if (inputArea) inputArea.style.removeProperty("display");
    };
  }, []);

  return null;
}
