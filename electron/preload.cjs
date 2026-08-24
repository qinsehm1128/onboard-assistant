const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("onboardDesktop", {
  isDesktop: true,
});
