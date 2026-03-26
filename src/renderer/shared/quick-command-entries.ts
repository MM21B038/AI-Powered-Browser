/**
 * Quick panel buttons: `data-command` values must match `runQuickCommand` in kernel.ts
 * and tools-catalog `command` fields where applicable.
 */
export type QuickCommandEntry = { command: string; label: string };

export const QUICK_COMMAND_ENTRIES: readonly QuickCommandEntry[] = [
  { command: "navigate", label: "Go to URL" },
  { command: "nav", label: "Nav controls" },
  { command: "tab", label: "Tab controls" },
  { command: "tabs", label: "List tabs" },
  { command: "url", label: "Get URL" },
  { command: "title", label: "Get title" },
  { command: "click", label: "Click (picker)" },
  { command: "fill", label: "Fill form (picker)" },
  { command: "type", label: "Type text" },
  { command: "scroll", label: "Scroll" },
  { command: "wait", label: "Wait" },
  { command: "screenshot", label: "Screenshot" },
  { command: "viewportMd", label: "Viewport MD" },
  { command: "formSchema", label: "Form schema" },
  { command: "interactables", label: "Interactables" },
  { command: "picker", label: "Element picker" },
  { command: "pickerInteractive", label: "Interactive picker" },
  { command: "elemshot", label: "Element screenshot" },
];
