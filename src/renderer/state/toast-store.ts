import { create } from "zustand";

type ToastState = {
  message: string;
  visible: boolean;
  durationMs: number;
  show: (message: string, durationMs?: number) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  message: "",
  visible: false,
  durationMs: 3000,
  show: (message, durationMs = 3000) =>
    set({ message, visible: true, durationMs }),
  hide: () => set({ visible: false }),
}));
