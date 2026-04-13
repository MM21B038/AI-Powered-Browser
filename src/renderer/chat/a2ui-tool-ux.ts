/** Tool name for in-chat A2UI submission; hidden from the tool-result UI. */
export const HIDDEN_INTELLIGENT_A2UI_TOOL = "intelligent_a2ui_submit";

export function isHiddenIntelligentA2uiTool(name: string): boolean {
  return name.trim() === HIDDEN_INTELLIGENT_A2UI_TOOL;
}
