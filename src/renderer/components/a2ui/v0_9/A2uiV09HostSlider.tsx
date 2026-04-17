/**
 * Host A2UI v0.9 `Slider`: theme styles + optional fractional steps (up to 3 decimal places).
 * Upstream `SliderApi.schema` is `.strict()` and rejects `step` / `decimalPlaces`; we use
 * `.passthrough()` so NDJSON can set them without forking Zod across zod v3/v4.
 */
import { type ChangeEvent, useId } from "react";
import { createReactComponent } from "@a2ui/react/v0_9";
import { SliderApi } from "@a2ui/web_core/v0_9/basic_catalog";

export const a2uiV09HostSliderApi = {
  name: "Slider" as const,
  schema: (SliderApi as { schema: { passthrough: () => unknown } }).schema.passthrough(),
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundToDecimals(n: number, places: number): number {
  if (!Number.isFinite(n)) return 0;
  if (places <= 0) return Math.round(n);
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function parseSliderProps(props: {
  min?: number;
  max?: number;
  value?: unknown;
  step?: unknown;
  decimalPlaces?: unknown;
}): {
  min: number;
  max: number;
  valueNum: number;
  step: number;
  decimalPlaces?: number;
} {
  const min = typeof props.min === "number" && Number.isFinite(props.min) ? props.min : 0;
  const max = typeof props.max === "number" && Number.isFinite(props.max) ? props.max : 100;
  const hi = Math.max(min, max);
  const lo = Math.min(min, max);

  const rawDp = props.decimalPlaces;
  let decimalPlaces: number | undefined;
  if (typeof rawDp === "number" && Number.isFinite(rawDp)) {
    decimalPlaces = clamp(Math.floor(rawDp), 0, 3);
  }

  let step: number;
  if (typeof props.step === "number" && Number.isFinite(props.step) && props.step > 0) {
    step = props.step;
  } else if (decimalPlaces !== undefined) {
    step = decimalPlaces === 0 ? 1 : 1 / 10 ** decimalPlaces;
  } else {
    step = 1;
  }

  const vRaw = props.value;
  const valueNum =
    typeof vRaw === "number" && Number.isFinite(vRaw)
      ? vRaw
      : typeof vRaw === "string"
        ? Number.parseFloat(vRaw.trim())
        : Number(vRaw);
  const safe = Number.isFinite(valueNum) ? valueNum : lo;

  return { min: lo, max: hi, valueNum: clamp(safe, lo, hi), step, decimalPlaces };
}

function formatReadout(n: number, decimalPlaces: number | undefined): string {
  if (decimalPlaces === undefined) return String(Math.round(n));
  if (decimalPlaces <= 0) return String(Math.round(n));
  let s = n.toFixed(decimalPlaces);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s;
}

export const a2uiV09HostSliderComponent = createReactComponent(a2uiV09HostSliderApi as any, ({ props }) => {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    const { min, max, decimalPlaces } = parseSliderProps(props);
    const clamped = clamp(v, min, max);
    const rounded =
      decimalPlaces !== undefined ? roundToDecimals(clamped, decimalPlaces) : Math.round(clamped);
    props.setValue(rounded);
  };
  const uniqueId = useId();
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  const invalid = props.isValid === false;
  const disabled = invalid;

  const { min, max, valueNum, step, decimalPlaces } = parseSliderProps(props);
  const display = formatReadout(valueNum, decimalPlaces);
  const rangeValue = decimalPlaces !== undefined ? roundToDecimals(valueNum, decimalPlaces) : Math.round(valueNum);

  return (
    <div className="a2ui-host-slider">
      <div className="a2ui-host-slider__top">
        {props.label ? (
          <label htmlFor={uniqueId} className="a2ui-host-slider__label">
            {props.label}
          </label>
        ) : (
          <span />
        )}
        <span className="a2ui-host-slider__value">{display}</span>
      </div>
      <input
        id={uniqueId}
        className="a2ui-host-slider__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={rangeValue}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={hasError || invalid ? true : undefined}
      />
      {hasError ? <span className="a2ui-host-textfield__error">{props.validationErrors[0]}</span> : null}
    </div>
  );
});
