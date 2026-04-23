/**
 * Persisted chat: dual Browser vs Intelligent workspaces, multi-role messages (v2).
 */

import { getElectronApi } from "../services/electron-api";
import type { ChatApiErrorDisplay } from "../services/api-error-format";
import { generateMessageId } from "./conversation-ids";

export const CHAT_STORAGE_KEY = "butcher.chat.conversations.v1";
export const CHAT_STORAGE_KEY_V2 = "butcher.chat.v2";
export const SHELL_WORKSPACE_KEY = "butcher.shell.workspace.v1";
export const INTELLIGENT_CHAT_MODE_KEY = "butcher.chat.intelligent.mode.v1";

export type ChatScope = "browser" | "intelligent";
export type IntelligentChatMode = "assistant" | "ui";

/** User-attached files (composer); stored as base64 for persistence and Python sandbox injection. */
export type ChatAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Raw base64 (no data: prefix). */
  dataBase64: string;
};

/** Legacy v1 message kinds (migration). */
export type ChatMessageLegacy =
  | { id: string; kind: "user"; markdown: string }
  | { id: string; kind: "assistant"; markdown: string }
  | { id: string; kind: "screenshot_sent"; dataUrl: string; filename: string }
  | {
      id: string;
      kind: "picker";
      selector: string;
      tag: string;
      type: string;
      text: string;
      canFill: boolean;
      isCheckable: boolean;
    };

/** OpenAI-style transcript + optional thinking on assistant. */
export type ChatMessageV2 =
  | { id: string; role: "system"; content: string }
  | { id: string; role: "user"; content: string; attachments?: ChatAttachment[] }
  | {
      id: string;
      role: "assistant";
      content: string;
      /** A2UI v0.9 JSONL lines extracted from the model reply (rendered natively when set). */
      a2uiV09Jsonl?: string;
      thinking?: string;
      /** Wall-clock duration of the thinking stream, for “Thought · 2.1s” UI. */
      thinkingDurationMs?: number;
      /** Structured API/network error UI; `content` is assistant-visible text only (no error blob). */
      apiError?: {
        display: ChatApiErrorDisplay;
        /** Assistant text streamed before the error, if any. */
        assistantPrefix?: string;
      };
    }
  | {
      id: string;
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
      /** JSON string of arguments passed to the tool (model output). */
      arguments?: string;
      /**
       * Gemini API: opaque `thought_signature` from the model’s function call part.
       * Must be echoed on `function` when replaying history or Google returns HTTP 400.
       */
      thoughtSignature?: string;
    };

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  scope: ChatScope;
  /** Intelligent-only: Assistant (default) vs UI-only (A2UI). */
  mode?: IntelligentChatMode;
  messages: ChatMessageV2[];
};

export type ScopedStore = {
  conversations: Conversation[];
  activeConversationId: string | null;
};

export type ConversationStoreStateV2 = {
  version: 2;
  browser: ScopedStore;
  intelligent: ScopedStore;
};

/** First assistant message for the single Browser Agent chat (shown after clear / new install). */
export const DEFAULT_WELCOME_BROWSER = `I'm your **Browser Agent** for this workspace. I control the real browser only through **Butcher MCP tools** (tabs, navigation, clicks, forms, screenshots, etc.).

Pick **Tools** in the chat bar to enable or disable individual tools. Use **Clear** in the header when you want a fresh thread (same session; history resets).

Ask me to open sites, fill forms, extract what you see, or automate steps across tabs.`;

const DEFAULT_WELCOME_INTELLIGENT = `Hi — I'm your assistant in this workspace. I can explain things, write or refine text, reason through problems, and **use tools** (browser automation and any MCP servers you've connected) when that helps answer you.

Add your API key and model under **Settings**. Open **MCP** here to toggle connections and tools per workspace.`;

export function generateConversationId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortConversationsByUpdated(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt;
}

function emptyScoped(): ScopedStore {
  return { conversations: [], activeConversationId: null };
}

function isChatAttachment(x: unknown): x is ChatAttachment {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.mime === "string" &&
    typeof a.size === "number" &&
    Number.isFinite(a.size) &&
    typeof a.dataBase64 === "string"
  );
}

