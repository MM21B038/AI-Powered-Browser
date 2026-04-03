import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";

const PREVIEW_LEN = 30;

export function userQueryPreviewPlain(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= PREVIEW_LEN) return oneLine;
  return `${oneLine.slice(0, PREVIEW_LEN)}…`;
}

export type AiChatQueryRailUser = { id: string; content: string };

function computeActiveUserId(
  root: HTMLElement,
  users: AiChatQueryRailUser[],
): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return users[0]!.id;

  const anchor = root.scrollTop + root.clientHeight / 2;

  for (let i = 0; i < users.length; i++) {
    const el = root.querySelector(
      `[data-ai-chat-user-msg="${CSS.escape(users[i]!.id)}"]`,
    ) as HTMLElement | null;
    if (!el) continue;
    const nextEl =
      i + 1 < users.length
        ? (root.querySelector(
            `[data-ai-chat-user-msg="${CSS.escape(users[i + 1]!.id)}"]`,
          ) as HTMLElement | null)
        : null;
    const end = nextEl ? nextEl.offsetTop : root.scrollHeight;
    if (anchor >= el.offsetTop && anchor < end) {
      return users[i]!.id;
    }
  }

  const first = root.querySelector(
    `[data-ai-chat-user-msg="${CSS.escape(users[0]!.id)}"]`,
  ) as HTMLElement | null;
  if (first && anchor < first.offsetTop) return users[0]!.id;
  return users[users.length - 1]!.id;
}

export function AiChatQueryRail({
  scrollRootRef,
  users,
  conversationId,
}: {
  scrollRootRef: RefObject<HTMLDivElement | null>;
  users: AiChatQueryRailUser[];
  conversationId: string | null;
}): ReactElement | null {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const rafScrollRef = useRef<number>(0);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const openHover = useCallback(() => {
    cancelHoverClose();
    setHoverOpen(true);
  }, [cancelHoverClose]);

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      setHoverOpen(false);
    }, 280);
  }, [cancelHoverClose]);

  useLayoutEffect(() => {
    return () => cancelHoverClose();
  }, [cancelHoverClose]);

  const updateActive = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root || users.length === 0) {
      setActiveUserId(null);
      return;
    }
    setActiveUserId(computeActiveUserId(root, users));
  }, [scrollRootRef, users]);

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => updateActive());
    return () => window.cancelAnimationFrame(id);
  }, [updateActive, conversationId, users]);

  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const onScroll = () => {
      if (rafScrollRef.current) return;
      rafScrollRef.current = window.requestAnimationFrame(() => {
        rafScrollRef.current = 0;
        updateActive();
      });
    };

    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(updateActive);
    });
    ro.observe(root);
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateActive);

    return () => {
      ro.disconnect();
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateActive);
      if (rafScrollRef.current) window.cancelAnimationFrame(rafScrollRef.current);
    };
  }, [scrollRootRef, updateActive]);

  const onJump = useCallback(
    (id: string) => {
      const root = scrollRootRef.current;
      if (!root) return;
      const el = root.querySelector(
        `[data-ai-chat-user-msg="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [scrollRootRef],
  );

  if (users.length === 0 || users.length === 1) return null;

  return (
    <div className="ai-chat-query-rail" aria-label="Jump to a reply in this chat">
      <div
        className="ai-chat-query-rail__hover-wrap"
        onMouseEnter={openHover}
        onMouseLeave={scheduleHoverClose}
      >
        <div
          className={
            hoverOpen
              ? "ai-chat-query-rail__preview ai-chat-query-rail__preview--open"
              : "ai-chat-query-rail__preview"
          }
          role="tooltip"
          id="ai-chat-query-rail-preview"
        >
          {users.map((u, i) => {
            const preview = userQueryPreviewPlain(u.content);
            const active = activeUserId === u.id;
            return (
              <button
                key={u.id}
                type="button"
                className={
                  active
                    ? "ai-chat-query-rail__preview-block ai-chat-query-rail__preview-block--active"
                    : "ai-chat-query-rail__preview-block"
                }
                aria-label={`Reply ${i + 1}: ${preview}`}
                onClick={() => onJump(u.id)}
              >
                {preview}
              </button>
            );
          })}
        </div>
        <div className="ai-chat-query-rail__stack">
          {users.map((u, i) => {
            const preview = userQueryPreviewPlain(u.content);
            const active = activeUserId === u.id;
            return (
              <button
                key={u.id}
                type="button"
                className={
                  active
                    ? "ai-chat-query-rail__segment ai-chat-query-rail__segment--active"
                    : "ai-chat-query-rail__segment"
                }
                aria-describedby={
                  hoverOpen ? "ai-chat-query-rail-preview" : undefined
                }
                aria-label={`Reply ${i + 1}: ${preview}`}
                aria-current={active ? true : undefined}
                onClick={() => onJump(u.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
