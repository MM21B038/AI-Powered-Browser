import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { McpIcon } from "../icons/McpIcon";

const MAX_JSON_DEPTH = 10;

/** Must match `styles.css` `.ai-chat-tool-card { --ai-chat-tool-45 }` and clip-path chamfer. */
const AI_CHAT_TOOL_CHAMFER_PX = 44;

/** Crease path uses real card width and `--ai-chat-tool-header-frac` so it matches `clip-path`. */
function AiChatToolCreaseSvg(): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState({ w: 400, headerFrac: 0.25 });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const card = svg?.closest(".ai-chat-tool-card");
    if (!card || !(card instanceof HTMLElement)) return;

    const update = () => {
      const cs = getComputedStyle(card);
      const raw = cs.getPropertyValue("--ai-chat-tool-header-frac").trim();
      const parsed = parseFloat(raw);
      const headerFrac =
        Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.25;
      setLayout({
        w: Math.max(1, card.clientWidth),
        headerFrac,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(card);
    const mo = new MutationObserver(update);
    mo.observe(card, { attributes: true, attributeFilter: ["open"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const h = AI_CHAT_TOOL_CHAMFER_PX;
  const { w, headerFrac } = layout;
  const xQ = w * headerFrac;
  const xJ = xQ + h;
  const d =
    xJ <= w
      ? `M 0 0 L ${xQ} 0 L ${xJ} ${h} L ${w} ${h}`
      : `M 0 0 L ${xQ} 0 L ${w} ${h}`;

  return (
    <svg
      ref={svgRef}
      className="ai-chat-tool-card__crease"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="nonScalingStroke"
      />
    </svg>
  );
}

type ParsedToolDisplay =
  | {
      kind: "mcp";
      isError: boolean;
      inner: unknown;
      partsNote?: string;
    }
  | { kind: "json"; value: unknown }
  | { kind: "text"; text: string };

function extractMcpPayload(o: Record<string, unknown>): {
  inner: unknown;
  partsNote?: string;
} {
  const parts = o.content as
    | Array<{ type?: string; text?: string; [k: string]: unknown }>
    | undefined;
  if (!Array.isArray(parts) || parts.length === 0) {
    return { inner: "" };
  }
  const texts: string[] = [];
  let nonText = 0;
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const typ = typeof p.type === "string" ? p.type : "";
    if (typeof p.text === "string") {
      texts.push(p.text);
    } else if (typ && typ !== "text" && typ !== "text/plain") {
      nonText++;
    }
  }
  const joined = texts.join("\n\n");
  let inner: unknown = joined;
  const trimmed = joined.trim();
  if (
    trimmed.length > 0 &&
    ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]")))
  ) {
    try {
      inner = JSON.parse(trimmed) as unknown;
    } catch {
      inner = joined;
    }
  }
  const partsNote =
    nonText > 0
      ? `${nonText} non-text content part(s) not shown here`
      : undefined;
  return { inner, partsNote };
}

function parseToolResultContent(raw: string): ParsedToolDisplay {
  const t = raw.trim();
  if (!t) return { kind: "text", text: "" };
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    if (
      o &&
      typeof o === "object" &&
      !Array.isArray(o) &&
      Array.isArray(o.content) &&
      typeof o.isError === "boolean"
    ) {
      const { inner, partsNote } = extractMcpPayload(o);
      return {
        kind: "mcp",
        isError: Boolean(o.isError),
        inner,
        partsNote,
      };
    }
    return { kind: "json", value: o };
  } catch {
    return { kind: "text", text: raw };
  }
}

function formatJsonPretty(raw: string | undefined): string | null {
  if (raw === undefined || !String(raw).trim()) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return String(raw);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function tryParseJsonString(s: string): unknown | null {
  const t = s.trim();
  if (t.length < 2) return null;
  const c = t[0];
  if (c !== "{" && c !== "[") return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function objectKeyCount(data: Record<string, unknown>): number {
  return Object.keys(data).length;
}

function NestedFold({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <details className="ai-chat-tool-nest">
      <summary className="ai-chat-tool-nest__summary">{summary}</summary>
      <div className="ai-chat-tool-nest__panel">{children}</div>
    </details>
  );
}

function isUniformObjectArray(
  arr: unknown[],
): arr is Record<string, unknown>[] {
  if (arr.length === 0) return false;
  if (!arr.every((x) => isPlainObject(x))) return false;
  const k0 = Object.keys(arr[0]!).sort().join("\0");
  return arr.every((x) => Object.keys(x!).sort().join("\0") === k0);
}

function JsonValueView({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}): ReactElement {
  if (depth > MAX_JSON_DEPTH) {
    return (
      <span className="ai-chat-tool-scalar ai-chat-tool-scalar--trunc">…</span>
    );
  }
  if (value === null) {
    return (
      <span className="ai-chat-tool-scalar ai-chat-tool-scalar--null">null</span>
    );
  }
  if (typeof value === "boolean") {
    return (
      <code className="ai-chat-tool-scalar ai-chat-tool-scalar--bool">
        {String(value)}
      </code>
    );
  }
  if (typeof value === "number") {
    return (
      <code className="ai-chat-tool-scalar ai-chat-tool-scalar--num">
        {String(value)}
      </code>
    );
  }
  if (typeof value === "string") {
    return <ToolStringValue s={value} depth={depth} />;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="ai-chat-tool-card__empty">Empty list</p>;
    }
    const inner = <ArrayBlock items={value} depth={depth} />;
    if (depth >= 1) {
      const label = isUniformObjectArray(value)
        ? `Table · ${value.length} × ${Object.keys(value[0]!).length}`
        : `Array · ${value.length}`;
      return <NestedFold summary={label}>{inner}</NestedFold>;
    }
    return inner;
  }
  if (isPlainObject(value)) {
    const inner = (
      <KeyValueBlock data={value} depth={depth} />
    );
    if (depth >= 1) {
      const n = objectKeyCount(value);
      return (
        <NestedFold summary={`Object · ${n} ${n === 1 ? "key" : "keys"}`}>
          {inner}
        </NestedFold>
      );
    }
    return inner;
  }
  return (
    <pre className="ai-chat-tool-card__nested">
      {(() => {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      })()}
    </pre>
  );
}

function ArrayBlock({
  items,
  depth,
}: {
  items: unknown[];
  depth: number;
}): ReactElement {
  if (items.length === 0) {
    return <p className="ai-chat-tool-card__empty">Empty list</p>;
  }
  if (isUniformObjectArray(items)) {
    const keys = Object.keys(items[0]!);
    return (
      <div className="ai-chat-tool-table-wrap">
        <table className="ai-chat-tool-table">
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, ri) => (
              <tr key={ri}>
                {keys.map((k) => (
                  <td key={k}>
                    <div className="ai-chat-tool-kv__val-inner">
                      <JsonValueView value={row[k]} depth={depth + 1} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (items.every((x) => typeof x !== "object" || x === null)) {
    return (
      <ul className="ai-chat-tool-list ai-chat-tool-list--plain">
        {items.map((x, i) => (
          <li key={i}>
            <JsonValueView value={x} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="ai-chat-tool-list ai-chat-tool-list--cards">
      {items.map((x, i) => (
        <li key={i} className="ai-chat-tool-list__card">
          <JsonValueView value={x} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function ToolStringValue({
  s,
  depth,
}: {
  s: string;
  depth: number;
}): ReactElement {
  const embedded = useMemo(() => tryParseJsonString(s), [s]);
  if (
    embedded !== null &&
    (typeof embedded === "object" || Array.isArray(embedded))
  ) {
    return (
      <div className="ai-chat-tool-embed">
        <span className="ai-chat-tool-embed__label">JSON</span>
        <JsonValueView value={embedded} depth={depth + 1} />
      </div>
    );
  }
  return (
    <div className="ai-chat-tool-val-scroll">
      <span className="ai-chat-tool-txt">{s}</span>
    </div>
  );
}

function KeyValueBlock({
  data,
  depth,
}: {
  data: Record<string, unknown>;
  depth: number;
}): ReactElement {
  const entries = Object.entries(data).filter(
    ([k, v]) => k !== "error" || v != null,
  );
  if (entries.length === 0) {
    return <p className="ai-chat-tool-card__empty">No fields</p>;
  }
  const root = depth === 0;
  return (
    <dl
      className={
        root
          ? "ai-chat-tool-kv ai-chat-tool-kv--root"
          : "ai-chat-tool-kv ai-chat-tool-kv--nested"
      }
    >
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="ai-chat-tool-kv__key">{k}</dt>
          <dd className="ai-chat-tool-kv__val">
            <div className="ai-chat-tool-kv__val-inner">
              <JsonValueView value={v} depth={depth + 1} />
            </div>
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function ResultBody({ parsed }: { parsed: ParsedToolDisplay }): ReactElement {
  if (parsed.kind === "mcp") {
    return (
      <div className="ai-chat-tool-card__result-inner">
        {parsed.isError ? (
          <div
            className="ai-chat-tool-card__banner ai-chat-tool-card__banner--err"
            role="status"
          >
            Tool reported an error
          </div>
        ) : (
          <div
            className="ai-chat-tool-card__banner ai-chat-tool-card__banner--ok"
            role="status"
          >
            Success
          </div>
        )}
        {parsed.partsNote ? (
          <p className="ai-chat-tool-parts-note">{parsed.partsNote}</p>
        ) : null}
        <JsonValueView value={parsed.inner} depth={0} />
      </div>
    );
  }
  if (parsed.kind === "json") {
    return <JsonValueView value={parsed.value} depth={0} />;
  }
  return <ToolStringValue s={parsed.text} depth={0} />;
}

export function AiChatToolResultBlock({
  name,
  toolArguments,
  content,
}: {
  name: string;
  toolArguments?: string;
  content: string;
}): ReactElement {
  const parsed = useMemo(() => parseToolResultContent(content), [content]);
  const argsPretty = useMemo(
    () => formatJsonPretty(toolArguments),
    [toolArguments],
  );

  const statusChip: ReactNode =
    parsed.kind === "mcp" ? (
      <span
        className={
          parsed.isError
            ? "ai-chat-tool-card__chip ai-chat-tool-card__chip--err"
            : "ai-chat-tool-card__chip ai-chat-tool-card__chip--ok"
        }
      >
        {parsed.isError ? "Error" : "OK"}
      </span>
    ) : null;

  return (
    <details className="ai-chat-tool-card">
      <AiChatToolCreaseSvg />
      <summary className="ai-chat-tool-card__summary">
        <div className="ai-chat-tool-card__summary-row">
          <McpIcon size={16} className="ai-chat-tool-card__icon" />
          <span className="ai-chat-tool-card__name">
            {name.trim() || "tool"}
          </span>
          {statusChip}
          <span className="ai-chat-tool-card__chev" aria-hidden />
        </div>
      </summary>
      <div className="ai-chat-tool-card__body">
        {argsPretty !== null ? (
          <section className="ai-chat-tool-card__section">
            <h4 className="ai-chat-tool-card__section-title">Arguments</h4>
            <pre className="ai-chat-tool-card__pre ai-chat-tool-card__pre--args">
              {argsPretty}
            </pre>
          </section>
        ) : (
          <p className="ai-chat-tool-card__muted">
            Arguments were not stored for this message (older chats).
          </p>
        )}
        <section className="ai-chat-tool-card__section">
          <h4 className="ai-chat-tool-card__section-title">Result</h4>
          <ResultBody parsed={parsed} />
        </section>
      </div>
    </details>
  );
}
