/**
 * Host-themed A2UI v0.9 interactive components (same APIs as `@a2ui/web_core/v0_9/basic_catalog`).
 */
import { useCallback, useId, useRef, useState, type ChangeEvent, type HTMLInputTypeAttribute } from "react";
import { createReactComponent } from "@a2ui/react/v0_9";
import {
  CheckBoxApi,
  ChoicePickerApi,
  DateTimeInputApi,
  TextFieldApi,
} from "@a2ui/web_core/v0_9/basic_catalog";
import { a2uiV09HostSliderComponent } from "./A2uiV09HostSlider";

export const a2uiV09HostTextField = createReactComponent(TextFieldApi as any, ({ props }) => {
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    props.setValue(e.target.value);
  };
  const isLong = props.variant === "longText";
  const type = props.variant === "number" ? "number" : props.variant === "obscured" ? "password" : "text";
  const uniqueId = useId();
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const invalid = props.isValid === false;
  const disabled = invalid;

  const baseField = isLong ? "a2ui-host-textfield__textarea" : "a2ui-host-textfield__input";
  const inputClass = hasError ? `${baseField} ${baseField}--error` : baseField;

  return (
    <div className="a2ui-host-textfield">
      {props.label ? (
        <label htmlFor={uniqueId} className="a2ui-host-textfield__label">
          {props.label}
        </label>
      ) : null}
      {isLong ? (
        <textarea
          id={uniqueId}
          className={inputClass}
          value={props.value || ""}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={hasError || invalid ? true : undefined}
          rows={4}
        />
      ) : (
        <input
          id={uniqueId}
          className={inputClass}
          type={type}
          value={props.value || ""}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={hasError || invalid ? true : undefined}
        />
      )}
      {hasError ? <span className="a2ui-host-textfield__error">{props.validationErrors[0]}</span> : null}
    </div>
  );
});

export const a2uiV09HostCheckBox = createReactComponent(CheckBoxApi as any, ({ props }) => {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    props.setValue(e.target.checked);
  };
  const uniqueId = useId();
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const invalid = props.isValid === false;
  const disabled = invalid;

  return (
    <div className="a2ui-host-checkbox">
      <div className="a2ui-host-checkbox__row">
        <input
          id={uniqueId}
          className="a2ui-host-checkbox__input"
          type="checkbox"
          checked={!!props.value}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={hasError || invalid ? true : undefined}
        />
        {props.label ? (
          <label htmlFor={uniqueId} className="a2ui-host-checkbox__label">
            {props.label}
          </label>
        ) : null}
      </div>
      {hasError ? <span className="a2ui-host-textfield__error">{props.validationErrors?.[0]}</span> : null}
    </div>
  );
});

export const a2uiV09HostSlider = a2uiV09HostSliderComponent;

/**
 * ChoicePicker catalog type is `DynamicStringList`, but surfaces often bind to a **scalar**
 * string in the data model (e.g. `"12"` for math_eval). Internally we always derive a `string[]`
 * for chip/radio selection state.
 */
function normalizeChoicePickerSelectedValues(raw: unknown, mutuallyExclusive: boolean): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw == null) return [];
  const s = String(raw).trim();
  if (s === "") return [];
  if (mutuallyExclusive) return [s];
  return [s];
}

export const a2uiV09HostDateTimeInput = createReactComponent(DateTimeInputApi as any, ({ props }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    props.setValue(e.target.value);
  };
  const uniqueId = useId();
  let type: HTMLInputTypeAttribute = "datetime-local";
  if (props.enableDate && !props.enableTime) type = "date";
  if (!props.enableDate && props.enableTime) type = "time";
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const invalid = props.isValid === false;
  const disabled = invalid;

  const focusAndPick = useCallback(() => {
    const el = inputRef.current;
    if (!el || disabled) return;
    el.focus();
    try {
      const anyEl = el as HTMLInputElement & { showPicker?: () => void };
      anyEl.showPicker?.();
    } catch {
      /* some browsers throw if not user gesture */
    }
  }, [disabled]);

  return (
    <div className="a2ui-host-datetime">
      {props.label ? (
        <label htmlFor={uniqueId} className="a2ui-host-datetime__label">
          {props.label}
        </label>
      ) : null}
      <div className="a2ui-host-datetime__field" onClick={focusAndPick}>
        <input
          ref={inputRef}
          id={uniqueId}
          className="a2ui-host-datetime__input"
          type={type}
          value={props.value || ""}
          onChange={onChange}
          min={typeof props.min === "string" ? props.min : undefined}
          max={typeof props.max === "string" ? props.max : undefined}
          disabled={disabled}
          aria-invalid={hasError || invalid ? true : undefined}
        />
      </div>
      {hasError ? <span className="a2ui-host-textfield__error">{props.validationErrors[0]}</span> : null}
    </div>
  );
});

