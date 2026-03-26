import { create } from "zustand";

type ChatState = {
  open: boolean;
  panelWidth: number;
  setOpen: (open: boolean) => void;
  setPanelWidth: (w: number) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  open: true,
  panelWidth: 360,
  setOpen: (open) => set({ open }),
  setPanelWidth: (panelWidth) => set({ panelWidth }),
}));
