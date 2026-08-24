import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UpdateInfo } from "../shared/types.ts";
import { UA } from "./paths.ts";

export const APP_REPO = {
  owner: "qinsehm1128",
  name: "onboard-assistant",
};

export const REPO_URL = `https://github.com/${APP_REPO.owner}/${APP_REPO.name}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

export function currentVersion(): string {
  try {
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function compareVersions(a: string, b: string): number {
  const left = a.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const d = (left[i] ?? 0) - (right[i] ?? 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = currentVersion();
  try {
    const response = await fetch(
      `https://api.github.com/repos/${APP_REPO.owner}/${APP_REPO.name}/releases/latest`,
      { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } },
    );
    if (response.status === 404) {
      return {
        status: "none",
        currentVersion: current,
        releaseUrl: RELEASES_URL,
        message: `当前版本 ${current}。公开仓库还没有正式 Release，发布后即可检测更新。`,
      };
    }
    if (!response.ok) {
      throw new Error(`GitHub ${response.status}`);
    }
    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
      body?: string;
    };
    const latest = (release.tag_name || "").replace(/^v/i, "");
    if (!latest) {
      return {
        status: "none",
        currentVersion: current,
        releaseUrl: RELEASES_URL,
        message: "公开仓库里还没有可用的版本号。",
      };
    }
    const newer = compareVersions(latest, current) > 0;
    return {
      status: newer ? "available" : "current",
      currentVersion: current,
      latestVersion: latest,
      releaseUrl: release.html_url || `${RELEASES_URL}/tag/v${latest}`,
      releaseName: release.name,
      publishedAt: release.published_at,
      notes: release.body?.slice(0, 800),
      message: newer
        ? `发现新版本 ${latest}，当前是 ${current}。`
        : `已是最新版本 ${current}。`,
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion: current,
      releaseUrl: RELEASES_URL,
      message: error instanceof Error ? `检查更新失败：${error.message}` : "检查更新失败",
    };
  }
}
