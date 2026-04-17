/**
 * Host-owned A2UI v0.9 layout/media components: same Zod APIs as upstream
 * `@a2ui/web_core/v0_9/basic_catalog`, renderer implementations live in-repo.
 * Spacing uses CSS variables `--a2ui-host-*` in `style-a2ui-host-tokens.css`.
 */
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { createReactComponent } from "@a2ui/react/v0_9";
import {
  AudioPlayerApi,
  CardApi,
  ColumnApi,
  DividerApi,
  IconApi,
  ImageApi,
  ListApi,
  ModalApi,
  RowApi,
  TabsApi,
  TextApi,
  VideoApi,
} from "@a2ui/web_core/v0_9/basic_catalog";
import { resolveA2uiV09IconName } from "./a2ui-v0_9-host-icon-resolve";
import { renderA2uiV09HostExtraIcon } from "./a2ui-v0_9-host-icon-extras";

function mapJustify(
  j: string | undefined
): "center" | "flex-end" | "space-around" | "space-between" | "space-evenly" | "flex-start" | "stretch" {
  switch (j) {
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "spaceAround":
      return "space-around";
    case "spaceBetween":
      return "space-between";
    case "spaceEvenly":
      return "space-evenly";
    case "start":
      return "flex-start";
    case "stretch":
      return "stretch";
    default:
      return "flex-start";
  }
}

function mapAlign(
  a: string | undefined
): "flex-start" | "center" | "flex-end" | "stretch" {
  switch (a) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "stretch":
      return "stretch";
    default:
      return "stretch";
  }
}

function ChildList(props: {
  childList: unknown;
  buildChild: (id: string, basePath?: string) => ReactNode;
}): ReactNode {
  const { childList, buildChild } = props;
  if (!Array.isArray(childList)) return null;
  return (
    <>
      {childList.map((item, i) => {
        if (item && typeof item === "object" && "id" in item) {
          const node = item as { id: string; basePath?: string };
          return <Fragment key={`${node.id}-${i}`}>{buildChild(node.id, node.basePath)}</Fragment>;
        }
        if (typeof item === "string") {
          return <Fragment key={`${item}-${i}`}>{buildChild(item)}</Fragment>;
        }
        return null;
      })}
    </>
  );
}

export const a2uiV09HostText = createReactComponent(TextApi as any, ({ props }) => {
  const text = props.text ?? "";
  const leaf = "a2ui-host-leaf";
  switch (props.variant) {
    case "h1":
      return (
        <h1 className={leaf} style={{ display: "block" }}>
          {text}
        </h1>
      );
    case "h2":
      return (
        <h2 className={leaf} style={{ display: "block" }}>
          {text}
        </h2>
      );
    case "h3":
      return (
        <h3 className={leaf} style={{ display: "block" }}>
          {text}
        </h3>
      );
    case "h4":
      return (
        <h4 className={leaf} style={{ display: "block" }}>
          {text}
        </h4>
      );
    case "h5":
      return (
        <h5 className={leaf} style={{ display: "block" }}>
          {text}
        </h5>
      );
    case "caption":
      return (
        <small className={leaf} style={{ display: "block", color: "var(--text2)", textAlign: "left" }}>
          {text}
        </small>
      );
    case "body":
    default:
      return (
        <span className={leaf} style={{ display: "inline-block" }}>
          {text}
        </span>
      );
  }
});

export const a2uiV09HostImage = createReactComponent(ImageApi as any, ({ props }) => {
  const mapFit = (fit: string | undefined) => {
    if (fit === "scaleDown") return "scale-down" as const;
    return (fit || "fill") as React.CSSProperties["objectFit"];
  };
  const style: React.CSSProperties = {
    objectFit: mapFit(props.fit),
    width: "100%",
    height: "auto",
    display: "block",
  };
  if (props.variant === "icon") {
    style.width = "24px";
    style.height = "24px";
  } else if (props.variant === "avatar") {
    style.width = "40px";
    style.height = "40px";
    style.borderRadius = "50%";
  } else if (props.variant === "smallFeature") {
    style.maxWidth = "100px";
  } else if (props.variant === "largeFeature") {
    style.maxHeight = "400px";
  } else if (props.variant === "header") {
    style.height = "200px";
    style.objectFit = "cover";
  }
  return (
    <img
      className="a2ui-host-leaf"
      src={props.url}
      alt={props.description || ""}
      style={style}
    />
  );
});

function a2uiV09IconNameFromProps(props: { name?: unknown; iconName?: unknown }): string {
  const n = props.name;
  if (typeof n === "string") return n;
  if (n && typeof n === "object" && "path" in (n as object)) {
    const p = (n as { path?: unknown }).path;
    if (typeof p === "string") return p;
  }
  if (typeof props.iconName === "string") return props.iconName;
  return "";
}

export const a2uiV09HostIcon = createReactComponent(IconApi as any, ({ props }) => {
  const raw = a2uiV09IconNameFromProps(props as { name?: unknown; iconName?: unknown });
  const resolved = resolveA2uiV09IconName(raw);

  const boxStyle: CSSProperties = {
    fontSize: "24px",
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text)",
  };

  if (resolved.kind === "host") {
    return (
      <span
        className="a2ui-host-icon a2ui-host-icon--host a2ui-host-leaf"
        style={boxStyle}
      >
        {renderA2uiV09HostExtraIcon(resolved.key)}
      </span>
    );
  }

  const matClass =
    resolved.style === "rounded"
      ? "a2ui-host-icon a2ui-host-icon--material a2ui-host-icon--rounded material-symbols-rounded"
      : resolved.style === "sharp"
        ? "a2ui-host-icon a2ui-host-icon--material a2ui-host-icon--sharp material-symbols-sharp"
        : "a2ui-host-icon a2ui-host-icon--material a2ui-host-icon--outlined material-symbols-outlined";

  return (
    <span className={`${matClass} a2ui-host-leaf`} style={boxStyle}>
      {resolved.ligature}
    </span>
  );
});

