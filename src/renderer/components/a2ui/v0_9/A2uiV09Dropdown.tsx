import { useId, useMemo } from "react";
import { z } from "zod";
import { createReactComponent } from "@a2ui/react/v0_9";
import {
  AccessibilityAttributesSchema,
  CheckableSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";

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
    .describe("A single-select dropdown rendered as a native HTML select."),
};

export const a2uiV09HostDropdownComponent = createReactComponent(DropdownApi as any, ({ props }) => {
  const uniqueId = useId();
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const selValue = typeof props.value === "string" ? props.value : "";
  const showPlaceholderStyle = selValue === "" && props.placeholder !== undefined;
  const wrapClass =
    "a2ui-host-dropdown__wrap" + (hasError ? " a2ui-host-dropdown__wrap--error" : "");
  const selectClass =
    "a2ui-host-dropdown__select" +
    (showPlaceholderStyle ? " a2ui-host-dropdown__select--placeholder" : "");

  const selectedLabel = useMemo(() => {
    if (selValue === "" && props.placeholder !== undefined) return String(props.placeholder);
    const opt = (props.options ?? []).find((o: { value: string }) => o.value === selValue);
    return opt ? String(opt.label) : selValue ? selValue : "—";
  }, [props.options, props.placeholder, selValue]);

  return (
    <div className="a2ui-host-dropdown">
      {props.label ? (
        <label htmlFor={uniqueId} className="a2ui-host-dropdown__label">
          {props.label}
        </label>
      ) : null}
      <div className="a2ui-host-dropdown__selection" aria-live="polite">
        <span className="a2ui-host-dropdown__selection-label">Selected</span>
        <span className="a2ui-host-dropdown__selection-value">{selectedLabel}</span>
      </div>
      <div className={wrapClass}>
        <select
          id={uniqueId}
          className={selectClass}
          value={selValue}
          onChange={(e) => {
            props.setValue(e.target.value);
          }}
          aria-invalid={hasError ? true : undefined}
        >
          {props.placeholder !== undefined ? (
            <option value="" className="a2ui-host-dropdown__option a2ui-host-dropdown__option--empty">
              {props.placeholder}
            </option>
          ) : null}
          {(props.options ?? []).map(
            (opt: { label: string; value: string }, i: number) => (
              <option
                key={`${opt.value}-${i}`}
                value={opt.value}
                className="a2ui-host-dropdown__option"
              >
                {opt.label}
              </option>
            )
          )}
        </select>
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
      </div>
      {hasError ? (
        <span className="a2ui-host-dropdown__error">{props.validationErrors[0]}</span>
      ) : null}
    </div>
  );
});
