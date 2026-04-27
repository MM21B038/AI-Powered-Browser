import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { createReactComponent } from "@a2ui/react/v0_9";
import { AccessibilityAttributesSchema, DynamicStringSchema } from "@a2ui/web_core/v0_9";
import { highlightCodeBlock } from "../../../chat/code-highlight";

/** Host render context: data model resolve (for `{ path }` bindings) + raw JSON properties. */
type A2uiHostContext = {
  componentModel: { properties?: Record<string, unknown> };
  dataContext: {
    resolveDynamicValue: <V = unknown>(value: unknown) => V;
  };
};

function resolveDynamic<V = unknown>(raw: unknown, context: A2uiHostContext): V {
  if (raw == null) return raw as V;
  if (typeof raw === "object") {
    try {
      return context.dataContext.resolveDynamicValue(raw as never) as V;
    } catch {
      return raw as V;
    }
  }
  return raw as V;
}

function formatText(raw: unknown, context: A2uiHostContext): string {
  const v = resolveDynamic(raw, context);
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function formatCell(raw: unknown, context: A2uiHostContext): string {
  const v = resolveDynamic(raw, context);
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const CommonProps = {
  accessibility: AccessibilityAttributesSchema.optional(),
  weight: z
    .number()
    .describe(
      "The relative weight of this component within a Row or Column (similar to CSS flex-grow). Only valid when a direct descendant of Row/Column."
    )
    .optional(),
};

const ChildRefSchema = z
  .union([
    z.string(),
    z
      .object({
        id: z.string(),
        basePath: z.string().optional(),
      })
      .strict(),
  ])
  .describe("Child component id, optionally with a basePath override.");

const HorizontalRuleApi = {
  name: "HorizontalRule",
  schema: z.object({ ...CommonProps }).strict().describe("A horizontal rule separator."),
};

export const a2uiV09HostHorizontalRule = createReactComponent(HorizontalRuleApi as any, () => {
  return <hr className="a2ui-host-hr" />;
});

const BadgeApi = {
  name: "Badge",
  schema: z
    .object({
      ...CommonProps,
      text: DynamicStringSchema.describe("Badge text."),
      variant: z.enum(["default", "info", "success", "warning", "danger"]).optional(),
    })
    .strict()
    .describe("Small pill label for tags/status."),
};

export const a2uiV09HostBadge = createReactComponent(
  BadgeApi as any,
  ({ props, context }: { props: any; context: A2uiHostContext }) => {
    const v = props.variant ?? "default";
    return <span className={`a2ui-host-badge a2ui-host-badge--${v}`}>{formatText(props.text, context)}</span>;
  }
);

const BlockquoteApi = {
  name: "Blockquote",
  schema: z
    .object({
      ...CommonProps,
      child: z.string().optional(),
      text: DynamicStringSchema.optional(),
    })
    .strict()
    .describe("Quoted or highlighted paragraph."),
};

export const a2uiV09HostBlockquote = createReactComponent(
  BlockquoteApi as any,
  ({ props, buildChild, context }: { props: any; buildChild: (id: string, basePath?: string) => ReactNode; context: A2uiHostContext }) => {
    const text = formatText(props.text, context);
    return (
      <blockquote className="a2ui-host-blockquote">
        {props.child ? buildChild(props.child) : text ? <span>{text}</span> : null}
      </blockquote>
    );
  }
);

const CalloutApi = {
  name: "Callout",
  schema: z
    .object({
      ...CommonProps,
      variant: z.enum(["note", "tip", "info", "warning", "danger"]).optional(),
      title: DynamicStringSchema.optional(),
      child: z.string().optional(),
      text: DynamicStringSchema.optional(),
    })
    .strict()
    .describe("Admonition/callout block."),
};

export const a2uiV09HostCallout = createReactComponent(
  CalloutApi as any,
  ({ props, buildChild, context }: { props: any; buildChild: (id: string, basePath?: string) => ReactNode; context: A2uiHostContext }) => {
    const variant = props.variant ?? "note";
    const title = formatText(props.title, context);
    const text = formatText(props.text, context);
    return (
      <div className={`a2ui-host-callout a2ui-host-callout--${variant}`}>
        {title ? <div className="a2ui-host-callout__title">{title}</div> : null}
        <div className="a2ui-host-callout__body">
          {props.child ? buildChild(props.child) : text ? <span>{text}</span> : null}
        </div>
      </div>
    );
  }
);

const OrderedListApi = {
  name: "OrderedList",
  schema: z
    .object({
      ...CommonProps,
      items: z.array(ChildRefSchema).min(1),
      start: z.number().int().min(1).optional(),
      style: z.enum(["decimal", "lowerAlpha", "upperAlpha", "lowerRoman", "upperRoman"]).optional(),
      tight: z.boolean().optional(),
    })
    .strict()
    .describe("Semantic ordered list."),
};

export const a2uiV09HostOrderedList = createReactComponent(
  OrderedListApi as any,
  ({ props, buildChild }: { props: any; buildChild: (id: string, basePath?: string) => ReactNode }) => {
    const style = props.style ?? "decimal";
    const className = `a2ui-host-olist a2ui-host-olist--${style}${props.tight ? " a2ui-host-list--tight" : ""}`;
    return (
      <ol className={className} start={props.start}>
        {Array.isArray(props.items)
          ? props.items.map((it: any, i: number) => (
              <li key={i} className="a2ui-host-li">
                {typeof it === "string" ? buildChild(it) : it?.id ? buildChild(it.id, it.basePath) : null}
              </li>
            ))
          : null}
      </ol>
    );
  }
);

const UnorderedListApi = {
  name: "UnorderedList",
  schema: z
    .object({
      ...CommonProps,
      items: z.array(ChildRefSchema).min(1),
      style: z.enum(["disc", "circle", "square"]).optional(),
      tight: z.boolean().optional(),
    })
    .strict()
    .describe("Semantic unordered list."),
};

export const a2uiV09HostUnorderedList = createReactComponent(
  UnorderedListApi as any,
  ({ props, buildChild }: { props: any; buildChild: (id: string, basePath?: string) => ReactNode }) => {
    const style = props.style ?? "disc";
    const className = `a2ui-host-ulist a2ui-host-ulist--${style}${props.tight ? " a2ui-host-list--tight" : ""}`;
    return (
      <ul className={className}>
        {Array.isArray(props.items)
          ? props.items.map((it: any, i: number) => (
              <li key={i} className="a2ui-host-li">
                {typeof it === "string" ? buildChild(it) : it?.id ? buildChild(it.id, it.basePath) : null}
              </li>
            ))
          : null}
      </ul>
    );
  }
);

const DefinitionListApi = {
  name: "DefinitionList",
  schema: z
    .object({
      ...CommonProps,
      entries: z
        .array(
          z
            .object({
              term: DynamicStringSchema,
              description: DynamicStringSchema.optional(),
              child: z.string().optional(),
            })
            .strict()
        )
        .min(1),
      compact: z.boolean().optional(),
    })
    .strict()
    .describe("Definition list (term + description pairs)."),
};

export const a2uiV09HostDefinitionList = createReactComponent(
  DefinitionListApi as any,
  ({ props, buildChild, context }: { props: any; buildChild: (id: string, basePath?: string) => ReactNode; context: A2uiHostContext }) => {
    const compact = props.compact ? " a2ui-host-dl--compact" : "";
    return (
      <dl className={`a2ui-host-dl${compact}`}>
        {(props.entries ?? []).map((e: any, i: number) => {
          const term = formatText(e.term, context);
          const desc = formatText(e.description, context);
          return (
            <div key={i} className="a2ui-host-dl__row">
              <dt className="a2ui-host-dt">{term}</dt>
              <dd className="a2ui-host-dd">{e.child ? buildChild(e.child) : desc}</dd>
            </div>
          );
        })}
      </dl>
    );
  }
);

const TableApi = {
  name: "Table",
  schema: z
    .object({
      ...CommonProps,
      caption: DynamicStringSchema.optional(),
      columns: z
        .array(
          z
            .object({
              key: z.string().min(1),
              label: DynamicStringSchema,
              align: z.enum(["start", "center", "end"]).optional(),
              width: z.string().optional(),
            })
            .strict()
        )
        .min(1),
      rows: z.any().describe("Array of row objects/arrays, or a `{ path }` binding to one."),
      dense: z.boolean().optional(),
      striped: z.boolean().optional(),
      showIndex: z.boolean().optional(),
      maxHeightPx: z.number().int().min(120).max(1200).optional(),
      wrap: z.boolean().optional(),
    })
    .strict()
    .describe("Tabular data (dataframe-like)."),
};

export const a2uiV09HostTable = createReactComponent(
  TableApi as any,
  ({ props, context }: { props: any; context: A2uiHostContext }) => {
    const cols = Array.isArray(props.columns) ? props.columns : [];
    const rowsRaw = resolveDynamic(props.rows, context);
    const rows: any[] = Array.isArray(rowsRaw) ? rowsRaw : [];
    const dense = props.dense ? " a2ui-host-table--dense" : "";
    const striped = props.striped ? " a2ui-host-table--striped" : "";
    const wrap = props.wrap ? " a2ui-host-table--wrap" : "";
    const showIndex = props.showIndex === true;
    const caption = formatText(props.caption, context);
    const maxHeight = typeof props.maxHeightPx === "number" ? `${props.maxHeightPx}px` : undefined;

    return (
      <div className="a2ui-host-table__wrap" style={maxHeight ? { maxHeight } : undefined}>
        <table className={`a2ui-host-table${dense}${striped}${wrap}`}>
          {caption ? <caption className="a2ui-host-table__caption">{caption}</caption> : null}
          <thead>
            <tr>
              {showIndex ? <th className="a2ui-host-th a2ui-host-th--index">#</th> : null}
              {cols.map((c: any) => {
                const label = formatText(c.label, context);
                const align = c.align ?? "start";
                return (
                  <th
                    key={String(c.key)}
                    className={`a2ui-host-th a2ui-host-th--${align}`}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {label || String(c.key)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isObj = r && typeof r === "object" && !Array.isArray(r);
              return (
                <tr key={i} className="a2ui-host-tr">
                  {showIndex ? <td className="a2ui-host-td a2ui-host-td--index">{i + 1}</td> : null}
                  {cols.map((c: any, colIdx: number) => {
                    const align = c.align ?? "start";
                    const cell = isObj ? (r as any)[c.key] : Array.isArray(r) ? r[colIdx] : undefined;
                    return (
                      <td key={`${i}-${String(c.key)}`} className={`a2ui-host-td a2ui-host-td--${align}`}>
                        {formatCell(cell, context)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
);

const CODE_CLIPBOARD_ICON = `<svg class="a2ui-host-codecopy-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;

const CodeBlockApi = {
  name: "CodeBlock",
  schema: z
    .object({
      ...CommonProps,
      code: DynamicStringSchema.describe("Code content (string)."),
      language: z.string().optional().describe("Optional language id for highlighting (e.g. 'ts', 'python')."),
      showCopy: z.boolean().optional().describe("Show a copy button (default true)."),
      caption: DynamicStringSchema.optional(),
    })
    .strict()
    .describe("Fenced-code style block with optional syntax highlighting."),
};

export const a2uiV09HostCodeBlock = createReactComponent(
  CodeBlockApi as any,
  ({ props, context }: { props: any; context: A2uiHostContext }) => {
    const code = formatText(props.code, context);
    const lang = String(props.language ?? "").trim().toLowerCase();
    const { html, hljs, classLang } = useMemo(() => highlightCodeBlock(code, lang), [code, lang]);
    const displayLang = lang || classLang || "text";
    const codeClass = [hljs ? "hljs" : "", displayLang ? `language-${displayLang}` : ""]
      .filter(Boolean)
      .join(" ");
    const showCopy = props.showCopy !== false;
    const caption = formatText(props.caption, context);
    const [copied, setCopied] = useState(false);

    const onCopy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 900);
      } catch {
        /* ignore */
      }
    };

    return (
      <div className="a2ui-host-codeblock">
        <div className="a2ui-host-codeblock__head">
          <span className="a2ui-host-codeblock__lang">{displayLang}</span>
          {caption ? <span className="a2ui-host-codeblock__caption">{caption}</span> : null}
          <span className="a2ui-host-codeblock__spacer" aria-hidden="true" />
          {showCopy ? (
            <button
              type="button"
              className="a2ui-host-codecopy"
              onClick={() => onCopy()}
              aria-label="Copy code"
              title={copied ? "Copied" : "Copy"}
            >
              <span dangerouslySetInnerHTML={{ __html: CODE_CLIPBOARD_ICON }} />
            </button>
          ) : null}
        </div>
        <pre className="a2ui-host-codeblock__pre">
          <code className={codeClass} dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    );
  }
);

export const A2UI_V09_HOST_DOCUMENT_COMPONENT_NAMES = [
  "HorizontalRule",
  "Badge",
  "Blockquote",
  "Callout",
  "OrderedList",
  "UnorderedList",
  "DefinitionList",
  "Table",
  "CodeBlock",
] as const;

const HOST_DOCUMENT_COMPONENTS = [
  a2uiV09HostHorizontalRule,
  a2uiV09HostBadge,
  a2uiV09HostBlockquote,
  a2uiV09HostCallout,
  a2uiV09HostOrderedList,
  a2uiV09HostUnorderedList,
  a2uiV09HostDefinitionList,
  a2uiV09HostTable,
  a2uiV09HostCodeBlock,
] as const;

export function getA2uiV09HostDocumentComponents(): readonly any[] {
  return HOST_DOCUMENT_COMPONENTS;
}
