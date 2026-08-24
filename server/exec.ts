import { spawn } from "node:child_process";
import { enrichedEnv } from "./paths.ts";
import { log } from "./bus.ts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    shell?: boolean;
    itemId?: string;
    onLine?: (line: string) => void;
  } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: enrichedEnv(),
      shell: options.shell ?? false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      reject(new Error(`命令超时：${command} ${args.join(" ")}`));
    }, options.timeoutMs ?? 15 * 60 * 1000);

    const handle = (chunk: Buffer, stream: "stdout" | "stderr") => {
      const text = chunk.toString();
      if (stream === "stdout") stdout += text;
      else stderr += text;
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        options.onLine?.(line);
        if (options.itemId) log("info", line, options.itemId);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => handle(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => handle(chunk, "stderr"));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function commandExists(bin: string): Promise<boolean> {
  const probe = process.platform === "win32" ? ["where", [bin]] : ["which", [bin]];
  try {
    const result = await runCommand(probe[0] as string, probe[1] as string[], { timeoutMs: 8000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function tryVersion(bin: string, args = ["--version"]): Promise<string | undefined> {
  try {
    const result = await runCommand(bin, args, { timeoutMs: 8000 });
    if (result.code !== 0) return undefined;
    const text = `${result.stdout}\n${result.stderr}`.trim();
    const match = text.match(/v?\d+\.\d+(\.\d+)?/);
    return match?.[0] ?? text.split(/\r?\n/)[0]?.trim();
  } catch {
    return undefined;
  }
}