function isChatApiErrorDisplayObj(x: unknown): x is ChatApiErrorDisplay {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  const sev = d.severity;
  if (sev !== "error" && sev !== "warning" && sev !== "info") return false;
  if (typeof d.title !== "string" || typeof d.detail !== "string") return false;
  if (d.httpStatus !== undefined && typeof d.httpStatus !== "number") return false;
  if (d.codeLabel !== undefined && typeof d.codeLabel !== "string") return false;
  return true;
}

function isAssistantApiErrorBundle(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!isChatApiErrorDisplayObj(o.display)) return false;
  if (o.assistantPrefix !== undefined && typeof o.assistantPrefix !== "string")
    return false;
  return true;
}

function isChatMessageV2(x: unknown): x is ChatMessageV2 {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.role !== "string") return false;
  switch (m.role) {
    case "system":
      return typeof m.content === "string";
    case "assistant": {
      if (typeof m.content !== "string") return false;
      if (m.thinking !== undefined && typeof m.thinking !== "string") return false;
      if (m.thinkingDurationMs !== undefined && typeof m.thinkingDurationMs !== "number")
        return false;
      if (m.apiError !== undefined && !isAssistantApiErrorBundle(m.apiError)) return false;
      return true;
    }
    case "user": {
      if (typeof m.content !== "string") return false;
      if (m.attachments === undefined) return true;
      if (!Array.isArray(m.attachments)) return false;
      return m.attachments.every(isChatAttachment);
    }
    case "tool": {
      const tm = m as Record<string, unknown>;
      return (
        typeof tm.toolCallId === "string" &&
        typeof tm.name === "string" &&
        typeof tm.content === "string" &&
        (tm.arguments === undefined || typeof tm.arguments === "string") &&
        (tm.thoughtSignature === undefined || typeof tm.thoughtSignature === "string")
      );
    }
    default:
      return false;
  }
}

function isConversation(x: unknown): x is Conversation {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.title !== "string" || typeof c.updatedAt !== "number")
    return false;
  const scope = c.scope;
  if (scope !== "browser" && scope !== "intelligent") return false;
  const mode = c.mode;
  if (
    mode !== undefined &&
    mode !== "assistant" &&
    mode !== "ui"
  )
    return false;
  const msgs = c.messages;
  if (!Array.isArray(msgs)) return false;
  return msgs.every(isChatMessageV2);
}

function migrateLegacyMessage(m: ChatMessageLegacy): ChatMessageV2 | null {
  if (m.kind === "user") return { id: m.id, role: "user", content: m.markdown };
  if (m.kind === "assistant") return { id: m.id, role: "assistant", content: m.markdown };
  return null;
}

function migrateV1ToScoped(legacyConversations: LegacyConversationV1[]): ScopedStore {
  const conversations: Conversation[] = [];
  for (const c of legacyConversations) {
    const msgs: ChatMessageV2[] = [];
    for (const m of c.messages) {
      const conv = migrateLegacyMessage(m as ChatMessageLegacy);
      if (conv) msgs.push(conv);
    }
    if (msgs.length === 0) {
      msgs.push({
        id: generateMessageId(),
        role: "assistant",
        content: DEFAULT_WELCOME_INTELLIGENT,
      });
    }
    conversations.push({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      scope: "intelligent",
      mode: "assistant",
      messages: msgs,
    });
  }
  return {
    conversations: conversations.sort(sortConversationsByUpdated),
    activeConversationId: conversations[0]?.id ?? null,
  };
}

type LegacyConversationV1 = {
  id: string;
  title: string;
  updatedAt: number;
  messages: unknown[];
};

function loadV1Raw(): LegacyConversationV1[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const o = parsed as Record<string, unknown>;
    const conversations = Array.isArray(o.conversations) ? o.conversations : [];
    return conversations.filter(
      (c): c is LegacyConversationV1 =>
        !!c &&
        typeof c === "object" &&
        typeof (c as LegacyConversationV1).id === "string" &&
        typeof (c as LegacyConversationV1).title === "string",
    );
  } catch {
    return [];
  }
}

