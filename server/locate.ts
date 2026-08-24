import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const NOISY_DIR_NAMES = new Set([
  "$recycle.bin",
  "$winreagent",
  "appdata",
  "msocache",
  "node_modules",
  "perflogs",
  "programdata",
  "recovery",
  "system volume information",
  "windows",
  "windows.old",
  "windowsapps",
  "winsxs",
]);

export function dirnameAny(filePath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.includes("\\")) {
    return path.win32.dirname(filePath);
  }
  return path.dirname(filePath);
}

export function uniquePaths(entries: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    const normalized = path.normalize(entry);
    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function windowsDriveRoots(exists: (candidate: string) => boolean = pathExists): string[] {
  const roots: string[] = [];
  for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
    const root = `${letter}:\\`;
    if (exists(root)) roots.push(root);
  }
  return roots;
}

export function isWindowsSystemDrive(root: string): boolean {
  return /^[cC]:\\?$/.test(root.replace(/[/\\]+$/, "\\"));
}

export function obsidianWalkRoots(input: {
  drives: string[];
  localAppData?: string;
}): string[] {
  const roots: string[] = [];
  for (const drive of input.drives) {
    if (isWindowsSystemDrive(drive)) {
      roots.push(path.win32.join(drive, "Program Files"), path.win32.join(drive, "Program Files (x86)"));
      continue;
    }
    roots.push(drive);
  }
  if (input.localAppData) roots.push(input.localAppData);
  return uniquePaths(roots);
}

export function isNoisyDirectory(name: string): boolean {
  const lower = name.toLowerCase();
  return NOISY_DIR_NAMES.has(lower) || lower.startsWith("$");
}

export function nodeInstallDirCandidates(input: {
  home: string;
  env: NodeJS.ProcessEnv;
  drives: string[];
}): string[] {
  const local = input.env.LOCALAPPDATA || path.join(input.home, "AppData", "Local");
  const roaming = input.env.APPDATA || path.join(input.home, "AppData", "Roaming");
  const pf = input.env.ProgramFiles || "C:\\Program Files";
  const pf86 = input.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const fromDrives = input.drives.flatMap((root) => [
    path.join(root, "Program Files", "nodejs"),
    path.join(root, "Program Files (x86)", "nodejs"),
    path.join(root, "nodejs"),
  ]);
  return uniquePaths([
    path.join(pf, "nodejs"),
    path.join(pf86, "nodejs"),
    path.join(local, "Programs", "nodejs"),
    path.join(local, "nvs"),
    path.join(roaming, "nvm"),
    path.join(roaming, "fnm"),
    path.join(input.home, "AppData", "Roaming", "npm"),
    ...fromDrives,
  ]);
}

export function obsidianExeCandidates(input: {
  home: string;
  env: NodeJS.ProcessEnv;
  drives: string[];
}): string[] {
  const local = input.env.LOCALAPPDATA || path.join(input.home, "AppData", "Local");
  const pf = input.env.ProgramFiles || "C:\\Program Files";
  const pf86 = input.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const fromDrives = input.drives.flatMap((root) => [
    path.join(root, "Program Files", "Obsidian", "Obsidian.exe"),
    path.join(root, "Program Files (x86)", "Obsidian", "Obsidian.exe"),
    path.join(root, "Obsidian", "Obsidian.exe"),
    path.join(root, "Apps", "Obsidian", "Obsidian.exe"),
    path.join(root, "Software", "Obsidian", "Obsidian.exe"),
    path.join(root, "Tools", "Obsidian", "Obsidian.exe"),
  ]);
  return uniquePaths([
    path.join(local, "Obsidian", "Obsidian.exe"),
    path.join(local, "Programs", "Obsidian", "Obsidian.exe"),
    path.join(pf, "Obsidian", "Obsidian.exe"),
    path.join(pf86, "Obsidian", "Obsidian.exe"),
    ...fromDrives,
  ]);
}

export function obsidianConfigCandidates(input: {
  home: string;
  env: NodeJS.ProcessEnv;
  exePath?: string;
}): string[] {
  const roaming = input.env.APPDATA || path.join(input.home, "AppData", "Roaming");
  const local = input.env.LOCALAPPDATA || path.join(input.home, "AppData", "Local");
  const nextToExe = input.exePath
    ? [
        path.win32.join(dirnameAny(input.exePath), "obsidian.json"),
        path.win32.join(dirnameAny(input.exePath), "obsidian", "obsidian.json"),
      ]
    : [];
  return uniquePaths([
    path.join(roaming, "obsidian", "obsidian.json"),
    path.join(local, "obsidian", "obsidian.json"),
    path.join(input.home, "Library", "Application Support", "obsidian", "obsidian.json"),
    path.join(input.home, ".config", "obsidian", "obsidian.json"),
    ...nextToExe,
  ]);
}

