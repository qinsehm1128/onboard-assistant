import type { CatalogItem, CategoryId } from "../shared/types.ts";

export const CATEGORIES: { id: CategoryId; title: string; hint: string }[] = [
  { id: "runtime", title: "开发环境", hint: "Git、Python、Node.js，后续命令行工具都依赖它们" },
  { id: "ai", title: "AI 工具", hint: "Obsidian、Claudian、Claude CLI，以及单独发放的密钥工具" },
  { id: "network", title: "网络代理", hint: "公司指定的 fq 客户端；公司内网一般不需要" },
  { id: "input", title: "语音打字", hint: "macOS 用豆包输入法，Windows 用微信输入法" },
  { id: "collab", title: "飞书协作", hint: "飞书 CLI 与 AI 技能，公司网络一般不需要代理" },
];

export const CATALOG: CatalogItem[] = [
  {
    id: "git",
    name: "Git",
    category: "runtime",
    summary: "版本控制。Windows 会优先用 winget 静默安装，失败再下载官方安装包。",
    docsUrl: "https://git-scm.com/downloads",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 1,
    kind: "auto",
  },
  {
    id: "python",
    name: "Python",
    category: "runtime",
    summary: "脚本与 AI 工具常用运行环境。安装时会写入 PATH，装完请新开终端验证。",
    docsUrl: "https://www.python.org/downloads/",
    versionHint: "3.12 LTS",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 2,
    kind: "auto",
  },
  {
    id: "node",
    name: "Node.js",
    category: "runtime",
    summary: "JavaScript 运行时。Claude CLI 和飞书 CLI 都用 npm 安装，必须先装好 Node。",
    docsUrl: "https://nodejs.org/",
    versionHint: "当前 LTS",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 3,
    kind: "auto",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    category: "ai",
    summary: "笔记与知识库。Claudian 是它的插件，需要先装好 Obsidian。",
    docsUrl: "https://obsidian.md/zh/help/install",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 4,
    kind: "app",
  },
  {
    id: "claudian",
    name: "Claudian",
    category: "ai",
    summary: "Obsidian 的 Claude 插件。按公司清单安装 2.0.15，并尝试写入已有库。",
    docsUrl: "https://github.com/YishenTu/claudian/releases/tag/2.0.15",
    versionHint: "2.0.15",
    platforms: ["win32", "darwin"],
    dependsOn: ["obsidian"],
    order: 5,
    kind: "plugin",
  },
  {
    id: "claude-cli",
    name: "Claude CLI",
    category: "ai",
    summary: "不走 PowerShell / 官方脚本。先装好 Python 和 Node，再用 npm 安装 @anthropic-ai/claude-code。",
    docsUrl: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
    notes: "公司网络一般不需要 fq。安装命令：npm install -g @anthropic-ai/claude-code",
    versionHint: "npm",
    platforms: ["win32", "darwin"],
    dependsOn: ["python", "node"],
    order: 6,
    kind: "cli",
  },
  {
    id: "cc-switch",
    name: "密钥配置（CC Switch）",
    category: "ai",
    summary: "密钥切换工具。安装包可以自动下载，密钥需单独发放、单独配置。",
    docsUrl: "https://github.com/farion1231/cc-switch/releases/tag/v3.15.0",
    versionHint: "v3.15.0",
    notes: "需要单独配置，密钥单独发放。",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 7,
    kind: "app",
  },
  {
    id: "clash-verge",
    name: "网络代理（Clash Verge Rev）",
    category: "network",
    summary: "公司清单中的 fq 客户端。非公司网络时，部分软件下载可能要先连上它。",
    docsUrl: "https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.4.7",
    versionHint: "v2.4.7",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 8,
    kind: "app",
  },
  {
    id: "voice-typing",
    name: "语音打字",
    category: "input",
    summary: "macOS 打开豆包输入法官网；Windows 打开微信输入法页面。安装包通常需要在官网手动点下载。",
    docsUrl: "https://shurufa.doubao.com/pc",
    notes: "输入法安装后还要在系统设置里启用。",
    platforms: ["win32", "darwin"],
    dependsOn: [],
    order: 9,
    kind: "page",
  },
  {
    id: "lark-cli",
    name: "飞书 CLI 技能",
    category: "collab",
    summary: "官方推荐用 npx 安装。公司网络一般不需要 fq。装完后仍需登录飞书账号。",
    docsUrl: "https://github.com/larksuite/cli",
    notes: "命令行或 AI 安装。公司网络的话不需要 fq。",
    platforms: ["win32", "darwin"],
    dependsOn: ["node"],
    order: 10,
    kind: "cli",
  },
];

export function itemById(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function itemsForOs(os: "win32" | "darwin"): CatalogItem[] {
  return CATALOG.filter((item) => item.platforms.includes(os)).sort((a, b) => a.order - b.order);
}

export function voiceTypingDocs(os: "win32" | "darwin"): string {
  return os === "darwin"
    ? "https://shurufa.doubao.com/pc"
    : "https://z.weixin.qq.com/web/change-log/windows";
}
