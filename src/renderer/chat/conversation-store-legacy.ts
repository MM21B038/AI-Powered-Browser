/**
 * Legacy v1 chat persistence used by kernel.ts DOM chat (screenshots, pickers).
 * AI chat uses conversation-store.ts (v2).
 */

import { generateMessageId } from "./conversation-ids";

export const CHAT_STORAGE_KEY = "butcher.chat.conversations.v1";

export type ChatMessage =
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

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

export type ConversationStoreState = {
  conversations: Conversation[];
  activeConversationId: string | null;
};

const DEFAULT_WELCOME_ASSISTANT = `Hello! I'm your AI assistant. I can help you navigate websites, fill forms, click elements, take screenshots, and automate tasks.

Try: *"go to github.com"* · *"fill email with test@test.com"* · *"click submit"*`;

function sortConversationsByUpdated(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt;
}

export function loadConversationState(): ConversationStoreState {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyState();
    const o = parsed as Record<string, unknown>;
    const conversations = Array.isArray(o.conversations) ? o.conversations : [];
    const activeConversationId =
      typeof o.activeConversationId === "string" ? o.activeConversationId : null;
    const cleaned: Conversation[] = conversations
      .filter((c): c is Conversation => isConversation(c))
      .map((c) => ({
        ...c,
        messages: Array.isArray(c.messages) ? c.messages.filter(isChatMessage) : [],
      }));
    return {
      conversations: cleaned.sort(sortConversationsByUpdated),
      activeConversationId,
    };
  } catch {
    return emptyState();
  }
}

function emptyState(): ConversationStoreState {
  return { conversations: [], activeConversationId: null };
}

function isConversation(x: unknown): x is Conversation {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.title === "string" && typeof c.updatedAt === "number";
}

function isChatMessage(x: unknown): x is ChatMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.kind !== "string") return false;
  switch (m.kind) {
    case "user":
    case "assistant":
      return typeof m.markdown === "string";
    case "screenshot_sent":
      return typeof m.dataUrl === "string" && typeof m.filename === "string";
    case "picker":
      return (
        typeof m.selector === "string" &&
        typeof m.tag === "string" &&
        typeof m.type === "string" &&
        typeof m.text === "string" &&
        typeof m.canFill === "boolean" &&
        typeof m.isCheckable === "boolean"
      );
    default:
      return false;
  }
}

export function saveConversationState(state: ConversationStoreState): void {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function createDebouncedSave(delayMs: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (state: ConversationStoreState) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      saveConversationState(state);
      t = null;
    }, delayMs);
  };
}

export function defaultWelcomeMessage(): ChatMessage {
  return {
    id: generateMessageId(),
    kind: "assistant",
    markdown: DEFAULT_WELCOME_ASSISTANT,
  };
}

export function createNewConversation(title = "New chat"): Conversation {
  const now = Date.now();
  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    title,
    updatedAt: now,
    messages: [defaultWelcomeMessage()],
  };
}

export function titleFromFirstLine(text: string, maxLen = 48): string {
  const line = text.split(/\r?\n/)[0]?.trim() || "New chat";
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1)}…`;
}

export { generateMessageId } from "./conversation-ids";
