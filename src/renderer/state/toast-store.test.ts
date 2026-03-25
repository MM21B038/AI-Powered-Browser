import { describe, expect, it } from "vitest";
import { useToastStore } from "./toast-store";

describe("toast-store", () => {
  it("shows and hides toast state", () => {
    useToastStore.getState().hide();
    useToastStore.getState().show("hello", 100);
    expect(useToastStore.getState().visible).toBe(true);
    expect(useToastStore.getState().message).toBe("hello");
    useToastStore.getState().hide();
    expect(useToastStore.getState().visible).toBe(false);
  });
});
