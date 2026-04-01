import type { ElectronApi } from "../../shared/ipc-types";

export function getElectronApi(): ElectronApi | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { electronAPI?: ElectronApi };
  return w.electronAPI ?? null;
}