export function loadConversationStateV2(): ConversationStoreStateV2 {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        if (o.version === 2) {
          const br = o.browser as unknown;
          const intel = o.intelligent as unknown;
          const browser = normalizeBrowserScoped(parseScoped(br, "browser"));
          const intelligent = parseScoped(intel, "intelligent");
          return { version: 2, browser, intelligent };
        }
      }
    }
  } catch {
    /* fall through */
  }

  const legacy = loadV1Raw();
  const intelligentScoped = migrateV1ToScoped(legacy);
  let browserScoped: ScopedStore =
    intelligentScoped.conversations.length > 0
      ? {
          conversations: [],
          activeConversationId: null,
        }
      : emptyScoped();

  if (browserScoped.conversations.length === 0 && !browserScoped.activeConversationId) {
    const c = createNewConversation("browser", "Browser agent");
    browserScoped = { conversations: [c], activeConversationId: c.id };
  }
  browserScoped = normalizeBrowserScoped(browserScoped);
  if (intelligentScoped.conversations.length === 0 && !intelligentScoped.activeConversationId) {
    const c = createNewConversation("intelligent", "New chat", {
      mode: loadLastIntelligentChatMode(),
    });
    intelligentScoped.conversations = [c];
    intelligentScoped.activeConversationId = c.id;
  }

  const state: ConversationStoreStateV2 = {
    version: 2,
    browser: browserScoped,
    intelligent: intelligentScoped,
  };
  saveConversationStateV2(state);
  return state;
}

function parseScoped(raw: unknown, scope: ChatScope): ScopedStore {
  if (!raw || typeof raw !== "object") return emptyScoped();
  const o = raw as Record<string, unknown>;
  const convs = Array.isArray(o.conversations) ? o.conversations : [];
  const conversations = convs
    .filter((c): c is Conversation => isConversation(c))
    .map((c) => ({ ...c, scope }));
  const activeId = typeof o.activeConversationId === "string" ? o.activeConversationId : null;
  return {
    conversations: conversations.sort(sortConversationsByUpdated),
    activeConversationId: activeId,
  };
}

/** Browser workspace keeps exactly one conversation (the Browser Agent thread). */
export function normalizeBrowserScoped(scoped: ScopedStore): ScopedStore {
  if (scoped.conversations.length === 0) {
    const c = createNewConversation("browser", "Browser agent");
    return { conversations: [c], activeConversationId: c.id };
  }
  if (scoped.conversations.length === 1) {
    const only = scoped.conversations[0]!;
    const title = "Browser agent";
    if (only.title === title) return scoped;
    return {
      conversations: [{ ...only, title, scope: "browser" }],
      activeConversationId: only.id,
    };
  }
  const sorted = [...scoped.conversations].sort(sortConversationsByUpdated);
  const pick =
    sorted.find((c) => c.id === scoped.activeConversationId) ?? sorted[0]!;
  const one: Conversation = { ...pick, title: "Browser agent", scope: "browser" };
  return { conversations: [one], activeConversationId: one.id };
}

/** Latest `updatedAt` across all conversations (both workspaces). */
export function chatStateMaxUpdatedAt(state: ConversationStoreStateV2): number {
  let max = 0;
  for (const scoped of [state.browser, state.intelligent]) {
    for (const c of scoped.conversations) {
      if (typeof c.updatedAt === "number" && c.updatedAt > max) max = c.updatedAt;
    }
  }
  return max;
}

/** Drop attachment payloads so the JSON fits browser storage (names/mimes/sizes kept). */
export function stripAttachmentsFromState(state: ConversationStoreStateV2): ConversationStoreStateV2 {
  const stripScoped = (scoped: ScopedStore): ScopedStore => ({
    ...scoped,
    conversations: scoped.conversations.map((c) => ({
      ...c,
      messages: c.messages.map((m) => {
        if (m.role !== "user" || !m.attachments?.length) return m;
        return {
          ...m,
          attachments: m.attachments.map((a) => ({
            ...a,
            dataBase64: "",
          })),
        };
      }),
    })),
  });
  return {
    version: 2,
    browser: stripScoped(state.browser),
    intelligent: stripScoped(state.intelligent),
  };
}

