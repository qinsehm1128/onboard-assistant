import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ItemState, TargetOs } from "../shared/types.ts";
import { firstExisting, hostPlatform } from "./paths.ts";
import { tryVersion } from "./exec.ts";

function appState(id: string, found: string | undefined, version?: string): ItemState {
  if (!found) return { id, status: "missing", message: "未检测到本机安装" };
  return {
    id,
    status: "installed",
    version,
    filePath: found,
    message: version ? `已安装 ${version}` : "已检测到本机安装",
  };
}

export function obsidianAppPath(): string | undefined {
  if (process.platform === "darwin") return firstExisting(["/Applications/Obsidian.app"]);
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    return firstExisting([
      path.join(local, "Obsidian", "Obsidian.exe"),
      path.join(local, "Programs", "Obsidian", "Obsidian.exe"),
      path.join(pf, "Obsidian", "Obsidian.exe"),
    ]);
  }
  return firstExisting(["/usr/bin/obsidian", "/opt/Obsidian/obsidian"]);
}

export function listObsidianVaults(): string[] {
  const configPath =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "obsidian", "obsidian.json")
      : path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      vaults?: Record<string, { path?: string }>;
    };
    return Object.values(raw.vaults || {})
      .map((vault) => vault.path)
      .filter((entry): entry is string => Boolean(entry && fs.existsSync(entry)));
  } catch {
    return [];
  }
}

function claudianInstalled(): string | undefined {
  for (const vault of listObsidianVaults()) {
    const manifest = path.join(vault, ".obsidian", "plugins", "claudian", "manifest.json");
    if (fs.existsSync(manifest)) return manifest;
  }
  return undefined;
}

function ccSwitchPath(): string | undefined {
  if (process.platform === "darwin") {
    return firstExisting(["/Applications/CC Switch.app", "/Applications/CC-Switch.app"]);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    return firstExisting([
      path.join(pf, "CC Switch", "CC Switch.exe"),
      path.join(pf, "cc-switch", "cc-switch.exe"),
      path.join(local, "Programs", "CC Switch", "CC Switch.exe"),
    ]);
  }
  return undefined;
}

function clashPath(): string | undefined {
  if (process.platform === "darwin") {
    return firstExisting(["/Applications/Clash Verge.app", "/Applications/Clash Verge Rev.app"]);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    return firstExisting([
      path.join(pf, "Clash Verge", "clash-verge.exe"),
      path.join(local, "Programs", "Clash Verge", "clash-verge.exe"),
      path.join(local, "clash-verge", "clash-verge.exe"),
    ]);
  }
  return undefined;
}

export async function detectItem(id: string): Promise<ItemState> {
  switch (id) {
    case "git":
      return appState(id, (await tryVersion("git")) ? "git" : undefined, await tryVersion("git"));
    case "python": {
      const version = (await tryVersion("python3")) || (await tryVersion("python"));
      return appState(id, version ? "python" : undefined, version);
    }
    case "node":
      return appState(id, (await tryVersion("node")) ? "node" : undefined, await tryVersion("node"));
    case "obsidian":
      return appState(id, obsidianAppPath());
    case "claudian": {
      const found = claudianInstalled();
      return found
        ? { id, status: "installed", filePath: found, message: "已写入 Obsidian 插件目录" }
        : { id, status: "missing", message: "未在已有 Obsidian 库中发现插件" };
    }
    case "claude-cli":
      return appState(id, (await tryVersion("claude")) ? "claude" : undefined, await tryVersion("claude"));
    case "cc-switch": {
      const found = ccSwitchPath();
      return found
        ? { id, status: "needs_config", filePath: found, message: "已安装，密钥需单独配置" }
        : { id, status: "missing", message: "未检测到本机安装" };
    }
    case "clash-verge":
      return appState(id, clashPath());
    case "voice-typing":
      return {
        id,
        status: "open_page",
        message: "输入法需要在官网下载，并在系统设置中启用",
      };
    case "lark-cli": {
      const version = (await tryVersion("lark-cli")) || (await tryVersion("lark"));
      return appState(id, version ? "lark-cli" : undefined, version);
    }
    default:
      return { id, status: "unknown", message: "未知软件" };
  }
}

export async function detectAll(_os: TargetOs): Promise<Record<string, ItemState>> {
  const ids = [
    "git",
    "python",
    "node",
    "obsidian",
    "claudian",
    "claude-cli",
    "cc-switch",
    "clash-verge",
    "voice-typing",
    "lark-cli",
  ];
  const entries = await Promise.all(
    ids.map(async (id) => {
      const state = await detectItem(id);
      if (hostPlatform() === "linux" && ["obsidian", "claudian", "cc-switch", "clash-verge"].includes(id)) {
        if (state.status === "missing") {
          state.message = "当前预览环境是 Linux，这项请在 Windows / macOS 员工电脑上安装";
        }
      }
      return [id, state] as const;
    }),
  );
  return Object.fromEntries(entries);
}
