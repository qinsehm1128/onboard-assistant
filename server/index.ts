import { createApp } from "./app.ts";
import { log } from "./bus.ts";
import { API_PORT, UI_PORT } from "./paths.ts";

const app = createApp({ serveStatic: process.argv.includes("--serve") });

app.listen(API_PORT, "127.0.0.1", () => {
  log("info", `装机服务已启动 http://127.0.0.1:${API_PORT} ，界面 http://127.0.0.1:${UI_PORT}`);
  console.log(`API http://127.0.0.1:${API_PORT}`);
});
