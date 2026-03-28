/**
 * Persisted chat: dual Browser vs Intelligent workspaces, multi-role messages (v2).
 */

import { generateMessageId } from "./conversation-ids";

export const CHAT_STORAGE_KEY = "butcher.chat.conversations.v1";
export const CHAT_STORAGE_KEY_V2 = "butcher.chat.v2";
export const SHELL_WORKSPACE_KEY = "butcher.shell.workspace.v1";

export type ChatScope = "browser" | "intelligent";

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
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      thinking?: string;
      /** Wall-clock duration of the thinking stream, for “Thought · 2.1s” UI. */
      thinkingDurationMs?: number;
    }
  | {
      id: string;
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
      /** JSON string of arguments passed to the tool (model output). */
      arguments?: string;
    };

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  scope: ChatScope;
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

function isChatMessageV2(x: unknown): x is ChatMessageV2 {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.role !== "string") return false;
  switch (m.role) {
    case "system":
    case "user":
    case "assistant":
      return typeof m.content === "string";
    case "tool": {
      const tm = m as Record<string, unknown>;
      return (
        typeof tm.toolCallId === "string" &&
        typeof tm.name === "string" &&
        typeof tm.content === "string" &&
        (tm.arguments === undefined || typeof tm.arguments === "string")
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
    const c = createNewConversation("intelligent", "New chat");
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

export function saveConversationStateV2(state: ConversationStoreStateV2): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY_V2, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function createDebouncedSaveV2(delayMs: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (state: ConversationStoreStateV2) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      saveConversationStateV2(state);
      t = null;
    }, delayMs);
  };
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

export function createNewConversation(scope: ChatScope, title?: string): Conversation {
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
    messages: [welcome],
  };
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
