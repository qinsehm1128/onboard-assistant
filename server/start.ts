import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.ts";
import { log } from "./bus.ts";
import { API_PORT, UI_PORT } from "./paths.ts";

export interface StartOptions {
  serveStatic?: boolean;
  staticDir?: string;
  port?: number;
}

export function startServer(options: StartOptions = {}): Promise<{ server: Server; url: string; port: number }> {
  const port = options.port ?? API_PORT;
  const serveStatic =
    options.serveStatic ?? (process.argv.includes("--serve") || process.env.ONBOARD_SERVE === "1");
  const app = createApp({
    serveStatic,
    staticDir: options.staticDir,
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const bound = address?.port || port;
      const url = `http://127.0.0.1:${bound}`;
      log("info", `装机服务已启动 ${url} ，开发界面 http://127.0.0.1:${UI_PORT}`);
      console.log(`API ${url}`);
      resolve({ server, url, port: bound });
    });
    server.on("error", reject);
  });
}
