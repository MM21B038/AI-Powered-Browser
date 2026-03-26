import type { ElectronApi } from "../../shared/ipc-types";

export function getElectronApi(): ElectronApi | null {
  return typeof window !== "undefined" && window.electronAPI ? window.electronAPI : null;
}
