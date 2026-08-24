import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_PORT = 43174;
const DEV_UI = process.env.ONBOARD_UI_URL || "http://127.0.0.1:43173";

let mainWindow;

function preloadPath() {
  return path.join(import.meta.dirname, "preload.cjs");
}

function bootHtml(message) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AI 电脑基础安装</title></head>
<body style="margin:0;background:#f3eee4;color:#1b1714;font-family:'Noto Sans SC',sans-serif">
  <div style="max-width:560px;margin:12vh auto;padding:0 24px">
    <p style="letter-spacing:.2em;color:#0f6e6a;font-size:12px;font-weight:700">ONBOARD</p>
    <h1 style="font-size:28px;margin:8px 0 12px">AI 电脑基础安装</h1>
    <p style="line-height:1.7;color:#6b6258">${message}</p>
  </div>
</body></html>`)}`;
}

function unpackedStaticDir() {
  const appPath = app.getAppPath();
  if (appPath.endsWith(".asar")) {
    return path.join(path.dirname(appPath), "app.asar.unpacked", "dist");
  }
  return path.join(appPath, "dist");
}

async function waitForHealth(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`装机服务没有在 ${timeoutMs}ms 内就绪：${url}`);
}

async function startPackagedServer() {
  const startJs = path.join(app.getAppPath(), "dist-server", "start.js");
  const staticDir = unpackedStaticDir();
  process.env.ONBOARD_SERVE = "1";
  process.env.ONBOARD_STATIC_DIR = staticDir;
  const mod = await import(pathToFileURL(startJs).href);
  await mod.startServer({
    serveStatic: true,
    staticDir,
    port: API_PORT,
  });
  const url = `http://127.0.0.1:${API_PORT}`;
  await waitForHealth(`${url}/api/health`);
  return url;
}

async function resolveUiUrl() {
  if (!app.isPackaged) return DEV_UI;
  return startPackagedServer();
}

function compareVersions(a, b) {
  const left = String(a || "")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || "")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const d = (left[i] ?? 0) - (right[i] ?? 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  return 0;
}

function sendUpdater(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", payload);
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    title: "AI 电脑基础安装",
    backgroundColor: "#f3eee4",
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = undefined;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(bootHtml("正在启动本机装机服务，请稍候…"));

  try {
    const ui = await resolveUiUrl();
    await win.loadURL(ui);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await win.loadURL(
      bootHtml(`窗口打不开，是因为安装包没有把自己的界面服务拉起来。<br><br>${message}<br><br>请安装 GitHub 上的 v1.1.1 或更新版本。`),
    );
  }

  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    if (code === -3) return;
    void win.loadURL(bootHtml(`页面加载失败（${code} ${desc}）。地址：${url}`));
  });
}

async function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    const updater = await import("electron-updater");
    const autoUpdater = updater.autoUpdater ?? updater.default?.autoUpdater;
    if (!autoUpdater) return;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.on("checking-for-update", () => {
      sendUpdater({ phase: "checking", message: "正在检查应用内更新…" });
    });
    autoUpdater.on("update-available", (info) => {
      sendUpdater({
        phase: "available",
        version: info.version,
        message: `发现新版本 ${info.version}，可以直接在应用里下载安装。`,
      });
    });
    autoUpdater.on("update-not-available", () => {
      sendUpdater({ phase: "idle", message: `已是最新版本 ${app.getVersion()}。` });
    });
    autoUpdater.on("download-progress", (progress) => {
      sendUpdater({
        phase: "downloading",
        percent: progress.percent,
        message: `正在下载更新 ${Math.round(progress.percent || 0)}%`,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      sendUpdater({
        phase: "ready",
        version: info.version,
        percent: 100,
        message: `新版本 ${info.version} 已下载，重启后完成安装。`,
      });
    });
    autoUpdater.on("error", (error) => {
      sendUpdater({
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
    ipcMain.handle("updater:check", async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        const latest = result?.updateInfo?.version;
        return {
          currentVersion: app.getVersion(),
          latestVersion: latest,
          available: Boolean(latest && compareVersions(latest, app.getVersion()) > 0),
        };
      } catch (error) {
        return {
          currentVersion: app.getVersion(),
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    ipcMain.handle("updater:download", async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    ipcMain.handle("updater:install", () => {
      autoUpdater.quitAndInstall(false, true);
    });
    await autoUpdater.checkForUpdates().catch((error) => {
      console.warn("auto-update check failed", error);
    });
  } catch (error) {
    console.warn("auto-update unavailable", error);
  }
}

app.whenReady().then(async () => {
  await createWindow();
  void setupUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
