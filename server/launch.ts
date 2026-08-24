import { spawn } from "node:child_process";
import fs from "node:fs";
import { runCommand } from "./exec.ts";

export async function openPath(target: string): Promise<void> {
  if (!target) throw new Error("没有可打开的路径");
  if (process.platform === "darwin") {
    await runCommand("open", [target], { timeoutMs: 15000 });
    return;
  }
  if (process.platform === "win32") {
    await runCommand("explorer", [target], { timeoutMs: 15000 });
    return;
  }
  await runCommand("xdg-open", [target], { timeoutMs: 15000 });
}

export async function openUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await runCommand("open", [url], { timeoutMs: 15000 });
    return;
  }
  if (process.platform === "win32") {
    await runCommand("cmd", ["/c", "start", "", url], { timeoutMs: 15000, shell: true });
    return;
  }
  await runCommand("xdg-open", [url], { timeoutMs: 15000 });
}

export function launchDetached(filePath: string, args: string[] = []): void {
  if (!fs.existsSync(filePath)) throw new Error(`文件不存在：${filePath}`);
  const child = spawn(filePath, args, { detached: true, stdio: "ignore", shell: process.platform === "win32" });
  child.unref();
}
