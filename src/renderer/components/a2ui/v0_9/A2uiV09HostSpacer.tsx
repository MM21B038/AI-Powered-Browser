import { createReactComponent } from "@a2ui/react/v0_9";
import { SpacerApi } from "./a2ui-v0_9-spacer-api";

export const a2uiV09HostSpacerComponent = createReactComponent(SpacerApi as any, ({ props }) => {
  const grow = props.weight ?? 1;
  return (
    <div
      className="a2ui-host-spacer"
      aria-hidden="true"
      style={{
        flexGrow: grow,
        flexShrink: 0,
        flexBasis: 0,
        minWidth: props.minWidth ?? 0,
        minHeight: props.minHeight ?? 0,
      }}
    />
  );
});
