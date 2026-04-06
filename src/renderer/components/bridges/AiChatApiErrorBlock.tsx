import type { ReactElement } from "react";
import type { ChatApiErrorDisplay } from "../../services/api-error-format";

export function AiChatApiErrorBlock({
  display,
}: {
  display: ChatApiErrorDisplay;
}): ReactElement {
  const { severity, title, detail, httpStatus, codeLabel } = display;
  const badge =
    httpStatus != null
      ? `HTTP ${httpStatus}`
      : codeLabel
        ? codeLabel
        : null;

  return (
    <div
      className={`ai-chat-api-error-card ai-chat-api-error-card--${severity}`}
      role="alert"
      aria-live="polite"
    >
      <div className="ai-chat-api-error-card__header">
        <span className="ai-chat-api-error-card__icon" aria-hidden>
          {severity === "info" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M12 10v5M12 7h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          ) : severity === "warning" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4L3 19h18L12 4z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d="M12 10v5M12 16h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M15 9l-6 6M9 9l6 6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        <span className="ai-chat-api-error-card__title">{title}</span>
        {badge ? (
          <span className="ai-chat-api-error-card__badge">{badge}</span>
        ) : null}
      </div>
      {detail.trim() ? (
        <pre className="ai-chat-api-error-card__detail">{detail}</pre>
      ) : null}
    </div>
  );
}
