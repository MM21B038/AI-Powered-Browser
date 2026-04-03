import { describe, expect, it } from "vitest";
import { useUiStore } from "./ui-store";

describe("ui-store", () => {
  it("toggles request workbench panel", () => {
    useUiStore.setState({ requestWorkbenchOpen: false });
    useUiStore.getState().toggleRequestWorkbench();
    expect(useUiStore.getState().requestWorkbenchOpen).toBe(true);
    useUiStore.getState().toggleRequestWorkbench();
    expect(useUiStore.getState().requestWorkbenchOpen).toBe(false);
  });
});