export function parseObsidianVaultPaths(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { vaults?: Record<string, { path?: string }> };
    return uniquePaths(
      Object.values(parsed.vaults || {})
        .map((vault) => vault.path?.trim())
        .filter((entry): entry is string => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

export function claudianManifestPath(vault: string): string {
  return path.join(vault, ".obsidian", "plugins", "claudian", "manifest.json");
}

function joinFor(platform: NodeJS.Platform): (...parts: string[]) => string {
  return platform === "win32" ? path.win32.join : path.posix.join;
}

export function npmViaNodeInvocation(
  bin: "npm" | "npx",
  nodeHome: string,
  platform: NodeJS.Platform,
): { command: string; prefix: string[] } {
  const join = joinFor(platform);
  const node = join(nodeHome, platform === "win32" ? "node.exe" : "node");
  const cli = join(nodeHome, "node_modules", "npm", "bin", bin === "npm" ? "npm-cli.js" : "npx-cli.js");
  return { command: node, prefix: [cli] };
}

export function windowsShimPath(bin: string, nodeHome: string): string {
  return path.win32.join(nodeHome, `${bin}.cmd`);
}

export function walkFind(
  roots: string[],
  matchName: string | RegExp,
  options: {
    maxDepth?: number;
    maxVisits?: number;
    stopAfter?: number;
    skipDir?: (name: string) => boolean;
    readdir?: (dir: string) => fs.Dirent[];
  } = {},
): string[] {
  const maxDepth = options.maxDepth ?? 4;
  const maxVisits = options.maxVisits ?? 8000;
  const stopAfter = options.stopAfter ?? 24;
  const skipDir = options.skipDir ?? isNoisyDirectory;
  const readdir =
    options.readdir ??
    ((dir: string) => {
      try {
        return fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return [];
      }
    });
  const found: string[] = [];
  let visits = 0;
  const stack: Array<{ dir: string; depth: number }> = roots
    .filter((root) => pathExists(root))
    .map((dir) => ({ dir, depth: 0 }));

  while (stack.length && visits < maxVisits && found.length < stopAfter) {
    const current = stack.pop();
    if (!current) break;
    visits += 1;
    const entries = readdir(current.dir);
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      const matched = typeof matchName === "string" ? entry.name === matchName : matchName.test(entry.name);
      if (matched) {
        found.push(full);
        if (found.length >= stopAfter) return uniquePaths(found);
      }
      if (entry.isDirectory() && current.depth < maxDepth && !skipDir(entry.name)) {
        stack.push({ dir: full, depth: current.depth + 1 });
      }
    }
  }
  return uniquePaths(found);
}

export function findNodeHome(
  exists: (candidate: string) => boolean = pathExists,
  pathValue = process.env.PATH || "",
): string | undefined {
  const exe = process.platform === "win32" ? "node.exe" : "node";
  const pathDirs = pathValue.split(path.delimiter);
  const known = nodeInstallDirCandidates({
    home: os.homedir(),
    env: process.env,
    drives: process.platform === "win32" ? windowsDriveRoots(exists) : [],
  });
  for (const dir of uniquePaths([...pathDirs, ...known])) {
    if (exists(path.join(dir, exe))) return dir;
  }
  return undefined;
}

export function resolveNpmInvocationForHome(
  bin: "npm" | "npx",
  nodeHome: string,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean = pathExists,
): { command: string; prefix: string[]; shell: boolean } | undefined {
  const viaNode = npmViaNodeInvocation(bin, nodeHome, platform);
  if (exists(viaNode.command) && exists(viaNode.prefix[0] ?? "")) {
    return { ...viaNode, shell: false };
  }
  if (platform === "win32") {
    const shim = windowsShimPath(bin, nodeHome);
    if (exists(shim)) return { command: shim, prefix: [], shell: true };
  }
  const native = joinFor(platform)(nodeHome, bin);
  if (exists(native)) return { command: native, prefix: [], shell: false };
  return undefined;
}

export function findNpmInvocation(
  bin: "npm" | "npx",
  exists: (candidate: string) => boolean = pathExists,
): { command: string; prefix: string[]; shell: boolean } | undefined {
  const home = findNodeHome(exists);
  if (!home) return undefined;
  return resolveNpmInvocationForHome(bin, home, process.platform, exists);
}

function pathExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}
