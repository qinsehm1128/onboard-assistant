import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const UI = process.env.ONBOARD_UI_URL || "http://127.0.0.1:43173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    title: "AI 电脑基础安装",
    backgroundColor: "#f3eee4",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(UI);
}

async function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const updater = await import("electron-updater");
    const autoUpdater = updater.autoUpdater ?? updater.default?.autoUpdater;
    if (!autoUpdater) return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    ipcMain.handle("updater:check", async () => {
      const result = await autoUpdater.checkForUpdates();
      return {
        currentVersion: app.getVersion(),
        latestVersion: result?.updateInfo?.version,
        available: Boolean(result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()),
      };
    });
    ipcMain.handle("updater:download", async () => {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    });
    ipcMain.handle("updater:install", () => {
      autoUpdater.quitAndInstall();
    });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn("auto-update unavailable", error);
  }
}

app.whenReady().then(() => {
  createWindow();
  void setupUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