export const a2uiV09HostVideo = createReactComponent(VideoApi as any, ({ props }) => {
  return (
    <video
      className="a2ui-host-leaf"
      src={props.url}
      controls
      style={{ width: "100%", aspectRatio: "16 / 9" }}
    />
  );
});

export const a2uiV09HostAudioPlayer = createReactComponent(AudioPlayerApi as any, ({ props }) => {
  return (
    <div className="a2ui-host-leaf a2ui-host-audioplugin">
      {props.description ? <span className="a2ui-host-audioplugin__desc">{props.description}</span> : null}
      <audio src={props.url} controls style={{ width: "100%" }} />
    </div>
  );
});

export const a2uiV09HostRow = createReactComponent(RowApi as any, ({ props, buildChild }) => {
  return (
    <div
      className="a2ui-host-row"
      style={{
        justifyContent: mapJustify(props.justify),
        alignItems: mapAlign(props.align),
      }}
    >
      <ChildList childList={props.children} buildChild={buildChild} />
    </div>
  );
});

export const a2uiV09HostColumn = createReactComponent(ColumnApi as any, ({ props, buildChild }) => {
  return (
    <div
      className="a2ui-host-column"
      style={{
        justifyContent: mapJustify(props.justify),
        alignItems: mapAlign(props.align),
      }}
    >
      <ChildList childList={props.children} buildChild={buildChild} />
    </div>
  );
});

export const a2uiV09HostList = createReactComponent(ListApi as any, ({ props, buildChild }) => {
  const isHorizontal = props.direction === "horizontal";
  return (
    <div
      className={`a2ui-host-list ${isHorizontal ? "a2ui-host-list--horizontal" : "a2ui-host-list--vertical"}`}
      style={{ alignItems: mapAlign(props.align) }}
    >
      <ChildList childList={props.children} buildChild={buildChild} />
    </div>
  );
});

export const a2uiV09HostCard = createReactComponent(CardApi as any, ({ props, buildChild }) => {
  return (
    <div
      className="a2ui-host-card"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg3) 92%, var(--accent) 8%)",
        boxShadow: "0 2px 4px color-mix(in srgb, var(--bg0) 40%, transparent)",
        width: "100%",
      }}
    >
      {props.child ? buildChild(props.child) : null}
    </div>
  );
});

export const a2uiV09HostTabs = createReactComponent(TabsApi as any, ({ props, buildChild }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabs = props.tabs || [];
  const activeTab = tabs[selectedIndex];
  return (
    <div className="a2ui-host-tabs">
      <div className="a2ui-host-tabs__bar">
        {tabs.map((tab: { title: string; child: string }, i: number) => (
          <button
            key={i}
            type="button"
            className={`a2ui-host-tabs__tab${selectedIndex === i ? " a2ui-host-tabs__tab--active" : ""}`}
            onClick={() => setSelectedIndex(i)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="a2ui-host-tabs__panel">{activeTab ? buildChild(activeTab.child) : null}</div>
    </div>
  );
});

export const a2uiV09HostDivider = createReactComponent(DividerApi as any, ({ props }) => {
  const isVertical = props.axis === "vertical";
  return (
    <div
      className={`a2ui-host-divider ${isVertical ? "a2ui-host-divider--vertical" : "a2ui-host-divider--horizontal"}`}
      role="separator"
    />
  );
});

export const a2uiV09HostModal = createReactComponent(ModalApi as any, ({ props, buildChild }) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  return (
    <>
      <div
        className="a2ui-host-modal__trigger"
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
      >
        {props.trigger ? buildChild(props.trigger) : null}
      </div>
      {isOpen ? (
        <div className="a2ui-host-modal__backdrop" onClick={() => setIsOpen(false)}>
          <div className="a2ui-host-modal__panel" onClick={(e) => e.stopPropagation()}>
            <div className="a2ui-host-modal__close-row">
              <button
                type="button"
                className="a2ui-host-modal__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="a2ui-host-modal__body">{props.content ? buildChild(props.content) : null}</div>
          </div>
        </div>
      ) : null}
    </>
  );
});

/** Component type names implemented in this module (upstream schemas, host renderers). */
export const A2UI_V09_HOST_BASIC_LAYOUT_COMPONENT_NAMES = [
  "Text",
  "Image",
  "Icon",
  "Video",
  "AudioPlayer",
  "Row",
  "Column",
  "List",
  "Card",
  "Tabs",
  "Modal",
  "Divider",
] as const;

const HOST_BASIC_LAYOUT_COMPONENTS = [
  a2uiV09HostText,
  a2uiV09HostImage,
  a2uiV09HostIcon,
  a2uiV09HostVideo,
  a2uiV09HostAudioPlayer,
  a2uiV09HostRow,
  a2uiV09HostColumn,
  a2uiV09HostList,
  a2uiV09HostCard,
  a2uiV09HostTabs,
  a2uiV09HostModal,
  a2uiV09HostDivider,
] as const;

export function getA2uiV09HostBasicLayoutComponents(): readonly any[] {
  return HOST_BASIC_LAYOUT_COMPONENTS;
}
