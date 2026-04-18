import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { z } from "zod";
import { createReactComponent } from "@a2ui/react/v0_9";
import {
  AccessibilityAttributesSchema,
  CheckableSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";

/** Host render context: data model writes + raw component properties (for `{ path }` bindings). */
type DropdownHostContext = {
  componentModel: { properties?: Record<string, unknown> };
  dataContext: {
    set: (path: string, value: unknown) => void;
    resolveDynamicValue: <V = unknown>(value: unknown) => V;
  };
};

/** Avoid `[object Object]` when DynamicString / bindings are still objects in edge cases. */
function formatA2uiText(value: unknown, context: DropdownHostContext): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      const r = context.dataContext.resolveDynamicValue(value as never);
      if (typeof r === "string") return r;
      if (typeof r === "number" || typeof r === "boolean") return String(r);
      if (r == null) return "";
      if (typeof r === "object") return "";
      return String(r);
    } catch {
      return "";
    }
  }
  return String(value);
}

const CommonProps = {
  accessibility: AccessibilityAttributesSchema.optional(),
  weight: z
    .number()
    .describe(
      "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column."
    )
    .optional(),
};

const DropdownApi = {
  name: "Dropdown",
  schema: z
    .object({
      ...CommonProps,
      label: DynamicStringSchema.describe("The label for the dropdown.").optional(),
      placeholder: z
        .string()
        .describe(
          "When set, an extra first option with value \"\" is shown with this label (e.g. “Select…”). Use with an initially empty string in the data model."
        )
        .optional(),
      options: z
        .array(
          z
            .object({
              label: DynamicStringSchema.describe("The text to display for this option."),
              value: z.string().describe("The stable value associated with this option."),
            })
            .strict()
        )
        .min(1)
        .describe("The list of available options."),
      value: DynamicStringSchema.describe(
        "The selected option value. Bind to a string in the data model (not a string array)."
      ),
      checks: CheckableSchema.shape.checks,
    })
    .strict()
    .describe("A single-select dropdown (custom listbox for reliable host interaction)."),
};

function readValueBindingPath(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = (raw as { path?: unknown }).path;
  return typeof p === "string" ? p : null;
}

/**
 * Current selection for display + matching options. When `value` is bound with `{ path }`,
 * read synchronously from the data model so the trigger stays in sync after `set()` (binder
 * `props.value` can lag or appear empty while the model already updated — which left the
 * placeholder visible even though `/selected` was correct).
 */
function effectiveDropdownValue(props: any, context: DropdownHostContext): string {
  const rawBinding = context.componentModel.properties?.value;
  const path = readValueBindingPath(rawBinding);
  if (path) {
    try {
      const fromModel = context.dataContext.resolveDynamicValue(rawBinding);
      if (fromModel === undefined || fromModel === null) return "";
      if (typeof fromModel === "string") return fromModel.trim();
      if (typeof fromModel === "number" || typeof fromModel === "boolean") return String(fromModel);
      if (typeof fromModel === "object") return "";
    } catch {
      /* ignore */
    }
  }
  return formatA2uiText(props.value, context).trim();
}

/**
 * Persists the choice to the surface data model (same effect as `updateDataModel` for a path).
 * Calls the binder `setValue` when present, and always applies `dataContext.set` when the
 * component JSON bound `value` with `{ path }` (covers edge cases where the setter is a no-op).
 */
function commitDropdownValue(
  next: string,
  props: { setValue?: (v: string) => void },
  context: DropdownHostContext,
): void {
  try {
    props.setValue?.(next);
  } catch {
    /* ignore */
  }
  const path = readValueBindingPath(context.componentModel.properties?.value);
  if (path) {
    try {
      context.dataContext.set(path, next);
    } catch {
      /* ignore */
    }
  }
}

