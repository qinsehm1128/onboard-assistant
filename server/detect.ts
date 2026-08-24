import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ItemState, TargetOs } from "../shared/types.ts";
import { runCommand, tryVersion } from "./exec.ts";
import {
  claudianManifestPath,
  isNoisyDirectory,
  obsidianConfigCandidates,
  obsidianExeCandidates,
  obsidianWalkRoots,
  parseObsidianVaultPaths,
  uniquePaths,
  walkFind,
  windowsDriveRoots,
} from "./locate.ts";
import { firstExisting, hostPlatform } from "./paths.ts";

interface DiscoverSnapshot {
  at: number;
  exe?: string;
  vaults: string[];
  claudian?: string;
}

let discoverCache: DiscoverSnapshot | null = null;
const DISCOVER_TTL_MS = 20_000;

export function invalidateDiscoverCache(): void {
  discoverCache = null;
}

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

function pathExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function findObsidianExecutableSync(): string | undefined {
  if (process.platform === "darwin") {
    return firstExisting([
      "/Applications/Obsidian.app",
      path.join(os.homedir(), "Applications", "Obsidian.app"),
    ]);
  }
  if (process.platform !== "win32") {
    return firstExisting(["/usr/bin/obsidian", "/opt/Obsidian/obsidian"]);
  }
  const known = firstExisting(
    obsidianExeCandidates({
      home: os.homedir(),
      env: process.env,
      drives: windowsDriveRoots(),
    }),
  );
  if (known) return known;
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return walkFind(
    obsidianWalkRoots({
      drives: windowsDriveRoots(),
      localAppData: local,
    }),
    "Obsidian.exe",
    {
      maxDepth: 3,
      maxVisits: 2000,
      stopAfter: 2,
    },
  )[0];
}

function vaultScanRoots(): string[] {
  const home = os.homedir();
  const roots = [
    path.join(home, "Documents"),
    path.join(home, "Desktop"),
    path.join(home, "Downloads"),
    path.join(home, "OneDrive"),
    path.join(home, "Notes"),
    path.join(home, "Obsidian"),
    path.join(home, "vaults"),
    path.join(home, "文档"),
    path.join(home, "笔记"),
  ];
  if (process.platform === "win32") {
    for (const drive of windowsDriveRoots()) {
      if (/^c:\\$/i.test(drive)) continue;
      roots.push(
        drive,
        path.join(drive, "Notes"),
        path.join(drive, "Obsidian"),
        path.join(drive, "vaults"),
        path.join(drive, "文档"),
        path.join(drive, "笔记"),
      );
    }
  }
  return roots.filter(pathExists);
}

function collectVaults(exe?: string): string[] {
  const configs = obsidianConfigCandidates({
    home: os.homedir(),
    env: process.env,
    exePath: exe,
  });
  const fromConfig: string[] = [];
  for (const config of configs) {
    try {
      fromConfig.push(...parseObsidianVaultPaths(fs.readFileSync(config, "utf8")));
    } catch {
      // ignore missing or invalid config
    }
  }
  const fromWalk = walkFind(vaultScanRoots(), ".obsidian", {
    maxDepth: 4,
    maxVisits: 2000,
    stopAfter: 20,
    skipDir: (name) => isNoisyDirectory(name) || name.toLowerCase() === "library",
  }).map((dir) => path.dirname(dir));
  return uniquePaths([...fromConfig, ...fromWalk]).filter(pathExists);
}

function scanObsidianNow(): DiscoverSnapshot {
  const exe = findObsidianExecutableSync();
  const vaults = collectVaults(exe);
  const claudian = vaults.map(claudianManifestPath).find(pathExists);
  return { at: Date.now(), exe, vaults, claudian };
}

function cachedDiscover(): DiscoverSnapshot {
  if (discoverCache && Date.now() - discoverCache.at < DISCOVER_TTL_MS) return discoverCache;
  discoverCache = scanObsidianNow();
  return discoverCache;
}

function parseRegSz(stdout: string): string | undefined {
  const match = stdout.match(/REG_SZ\s+(.+)/i);
  const value = match?.[1]?.trim().replace(/^"|"$/g, "");
  return value || undefined;
}

async function windowsLocateObsidian(): Promise<string | undefined> {
  const keys = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Obsidian.exe",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Obsidian.exe",
  ];
  for (const key of keys) {
    try {
      const result = await runCommand("reg", ["query", key, "/ve"], { timeoutMs: 5000 });
      const value = parseRegSz(result.stdout);
      if (value && pathExists(value)) return value;
    } catch {
      // registry key may not exist
    }
  }
  return undefined;
}

async function resolveObsidian(): Promise<DiscoverSnapshot> {
  const snap = cachedDiscover();
  if (snap.exe || process.platform !== "win32") return snap;
  const fromReg = await windowsLocateObsidian();
  if (!fromReg) return snap;
  invalidateDiscoverCache();
  const next = scanObsidianNow();
  next.exe = next.exe || fromReg;
  next.vaults = uniquePaths([...next.vaults, ...collectVaults(fromReg)]);
  next.claudian = next.vaults.map(claudianManifestPath).find(pathExists);
  discoverCache = next;
  return next;
}

export function obsidianAppPath(): string | undefined {
  return cachedDiscover().exe;
}

export function listObsidianVaults(): string[] {
  return cachedDiscover().vaults;
}

function ccSwitchPath(): string | undefined {
  if (process.platform === "darwin") {
    return firstExisting(["/Applications/CC Switch.app", "/Applications/CC-Switch.app"]);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const drives = windowsDriveRoots();
    const candidates = [
      path.join(pf, "CC Switch", "CC Switch.exe"),
      path.join(pf, "cc-switch", "cc-switch.exe"),
      path.join(local, "Programs", "CC Switch", "CC Switch.exe"),
      ...drives.flatMap((root) => [
        path.join(root, "Program Files", "CC Switch", "CC Switch.exe"),
        path.join(root, "CC Switch", "CC Switch.exe"),
      ]),
    ];
    return firstExisting(candidates);
  }
  return undefined;
}

function clashPath(): string | undefined {
  if (process.platform === "darwin") {
    return firstExisting(["/Applications/Clash Verge.app", "/Applications/Clash Verge Rev.app"]);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const drives = windowsDriveRoots();
    const candidates = [
      path.join(pf, "Clash Verge", "clash-verge.exe"),
      path.join(local, "Programs", "Clash Verge", "clash-verge.exe"),
      path.join(local, "clash-verge", "clash-verge.exe"),
      ...drives.flatMap((root) => [
        path.join(root, "Program Files", "Clash Verge", "clash-verge.exe"),
        path.join(root, "Clash Verge", "clash-verge.exe"),
      ]),
    ];
    return firstExisting(candidates);
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
    case "obsidian": {
      const found = await resolveObsidian();
      if (found.exe) return appState(id, found.exe);
      if (found.vaults.length) {
        return {
          id,
          status: "installed",
          filePath: found.vaults[0],
          folderPath: found.vaults[0],
          message: `未在默认目录找到程序，但已扫描到 ${found.vaults.length} 个库`,
        };
      }
      return appState(id, undefined);
    }
    case "claudian": {
      const found = await resolveObsidian();
      return found.claudian
        ? { id, status: "installed", filePath: found.claudian, message: "已在扫描到的 Obsidian 库中发现插件" }
        : { id, status: "missing", message: "未在已扫描的磁盘 / 库中发现 Claudian" };
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
  invalidateDiscoverCache();
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
