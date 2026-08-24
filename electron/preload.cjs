const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("onboardDesktop", {
  isDesktop: true,
  checkUpdate: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
});
