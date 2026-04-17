/**
 * Host A2UI v0.9 `Button`: same schema as upstream; styles use app theme via
 * `.a2ui-host-button` in `style-a2ui-host-tokens.css`.
 */
import { createReactComponent } from "@a2ui/react/v0_9";
import { ButtonApi } from "@a2ui/web_core/v0_9/basic_catalog";

export const a2uiV09HostButtonComponent = createReactComponent(ButtonApi as any, ({ props, buildChild, context }) => {
  const variant = props.variant ?? "default";
  const invalid = props.isValid === false;
  const className = [
    "a2ui-host-button",
    `a2ui-host-button--${variant}`,
    invalid ? "a2ui-host-button--invalid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const onActivate = () => {
    const a = props.action;
    if (typeof a === "function") {
      a();
      return;
    }
    if (a && typeof a === "object" && "event" in (a as object)) {
      (context as { dispatchAction?: (p: unknown) => void }).dispatchAction?.(a);
    }
  };

  return (
    <button type="button" className={className} onClick={() => onActivate()} disabled={invalid}>
      {props.child ? buildChild(props.child) : null}
    </button>
  );
});