const NOTIFY_DEBOUNCE_MS = 60_000;
let lastNotifyAt = 0;
let lastNotifyKind = "";

function maybeNotifyStorageFallback(kind: "stripped" | "disk_only" | "failed") {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (kind === lastNotifyKind && now - lastNotifyAt < NOTIFY_DEBOUNCE_MS) return;
  lastNotifyAt = now;
  lastNotifyKind = kind;
  try {
    window.dispatchEvent(new CustomEvent("chat-storage-fallback", { detail: { kind } }));
  } catch {
    /* ignore */
  }
}

async function persistFullStateToDisk(json: string): Promise<boolean> {
  const api = getElectronApi();
  if (!api?.chatStateBackupWrite) return false;
  const r = await api.chatStateBackupWrite(json);
  return r.ok === true;
}

export type SaveConversationStateResult =
  | { ok: true; mode: "localStorage_full" | "localStorage_stripped" | "disk" }
  | { ok: false };

/**
 * Persist v2 chat state. On quota error: retry without attachment bytes, then full JSON under userData via IPC.
 */
export function saveConversationStateV2(state: ConversationStoreStateV2): SaveConversationStateResult {
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(CHAT_STORAGE_KEY_V2, json);
    return { ok: true, mode: "localStorage_full" };
  } catch {
    /* quota or disabled storage */
  }

  const stripped = stripAttachmentsFromState(state);
  const jsonStripped = JSON.stringify(stripped);
  try {
    localStorage.setItem(CHAT_STORAGE_KEY_V2, jsonStripped);
    if (jsonStripped !== json) {
      maybeNotifyStorageFallback("stripped");
    }
    void persistFullStateToDisk(json);
    return { ok: true, mode: "localStorage_stripped" };
  } catch {
    /* still over quota */
  }

  void persistFullStateToDisk(json).then((ok) => {
    if (ok) maybeNotifyStorageFallback("disk_only");
    else maybeNotifyStorageFallback("failed");
  });

  return { ok: true, mode: "disk" };
}

function maxUpdatedInScoped(scoped: ScopedStore): number {
  let max = 0;
  for (const c of scoped.conversations) {
    if (typeof c.updatedAt === "number" && c.updatedAt > max) max = c.updatedAt;
  }
  return max;
}

/** Latest activity marker across both workspaces (for picking the fresher full-store snapshot on flush). */
function maxUpdatedAcrossScopes(state: ConversationStoreStateV2): number {
  return Math.max(
    maxUpdatedInScoped(state.browser),
    maxUpdatedInScoped(state.intelligent),
  );
}

/**
 * Merge disk backup with current in-memory state **per workspace** so one scope cannot overwrite the other
 * (e.g. intelligent disk backup newer than local must not wipe browser-only chat in memory).
 */
export function mergeChatStatePreferNewerPerScope(
  current: ConversationStoreStateV2,
  disk: ConversationStoreStateV2,
): ConversationStoreStateV2 {
  const takeBrowser = maxUpdatedInScoped(disk.browser) > maxUpdatedInScoped(current.browser);
  const takeIntel =
    maxUpdatedInScoped(disk.intelligent) > maxUpdatedInScoped(current.intelligent);
  if (!takeBrowser && !takeIntel) return current;
  return {
    version: 2,
    browser: takeBrowser ? disk.browser : current.browser,
    intelligent: takeIntel ? disk.intelligent : current.intelligent,
  };
}

export function parseConversationStoreV2FromJson(raw: string): ConversationStoreStateV2 | null {
  try {
    const diskRaw = JSON.parse(raw) as unknown;
    if (!diskRaw || typeof diskRaw !== "object") return null;
    const o = diskRaw as Record<string, unknown>;
    if (o.version !== 2) return null;
    return {
      version: 2,
      browser: normalizeBrowserScoped(parseScoped(o.browser, "browser")),
      intelligent: parseScoped(o.intelligent, "intelligent"),
    };
  } catch {
    return null;
  }
}

