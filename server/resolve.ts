import type { Arch, TargetOs } from "../shared/types.ts";
import { UA } from "./paths.ts";
import { voiceTypingDocs } from "./catalog.ts";

export interface DownloadSpec {
  url: string;
  filename: string;
  version?: string;
  pageOnly?: boolean;
  pageUrl?: string;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  assets?: GithubAsset[];
}

export function pickAsset(assets: GithubAsset[], patterns: RegExp[]): GithubAsset | undefined {
  for (const pattern of patterns) {
    const hit = assets.find((asset) => pattern.test(asset.name));
    if (hit) return hit;
  }
  return undefined;
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return (await response.json()) as T;
}

function isArm(arch: Arch): boolean {
  return arch === "arm64";
}

export async function resolveDownload(id: string, os: TargetOs, arch: Arch): Promise<DownloadSpec> {
  switch (id) {
    case "git":
      return resolveGit(os, arch);
    case "python":
      return resolvePython(os, arch);
    case "node":
      return resolveNode(os, arch);
    case "obsidian":
      return resolveObsidian(os);
    case "claudian":
      return {
        url: "https://github.com/YishenTu/claudian/releases/download/2.0.15/manifest.json",
        filename: "manifest.json",
        version: "2.0.15",
      };
    case "claude-cli":
      return {
        url: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
        filename: "",
        version: "npm",
      };
    case "cc-switch":
      return os === "win32"
        ? {
            url: "https://github.com/farion1231/cc-switch/releases/download/v3.15.0/CC-Switch-v3.15.0-Windows.msi",
            filename: "CC-Switch-v3.15.0-Windows.msi",
            version: "v3.15.0",
          }
        : {
            url: "https://github.com/farion1231/cc-switch/releases/download/v3.15.0/CC-Switch-v3.15.0-macOS.dmg",
            filename: "CC-Switch-v3.15.0-macOS.dmg",
            version: "v3.15.0",
          };
    case "clash-verge":
      return resolveClash(os, arch);
    case "voice-typing":
      return {
        url: voiceTypingDocs(os),
        filename: "",
        pageOnly: true,
        pageUrl: voiceTypingDocs(os),
      };
    case "lark-cli":
      return resolveLark(os, arch);
    default:
      throw new Error(`没有为 ${id} 配置下载地址`);
  }
}

async function resolveGit(os: TargetOs, arch: Arch): Promise<DownloadSpec> {
  if (os === "darwin") {
    return {
      url: "https://git-scm.com/download/mac",
      filename: "",
      pageOnly: false,
      pageUrl: "https://git-scm.com/download/mac",
      version: "latest",
    };
  }
  try {
    const release = await githubJson<GithubRelease>("https://api.github.com/repos/git-for-windows/git/releases/latest");
    const asset = pickAsset(release.assets || [], [
      isArm(arch) ? /Git-.*-arm64\.exe$/i : /Git-.*-64-bit\.exe$/i,
      /Git-.*-64-bit\.exe$/i,
    ]);
    if (asset) {
      return { url: asset.browser_download_url, filename: asset.name, version: release.tag_name };
    }
  } catch {
    // fall through
  }
  return {
    url: "https://github.com/git-for-windows/git/releases/download/v2.51.0.windows.1/Git-2.51.0-64-bit.exe",
    filename: "Git-2.51.0-64-bit.exe",
    version: "2.51.0",
  };
}

async function resolvePython(os: TargetOs, arch: Arch): Promise<DownloadSpec> {
  const version = "3.12.14";
  if (os === "darwin") {
    return {
      url: `https://www.python.org/ftp/python/${version}/python-${version}-macos11.pkg`,
      filename: `python-${version}-macos11.pkg`,
      version,
    };
  }
  const file = isArm(arch) ? `python-${version}-arm64.exe` : `python-${version}-amd64.exe`;
  return {
    url: `https://www.python.org/ftp/python/${version}/${file}`,
    filename: file,
    version,
  };
}

async function resolveNode(os: TargetOs, arch: Arch): Promise<DownloadSpec> {
  let version = "v24.19.0";
  try {
    const index = (await (await fetch("https://nodejs.org/dist/index.json", { headers: { "User-Agent": UA } })).json()) as {
      version: string;
      lts: string | false;
    }[];
    const latestLts = index.find((entry) => Boolean(entry.lts));
    if (latestLts?.version) version = latestLts.version;
  } catch {
    // keep fallback
  }
  if (os === "darwin") {
    return {
      url: `https://nodejs.org/dist/${version}/node-${version}.pkg`,
      filename: `node-${version}.pkg`,
      version,
    };
  }
  const suffix = isArm(arch) ? "arm64" : "x64";
  return {
    url: `https://nodejs.org/dist/${version}/node-${version}-${suffix}.msi`,
    filename: `node-${version}-${suffix}.msi`,
    version,
  };
}

async function resolveObsidian(os: TargetOs): Promise<DownloadSpec> {
  try {
    const releases = await githubJson<GithubRelease[]>(
      "https://api.github.com/repos/obsidianmd/obsidian-releases/releases?per_page=10",
    );
    const ext = os === "win32" ? /\.exe$/ : /\.dmg$/;
    for (const release of releases) {
      const asset = (release.assets || []).find((item) => ext.test(item.name) && /Obsidian-/i.test(item.name));
      if (asset) {
        return { url: asset.browser_download_url, filename: asset.name, version: release.tag_name };
      }
    }
  } catch {
    // fall through
  }
  return os === "win32"
    ? {
        url: "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.13.7/Obsidian-1.13.7.exe",
        filename: "Obsidian-1.13.7.exe",
        version: "1.13.7",
      }
    : {
        url: "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.13.7/Obsidian-1.13.7.dmg",
        filename: "Obsidian-1.13.7.dmg",
        version: "1.13.7",
      };
}

function resolveClash(os: TargetOs, arch: Arch): DownloadSpec {
  const version = "2.4.7";
  if (os === "darwin") {
    const file = isArm(arch) ? `Clash.Verge_${version}_aarch64.dmg` : `Clash.Verge_${version}_x64.dmg`;
    return {
      url: `https://github.com/clash-verge-rev/clash-verge-rev/releases/download/v${version}/${file}`,
      filename: file,
      version: `v${version}`,
    };
  }
  const file = isArm(arch) ? `Clash.Verge_${version}_arm64-setup.exe` : `Clash.Verge_${version}_x64-setup.exe`;
  return {
    url: `https://github.com/clash-verge-rev/clash-verge-rev/releases/download/v${version}/${file}`,
    filename: file,
    version: `v${version}`,
  };
}

function resolveLark(os: TargetOs, arch: Arch): DownloadSpec {
  const version = "1.0.89";
  if (os === "darwin") {
    const file = `lark-cli-${version}-darwin-${isArm(arch) ? "arm64" : "amd64"}.tar.gz`;
    return {
      url: `https://github.com/larksuite/cli/releases/download/v${version}/${file}`,
      filename: file,
      version,
    };
  }
  const file = `lark-cli-${version}-windows-${isArm(arch) ? "arm64" : "amd64"}.zip`;
  return {
    url: `https://github.com/larksuite/cli/releases/download/v${version}/${file}`,
    filename: file,
    version,
  };
}
