import { Catalog } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/react/v0_9";
import { A2UI_V09_HOST_CATALOG_JSON_URL } from "../../shared/a2ui-v0_9-constants";
import {
  A2UI_V09_HOST_BASIC_LAYOUT_COMPONENT_NAMES,
  getA2uiV09HostBasicLayoutComponents,
} from "../components/a2ui/v0_9/a2ui-v0_9-host-basic-layout-components";
import {
  A2UI_V09_HOST_INTERACTIVE_COMPONENT_NAMES,
  getA2uiV09HostInteractiveComponents,
} from "../components/a2ui/v0_9/a2ui-v0_9-host-interactive-components";
import { a2uiV09HostButtonComponent } from "../components/a2ui/v0_9/A2uiV09HostButton";
import { a2uiV09HostDropdownComponent } from "../components/a2ui/v0_9/A2uiV09Dropdown";
import { a2uiV09HostSpacerComponent } from "../components/a2ui/v0_9/A2uiV09HostSpacer";
import {
  A2UI_V09_HOST_CHART_COMPONENT_NAMES,
  getA2uiV09HostChartComponents,
} from "../components/a2ui/v0_9/a2ui-v0_9-host-chart-components";
import { a2uiV09HostModelViewer3D } from "../components/a2ui/v0_9/A2uiV09HostModelViewer3D";
import { getA2uiV09ExtraCatalogFunctions } from "./a2ui-v0_9-extended-catalog";

/** Upstream `basicCatalog` entries replaced by host implementations (layout, interactives, Spacer, themed Button). */
const HOST_REPLACEMENT_NAMES = new Set<string>([
  ...A2UI_V09_HOST_BASIC_LAYOUT_COMPONENT_NAMES,
  ...A2UI_V09_HOST_INTERACTIVE_COMPONENT_NAMES,
  "Button",
  "Spacer",
]);

/**
 * Interactive + layout/media components allowed in the host v0.9 catalog.
 * Layout, interactives, `Spacer`, `Button`, and `Dropdown` use host renderers; upstream supplies filtered remainder.
 */
const A2UI_V09_HOST_CATALOG_COMPONENT_NAMES = [
  "Column",
  "Row",
  "Text",
  "Card",
  "Divider",
  "List",
  "Image",
  "Tabs",
  "Modal",
  "Icon",
  "Video",
  "AudioPlayer",
  "Spacer",
  "TextField",
  "Button",
  "Slider",
  "CheckBox",
  "ChoicePicker",
  "Dropdown",
  "DateTimeInput",
  "ModelViewer3D",
  ...A2UI_V09_HOST_CHART_COMPONENT_NAMES,
] as const;

const ALLOWED = new Set<string>(A2UI_V09_HOST_CATALOG_COMPONENT_NAMES);

/**
 * Host-owned catalog: host layout/media renderers + upstream interactive components from
 * `basicCatalog`, allowlisted, with {@link A2UI_V09_HOST_CATALOG_JSON_URL} as `catalog.id`.
 */
export function buildA2uiV09HostCatalog(): any {
  const all = Array.from((basicCatalog as any).components?.values?.() ?? []) as any[];
  const filtered = all.filter(
    (c: any) =>
      typeof c?.name === "string" &&
      ALLOWED.has(c.name) &&
      !HOST_REPLACEMENT_NAMES.has(c.name)
  );
  const hostLayout = getA2uiV09HostBasicLayoutComponents();
  const hostInteractives = getA2uiV09HostInteractiveComponents();
  const hostCharts = getA2uiV09HostChartComponents();
  const baseFns = Array.from((basicCatalog as any).functions?.values?.() ?? []) as any[];
  const extra = getA2uiV09ExtraCatalogFunctions();
  return new Catalog(
    A2UI_V09_HOST_CATALOG_JSON_URL,
    [
      ...filtered,
      ...hostLayout,
      ...hostInteractives,
      ...hostCharts,
      a2uiV09HostModelViewer3D,
      a2uiV09HostSpacerComponent,
      a2uiV09HostButtonComponent,
      a2uiV09HostDropdownComponent,
    ],
    [...baseFns, ...extra]
  );
}

export function getA2uiV09HostCatalogComponentNames(): readonly string[] {
  return [...ALLOWED].sort();
}
