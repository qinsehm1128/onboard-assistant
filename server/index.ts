import { startServer } from "./start.ts";

await startServer({
  serveStatic: process.argv.includes("--serve") || process.env.ONBOARD_SERVE === "1",
});
