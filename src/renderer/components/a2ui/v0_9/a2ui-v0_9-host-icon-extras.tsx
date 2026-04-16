import type { ReactElement } from "react";
import type { A2uiV09HostIconExtraKey } from "./a2ui-v0_9-host-icon-resolve";

const svgBase = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none" as const,
} as const;

/**
 * Theme-aware inline icons (`currentColor`) for `Icon` names `host:autonomous`, `host:agent`, `host:browser`.
 */
export function renderA2uiV09HostExtraIcon(key: A2uiV09HostIconExtraKey): ReactElement {
  switch (key) {
    case "autonomous":
      return (
        <svg {...svgBase} aria-hidden className="a2ui-host-icon__svg">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity={0.85}
          />
          <path
            d="M12 6.5v4.2l3.6 2.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="1.35" fill="currentColor" />
        </svg>
      );
    case "agent":
      return (
        <svg {...svgBase} aria-hidden className="a2ui-host-icon__svg">
          <rect
            x="6"
            y="8"
            width="12"
            height="9"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="9.5" cy="11.5" r="1" fill="currentColor" />
          <circle cx="14.5" cy="11.5" r="1" fill="currentColor" />
          <path
            d="M9 15.5h6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M12 5.5v2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case "browser":
      return (
        <svg {...svgBase} aria-hidden className="a2ui-host-icon__svg">
          <rect
            x="4.5"
            y="5.5"
            width="15"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4.5 9h15"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="7" cy="7.25" r="0.65" fill="currentColor" />
          <circle cx="9.25" cy="7.25" r="0.65" fill="currentColor" />
          <circle cx="11.5" cy="7.25" r="0.65" fill="currentColor" />
        </svg>
      );
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