export const a2uiV09HostDropdownComponent = createReactComponent(
  DropdownApi as any,
  ({ props, context }: { props: any; context: DropdownHostContext }) => {
    const uniqueId = useId();
    const listboxId = `${uniqueId}-listbox`;
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const hasError = props.validationErrors && props.validationErrors.length > 0;
    const selValue = effectiveDropdownValue(props, context);

    const showPlaceholderStyle = selValue === "" && props.placeholder !== undefined;

    const selectedOption = useMemo(() => {
      return (props.options ?? []).find((o: { value: string }) => {
        const ov = formatA2uiText(o.value, context).trim();
        return ov === selValue;
      });
    }, [props.options, selValue, context]);

    const displayLabel = useMemo(() => {
      if (selValue === "" && props.placeholder !== undefined) {
        return formatA2uiText(props.placeholder, context);
      }
      if (selectedOption) return formatA2uiText(selectedOption.label, context);
      if (selValue) return selValue;
      return "—";
    }, [props.placeholder, selValue, selectedOption, context]);

    /** Second line in the closed box: show stable `value` when it differs from the visible label. */
    const selectedLabelText = selectedOption
      ? formatA2uiText(selectedOption.label, context).trim()
      : "";
    const showSelectedValueCode =
      selValue !== "" && !!selectedOption && selectedLabelText !== selValue;

    const wrapClass =
      "a2ui-host-dropdown__wrap" +
      (hasError ? " a2ui-host-dropdown__wrap--error" : "") +
      (open ? " a2ui-host-dropdown__wrap--open" : "");
    const triggerClass =
      "a2ui-host-dropdown__trigger" +
      (showPlaceholderStyle ? " a2ui-host-dropdown__trigger--placeholder" : "");

    useEffect(() => {
      if (!open) return;
      const onDoc = (e: MouseEvent) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", onDoc, true);
      return () => document.removeEventListener("mousedown", onDoc, true);
    }, [open]);

    useEffect(() => {
      if (!open) return;
      const onKey = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    const pick = (next: string) => {
      commitDropdownValue(next, props, context);
      setOpen(false);
    };

    const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
    };

    return (
      <div className="a2ui-host-dropdown">
        {formatA2uiText(props.label, context) ? (
          <label className="a2ui-host-dropdown__label" htmlFor={uniqueId} id={`${uniqueId}-label`}>
            {formatA2uiText(props.label, context)}
          </label>
        ) : null}
        <div className="a2ui-host-dropdown__control" ref={wrapRef}>
          <div className={wrapClass}>
            <button
              type="button"
              id={uniqueId}
              className={triggerClass}
              aria-invalid={hasError ? true : undefined}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? listboxId : undefined}
              aria-labelledby={
                formatA2uiText(props.label, context) ? `${uniqueId}-label` : undefined
              }
              aria-label={
                formatA2uiText(props.label, context)
                  ? undefined
                  : formatA2uiText(props.placeholder, context) || "Select option"
              }
              onClick={() => setOpen((v) => !v)}
              onKeyDown={onTriggerKeyDown}
              title={
                showSelectedValueCode
                  ? `${displayLabel} (${selValue})`
                  : displayLabel !== "—"
                    ? displayLabel
                    : undefined
              }
            >
              <span className="a2ui-host-dropdown__trigger-value">
                <span className="a2ui-host-dropdown__trigger-main">{displayLabel}</span>
                {showSelectedValueCode ? (
                  <span className="a2ui-host-dropdown__trigger-code">{selValue}</span>
                ) : null}
              </span>
              <span className="a2ui-host-dropdown__chevron" aria-hidden="true">
                <svg
                  className="a2ui-host-dropdown__chevron-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5.5 7.5 10 12l4.5-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          </div>
          {open ? (
            <div
              id={listboxId}
              className="a2ui-host-dropdown__menu"
              role="listbox"
              aria-labelledby={
                formatA2uiText(props.label, context) ? `${uniqueId}-label` : uniqueId
              }
              tabIndex={-1}
            >
              {props.placeholder !== undefined ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={selValue === ""}
                  className={`a2ui-host-dropdown__opt${selValue === "" ? " a2ui-host-dropdown__opt--active" : ""} a2ui-host-dropdown__opt--placeholder`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick("")}
                >
                  <span className="a2ui-host-dropdown__opt-check" aria-hidden>
                    ✓
                  </span>
                  <span className="a2ui-host-dropdown__opt-label">
                    {formatA2uiText(props.placeholder, context)}
                  </span>
                </button>
              ) : null}
              {(props.options ?? []).map(
                (opt: { label: string; value: string }, i: number) => {
                  const optVal = formatA2uiText(opt.value, context).trim();
                  const active = optVal === selValue;
                  return (
                    <button
                      key={`${optVal}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`a2ui-host-dropdown__opt${active ? " a2ui-host-dropdown__opt--active" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(optVal)}
                    >
                      <span className="a2ui-host-dropdown__opt-check" aria-hidden>
                        ✓
                      </span>
                      <span className="a2ui-host-dropdown__opt-label">
                        {formatA2uiText(opt.label, context)}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          ) : null}
        </div>
        {hasError ? (
          <span className="a2ui-host-dropdown__error">
            {formatA2uiText(props.validationErrors?.[0], context) || "Validation error"}
          </span>
        ) : null}
      </div>
    );
  },
);