/** Read normalized v2 chat from disk backup (Electron only). */
export async function readChatBackupStateV2(): Promise<ConversationStoreStateV2 | null> {
  const api = getElectronApi();
  if (!api?.chatStateBackupRead) return null;
  const raw = await api.chatStateBackupRead();
  if (!raw?.trim()) return null;
  return parseConversationStoreV2FromJson(raw);
}

export type DebouncedSaveV2 = ((state: ConversationStoreStateV2) => void) & {
  /**
   * Write to disk immediately. Pass the current store if you have it (e.g. from a ref on `pagehide`);
   * otherwise the last pending state from `schedule()` is used.
   */
  flush: (override?: ConversationStoreStateV2) => void;
};

/**
 * Debounced localStorage write. Always keeps the latest `state` as pending so `flush()` can persist
 * even if the timer never fires (e.g. process exit during the debounce window).
 */
export function createDebouncedSaveV2(delayMs: number): DebouncedSaveV2 {
  let t: ReturnType<typeof setTimeout> | null = null;
  let pending: ConversationStoreStateV2 | null = null;
  const run = ((state: ConversationStoreStateV2) => {
    pending = state;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      if (pending) saveConversationStateV2(pending);
      t = null;
    }, delayMs);
  }) as DebouncedSaveV2;
  run.flush = (override?: ConversationStoreStateV2) => {
    if (t) {
      clearTimeout(t);
      t = null;
    }
    let s: ConversationStoreStateV2 | null = null;
    if (override !== undefined && pending !== null) {
      s =
        maxUpdatedAcrossScopes(pending) > maxUpdatedAcrossScopes(override)
          ? pending
          : override;
    } else {
      s = override !== undefined ? override : pending;
    }
    if (s) {
      saveConversationStateV2(s);
      pending = s;
    }
  };
  return run;
}

export function getScopedStore(state: ConversationStoreStateV2, scope: ChatScope): ScopedStore {
  return scope === "browser" ? state.browser : state.intelligent;
}

export function setScopedStore(
  state: ConversationStoreStateV2,
  scope: ChatScope,
  scoped: ScopedStore,
): ConversationStoreStateV2 {
  if (scope === "browser") return { ...state, browser: scoped };
  return { ...state, intelligent: scoped };
}

export function createNewConversation(
  scope: ChatScope,
  title?: string,
  opts?: { mode?: IntelligentChatMode },
): Conversation {
  const now = Date.now();
  const resolvedTitle = title ?? (scope === "browser" ? "Browser agent" : "New chat");
  const welcome =
    scope === "browser"
      ? { id: generateMessageId(), role: "assistant" as const, content: DEFAULT_WELCOME_BROWSER }
      : { id: generateMessageId(), role: "assistant" as const, content: DEFAULT_WELCOME_INTELLIGENT };
  return {
    id: generateConversationId(),
    title: resolvedTitle,
    updatedAt: now,
    scope,
    ...(scope === "intelligent"
      ? { mode: opts?.mode === "ui" ? "ui" : "assistant" }
      : {}),
    messages: [welcome],
  };
}

export function loadLastIntelligentChatMode(): IntelligentChatMode {
  try {
    const v = localStorage.getItem(INTELLIGENT_CHAT_MODE_KEY);
    if (v === "assistant" || v === "ui") return v;
  } catch {
    /* ignore */
  }
  return "assistant";
}

export function saveLastIntelligentChatMode(mode: IntelligentChatMode): void {
  try {
    localStorage.setItem(INTELLIGENT_CHAT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function titleFromFirstLine(text: string, maxLen = 48): string {
  const line = text.split(/\r?\n/)[0]?.trim() || "New chat";
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1)}…`;
}

export function loadShellWorkspacePreference(): "browser" | "intelligent" {
  try {
    const v = localStorage.getItem(SHELL_WORKSPACE_KEY);
    if (v === "intelligent" || v === "browser") return v;
  } catch {
    /* ignore */
  }
  return "browser";
}

export function saveShellWorkspacePreference(ws: "browser" | "intelligent"): void {
  try {
    localStorage.setItem(SHELL_WORKSPACE_KEY, ws);
  } catch {
    /* ignore */
  }
}

// Re-export id helper for modules that only import from here
export { generateMessageId } from "./conversation-ids";
