import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import type { TargetOs } from "../shared/types.ts";
import { allStates, log, recentLogs, setState, subscribe } from "./bus.ts";
import { CATEGORIES, itemsForOs, voiceTypingDocs } from "./catalog.ts";
import { detectAll, detectItem } from "./detect.ts";
import { cancelInstall, enqueueInstall, enqueueMany } from "./install.ts";
import { launchDetached, openPath, openUrl } from "./launch.ts";
import { downloadDir, hostArch, hostPlatform } from "./paths.ts";
import { checkForUpdate, currentVersion, REPO_URL } from "./update.ts";

export function parseOs(value: unknown): TargetOs {
  return value === "darwin" ? "darwin" : "win32";
}

export function createApp(options: { serveStatic?: boolean } = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/session", (_req, res) => {
    const host = hostPlatform();
    res.json({
      hostPlatform: host,
      arch: hostArch(),
      downloadDir: downloadDir(),
      preview: host === "linux",
      hostname: process.env.HOSTNAME || "local",
      version: currentVersion(),
      repoUrl: REPO_URL,
      visibility: "public",
    });
  });

  app.get("/api/update", async (_req, res) => {
    try {
      res.json(await checkForUpdate());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/catalog", (req, res) => {
    const os = parseOs(req.query.os);
    const items = itemsForOs(os).map((item) => ({
      ...item,
      docsUrl: item.id === "voice-typing" ? voiceTypingDocs(os) : item.docsUrl,
    }));
    res.json({ os, categories: CATEGORIES, items });
  });

  app.get("/api/detect", async (req, res) => {
    try {
      const os = parseOs(req.query.os);
      const items = await detectAll(os);
      for (const state of Object.values(items)) {
        const current = allStates()[state.id];
        if (current && ["queued", "resolving", "downloading", "installing"].includes(current.status)) {
          continue;
        }
        setState(state);
      }
      res.json({ items: { ...items, ...pickBusy() } });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/detect/:id", async (req, res) => {
    try {
      const state = await detectItem(req.params.id);
      res.json(setState(state));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/install/:id", (req, res) => {
    const os = parseOs(req.body?.os ?? req.query.os);
    enqueueInstall(req.params.id, os);
    log("info", `开始处理 ${req.params.id}`, req.params.id);
    res.json({ ok: true, id: req.params.id });
  });

  app.post("/api/install-all", (req, res) => {
    const os = parseOs(req.body?.os);
    const ids = (req.body?.ids as string[] | undefined) || itemsForOs(os).map((item) => item.id);
    void enqueueMany(ids, os);
    log("info", `开始批量安装 ${ids.length} 项`);
    res.json({ ok: true, ids });
  });

  app.post("/api/cancel/:id", (req, res) => {
    cancelInstall(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/open-path", async (req, res) => {
    try {
      await openPath(String(req.body?.path || ""));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/open-url", async (req, res) => {
    try {
      await openUrl(String(req.body?.url || ""));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/launch", (req, res) => {
    try {
      launchDetached(String(req.body?.path || ""));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/logs", (_req, res) => {
    res.json({ logs: recentLogs() });
  });

  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: "session", at: new Date().toISOString() })}\n\n`);
    const unsubscribe = subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on("close", unsubscribe);
  });

  if (options.serveStatic) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dist = path.resolve(here, "../dist");
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.use((req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        res.sendFile(path.join(dist, "index.html"));
      });
    }
  }

  return app;
}

function pickBusy(): Record<string, ReturnType<typeof setState>> {
  const busy = Object.values(allStates()).filter((state) =>
    ["queued", "resolving", "downloading", "installing"].includes(state.status),
  );
  return Object.fromEntries(busy.map((state) => [state.id, state]));
}
