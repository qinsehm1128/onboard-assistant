import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { extraPathEntries, enrichedEnv } from "./paths.ts";
import { findLarkCli, findNodeHome, findNpmInvocation, windowsNeedsShell } from "./locate.ts";
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
    const rewritten = rewriteCommand(command, args, options.shell ?? false);
    const child = spawn(rewritten.command, rewritten.args, {
      cwd: options.cwd,
      env: enrichedEnv(),
      shell: rewritten.shell,
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
      const detail = error instanceof Error ? error.message : String(error);
      reject(new Error(`无法启动 ${rewritten.command}：${detail}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function resolveBareCommand(command: string): string | undefined {
  if (command === "lark-cli" || command === "lark") {
    const found = findLarkCli();
    if (found) return found;
  }
  const names =
    process.platform === "win32" ? [`${command}.exe`, `${command}.cmd`, command] : [command];
  for (const dir of extraPathEntries()) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.existsSync(full)) return full;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

function rewriteCommand(
  command: string,
  args: string[],
  shell: boolean,
): { command: string; args: string[]; shell: boolean } {
  if (command === "npm" || command === "npx") {
    const invocation = findNpmInvocation(command);
    if (invocation) {
      return {
        command: invocation.command,
        args: [...invocation.prefix, ...args],
        shell: invocation.shell,
      };
    }
    if (process.platform === "win32") {
      return { command, args, shell: true };
    }
  }
  if (!command.includes(path.sep) && !command.includes("/") && !path.win32.isAbsolute(command)) {
    const resolved = resolveBareCommand(command);
    if (resolved) {
      return { command: resolved, args, shell: shell || windowsNeedsShell(resolved) };
    }
  }
  if (windowsNeedsShell(command)) {
    return { command, args, shell: true };
  }
  return { command, args, shell };
}

export async function commandExists(bin: string): Promise<boolean> {
  if ((bin === "npm" || bin === "npx") && findNpmInvocation(bin)) return true;
  if ((bin === "lark-cli" || bin === "lark") && findLarkCli()) return true;
  const probe = process.platform === "win32" ? ["where", [bin]] : ["which", [bin]];
  try {
    const result = await runCommand(probe[0] as string, probe[1] as string[], { timeoutMs: 8000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function tryVersion(bin: string, args?: string[]): Promise<string | undefined> {
  const resolved =
    bin === "node"
      ? (() => {
          const home = findNodeHome();
          return home ? path.join(home, process.platform === "win32" ? "node.exe" : "node") : bin;
        })()
      : bin;
  const attempts = args ? [args] : [["--version"], ["version"], ["-v"]];
  for (const flag of attempts) {
    try {
      const result = await runCommand(resolved, flag, { timeoutMs: 8000 });
      if (result.code !== 0) continue;
      const text = `${result.stdout}\n${result.stderr}`.trim();
      const match = text.match(/v?\d+\.\d+(\.\d+)?/);
      if (match?.[0]) return match[0];
      const line = text.split(/\r?\n/)[0]?.trim();
      if (line) return line;
    } catch {
      // try the next flag
    }
  }
  return undefined;
}