export const a2uiV09HostChoicePicker = createReactComponent(ChoicePickerApi as any, ({ props, context }) => {
  const [filter, setFilter] = useState("");
  /** Spec default is mutually exclusive unless `variant` is `multipleSelection`. */
  const isMutuallyExclusive = props.variant !== "multipleSelection";
  const values = normalizeChoicePickerSelectedValues(props.value, isMutuallyExclusive);
  const filterId = useId();

  const onToggle = (val: string) => {
    if (isMutuallyExclusive) {
      // Store a scalar string so paths like `/frequency` stay numeric-friendly for `math_eval` /
      // `series_expr`; read path normalizes back to an array for selection UI.
      props.setValue(val);
    } else {
      const newValues = values.includes(val) ? values.filter((v: string) => v !== val) : [...values, val];
      props.setValue(newValues);
    }
  };

  const options = (props.options || []).filter(
    (opt: { label: string; value: string }) =>
      !props.filterable ||
      filter === "" ||
      String(opt.label).toLowerCase().includes(filter.toLowerCase())
  );

  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const invalid = props.isValid === false;
  const disabled = invalid;
  const listClass =
    "a2ui-host-choicepicker__list " +
    (props.displayStyle === "chips" ? "a2ui-host-choicepicker__list--row" : "a2ui-host-choicepicker__list--column");

  return (
    <div className="a2ui-host-choicepicker">
      {props.label ? <div className="a2ui-host-choicepicker__label">{props.label}</div> : null}
      {props.filterable ? (
        <input
          id={filterId}
          type="search"
          className="a2ui-host-choicepicker__filter"
          placeholder="Filter options…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={disabled}
          aria-label={props.label ? `Filter ${String(props.label)}` : "Filter options"}
        />
      ) : null}
      <div className={listClass} role="group" aria-label={props.label ? String(props.label) : undefined}>
        {options.map((opt: { label: string; value: string }, i: number) => {
          const isSelected = values.includes(opt.value);
          if (props.displayStyle === "chips") {
            return (
              <button
                key={`${opt.value}-${i}`}
                type="button"
                className={
                  "a2ui-host-choicepicker__chip" +
                  (isSelected ? " a2ui-host-choicepicker__chip--selected" : "")
                }
                onClick={() => onToggle(opt.value)}
                disabled={disabled}
              >
                {opt.label}
              </button>
            );
          }
          return (
            <label key={`${opt.value}-${i}`} className="a2ui-host-choicepicker__option">
              <input
                type={isMutuallyExclusive ? "radio" : "checkbox"}
                checked={isSelected}
                onChange={() => onToggle(opt.value)}
                name={isMutuallyExclusive ? `choice-${context.componentModel.id}` : undefined}
                disabled={disabled}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
      {hasError ? <span className="a2ui-host-textfield__error">{props.validationErrors[0]}</span> : null}
    </div>
  );
});

export const A2UI_V09_HOST_INTERACTIVE_COMPONENT_NAMES = [
  "TextField",
  "CheckBox",
  "Slider",
  "DateTimeInput",
  "ChoicePicker",
] as const;

const HOST_INTERACTIVE_COMPONENTS = [
  a2uiV09HostTextField,
  a2uiV09HostCheckBox,
  a2uiV09HostSlider,
  a2uiV09HostDateTimeInput,
  a2uiV09HostChoicePicker,
] as const;

export function getA2uiV09HostInteractiveComponents(): readonly any[] {
  return HOST_INTERACTIVE_COMPONENTS;
}
