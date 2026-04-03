export type InstallResult =
  | { ok: true }
  | { ok: false; message: string };

export type InstallerApi = {
  getDefaultInstallDir: () => Promise<string>;
  pickInstallDirectory: () => Promise<string | null>;
  runSilentInstall: (targetDir: string) => Promise<InstallResult>;
  closeWindow: () => void;
};
