import { create } from "zustand";

type UiState = {
  requestWorkbenchOpen: boolean;
  setRequestWorkbenchOpen: (open: boolean) => void;
  toggleRequestWorkbench: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  requestWorkbenchOpen: false,
  setRequestWorkbenchOpen: (open) => set({ requestWorkbenchOpen: open }),
  toggleRequestWorkbench: () =>
    set((state) => ({ requestWorkbenchOpen: !state.requestWorkbenchOpen })),
}));
