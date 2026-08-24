import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Arch, HostPlatform } from "../shared/types.ts";
import { findNodeHome, nodeInstallDirCandidates, uniquePaths, windowsDriveRoots } from "./locate.ts";

export const API_PORT = 43174;
export const UI_PORT = 43173;
export const UA = "OnboardAssistant/1.0 (company setup helper)";

export function hostPlatform(): HostPlatform {
  if (process.platform === "win32" || process.platform === "darwin") return process.platform;
  return "linux";
}

export function hostArch(): Arch {
  return process.arch === "arm64" ? "arm64" : "x64";
}

export function downloadDir(): string {
  const dir = path.join(os.homedir(), "Downloads", "onboard-assistant");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function itemDir(id: string): string {
  const dir = path.join(downloadDir(), id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const runtimePathPrefixes: string[] = [];

export function rememberPathEntry(dir: string): void {
  if (!dir) return;
  try {
    if (!fs.existsSync(dir)) return;
  } catch {
    return;
  }
  if (!runtimePathPrefixes.some((entry) => entry.toLowerCase() === dir.toLowerCase())) {
    runtimePathPrefixes.push(dir);
  }
}

export function refreshProcessPath(): void {
  const nodeHome = findNodeHome();
  if (nodeHome) rememberPathEntry(nodeHome);
  process.env.PATH = enrichedEnv().PATH;
}

export function extraPathEntries(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const nodeHomes = nodeInstallDirCandidates({
      home,
      env: process.env,
      drives: windowsDriveRoots(),
    });
    return uniquePaths([
      ...runtimePathPrefixes,
      ...nodeHomes,
      path.join(roaming, "npm"),
      path.join(pf, "Git", "cmd"),
      path.join(pf, "Git", "bin"),
      path.join(pf86, "Git", "cmd"),
      path.join(local, "Programs", "Python", "Python312"),
      path.join(local, "Programs", "Python", "Python312", "Scripts"),
      path.join(local, "Programs", "Python", "Python313"),
      path.join(local, "Programs", "Python", "Python313", "Scripts"),
      path.join(local, "Programs", "Obsidian"),
      path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links"),
      path.join(home, ".local", "bin"),
    ]);
  }
  return uniquePaths([
    ...runtimePathPrefixes,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/local/git/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".nvm", "current", "bin"),
    "/Library/Frameworks/Python.framework/Versions/3.12/bin",
    "/Library/Frameworks/Python.framework/Versions/3.13/bin",
    "/Applications/Obsidian.app/Contents/MacOS",
    path.join(home, "Applications", "Obsidian.app", "Contents", "MacOS"),
  ]);
}

export function enrichedEnv(): NodeJS.ProcessEnv {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const current = (process.env.PATH || "").split(delimiter);
  const extra = extraPathEntries().filter((entry) => {
    try {
      return fs.existsSync(entry);
    } catch {
      return false;
    }
  });
  return {
    ...process.env,
    PATH: uniquePaths([...extra, ...current]).join(delimiter),
  };
}

export function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}
