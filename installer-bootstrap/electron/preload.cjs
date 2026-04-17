const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("installer", {
  getDefaultInstallDir: () => ipcRenderer.invoke("installer:get-default-dir"),
  pickInstallDirectory: () => ipcRenderer.invoke("installer:pick-dir"),
  runSilentInstall: (targetDir) =>
    ipcRenderer.invoke("installer:run-silent", targetDir),
  closeWindow: () => ipcRenderer.send("installer:close"),
});
