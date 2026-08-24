import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import extractZip from "extract-zip";
import type { Arch, ItemState, TargetOs } from "../shared/types.ts";
import { itemById, voiceTypingDocs } from "./catalog.ts";
import { log, setState } from "./bus.ts";
import { detectItem, listObsidianVaults } from "./detect.ts";
import { downloadFile } from "./download.ts";
import { commandExists, runCommand, tryVersion } from "./exec.ts";
import { launchDetached, openPath, openUrl } from "./launch.ts";
import { downloadDir, hostArch, hostPlatform, itemDir } from "./paths.ts";
import { resolveDownload } from "./resolve.ts";

const abortControllers = new Map<string, AbortController>();
const queue: { id: string; os: TargetOs }[] = [];
let pumping = false;

export function cancelInstall(id: string): void {
  abortControllers.get(id)?.abort();
  const index = queue.findIndex((job) => job.id === id);
  if (index >= 0) queue.splice(index, 1);
  setState({ id, status: "missing", message: "已取消", progress: 0 });
}

export function enqueueInstall(id: string, os: TargetOs): void {
  if (queue.some((job) => job.id === id)) return;
  const current = abortControllers.has(id);
  if (current) return;
  queue.push({ id, os });
  setState({ id, status: "queued", message: "排队等待安装" });
  void pump();
}

export async function enqueueMany(ids: string[], os: TargetOs): Promise<void> {
  for (const id of ids) enqueueInstall(id, os);
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const job = queue.shift();
    if (!job) break;
    await runInstall(job.id, job.os);
  }
  pumping = false;
}

function sameOs(os: TargetOs): boolean {
  return hostPlatform() === os;
}

export async function runInstall(id: string, os: TargetOs): Promise<ItemState> {
  const item = itemById(id);
  if (!item) throw new Error(`未知软件：${id}`);
  const controller = new AbortController();
  abortControllers.set(id, controller);

  try {
    setState({ id, status: "checking", message: "正在检测是否已安装" });
    const existing = await detectItem(id);
    if (existing.status === "installed" || existing.status === "needs_config") {
      log("info", `${item.name} 已安装，跳过`, id);
      return setState(existing);
    }

    if (id === "voice-typing") {
      const page = voiceTypingDocs(os);
      await openUrl(page).catch(() => undefined);
      return setState({
        id,
        status: "open_page",
        docsUrl: page,
        message: os === "darwin" ? "已打开豆包输入法官网，请在页面下载并安装" : "已打开微信输入法页面，请在页面下载并安装",
        manualSteps: [
          os === "darwin" ? "在打开的豆包输入法页面点击 macOS 下载" : "在打开的微信输入法页面下载 Windows 安装包",
          "双击安装包完成安装",
          "到系统设置 → 键盘 / 输入法中启用它",
        ],
      });
    }

    setState({ id, status: "resolving", message: "正在解析官方下载地址" });
    const spec = await resolveDownload(id, os, resolveArch(os));
    log("info", `${item.name} 将使用 ${spec.url}`, id);

    if (spec.pageOnly) {
      if (spec.pageUrl) await openUrl(spec.pageUrl).catch(() => undefined);
      return setState({
        id,
        status: "open_page",
        docsUrl: spec.pageUrl || spec.url,
        message: "已打开官网，请在页面完成下载安装",
      });
    }

    if (id === "claudian") {
      return await installClaudian(controller.signal);
    }

    if (id === "claude-cli") {
      return await installClaudeCli(os);
    }

    if (id === "lark-cli") {
      return await installLarkCli(os, spec, controller.signal);
    }

    if (id === "git" && os === "darwin" && sameOs(os)) {
      return await installGitMac();
    }

    if (id === "git" && os === "win32" && sameOs(os) && (await commandExists("winget"))) {
      setState({ id, status: "installing", message: "正在通过 winget 安装 Git" });
      const result = await runCommand(
        "winget",
        ["install", "--id", "Git.Git", "-e", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"],
        { itemId: id, timeoutMs: 12 * 60 * 1000 },
      );
      if (result.code === 0) return await finishDetect(id, "已通过 winget 安装");
      log("warn", "winget 安装 Git 未成功，改为下载官方安装包", id);
    }

    if (id === "python" && os === "win32" && sameOs(os) && (await commandExists("winget"))) {
      setState({ id, status: "installing", message: "正在通过 winget 安装 Python" });
      const result = await runCommand(
        "winget",
        ["install", "--id", "Python.Python.3.12", "-e", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"],
        { itemId: id, timeoutMs: 12 * 60 * 1000 },
      );
      if (result.code === 0) return await finishDetect(id, "已通过 winget 安装");
    }

    if (id === "node" && os === "win32" && sameOs(os) && (await commandExists("winget"))) {
      setState({ id, status: "installing", message: "正在通过 winget 安装 Node.js" });
      const result = await runCommand(
        "winget",
        ["install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"],
        { itemId: id, timeoutMs: 12 * 60 * 1000 },
      );
      if (result.code === 0) return await finishDetect(id, "已通过 winget 安装");
    }

    if ((id === "git" || id === "python" || id === "node") && os === "darwin" && sameOs(os) && (await commandExists("brew"))) {
      const formula = id === "node" ? "node" : id === "python" ? "python@3.12" : "git";
      setState({ id, status: "installing", message: `正在通过 Homebrew 安装 ${formula}` });
      const result = await runCommand("brew", ["install", formula], { itemId: id, timeoutMs: 15 * 60 * 1000 });
      if (result.code === 0) return await finishDetect(id, "已通过 Homebrew 安装");
    }

    if (!spec.filename) {
      if (spec.pageUrl) await openUrl(spec.pageUrl).catch(() => undefined);
      return setState({
        id,
        status: "open_page",
        docsUrl: spec.pageUrl || spec.url,
        message: "没有稳定直链，已打开官网，请按页面提示安装",
      });
    }

    const dest = path.join(itemDir(id), spec.filename);
    setState({ id, status: "downloading", progress: 0, message: `正在下载 ${spec.filename}`, folderPath: itemDir(id) });
    await downloadFile(
      spec.url,
      dest,
      (progress) => {
        setState({
          id,
          status: "downloading",
          progress: progress.percent,
          received: progress.received,
          total: progress.total,
          filePath: dest,
          folderPath: itemDir(id),
          message: progress.total
            ? `下载中 ${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
            : `已下载 ${formatBytes(progress.received)}`,
        });
      },
      controller.signal,
    );

    if (!sameOs(os)) {
      return setState({
        id,
        status: "needs_manual",
        filePath: dest,
        folderPath: itemDir(id),
        progress: 100,
        message: `安装包已下载。当前电脑是 ${platformLabel(hostPlatform())}，无法直接执行 ${os === "win32" ? "Windows" : "macOS"} 安装程序。`,
        manualSteps: ["把安装包拷到对应系统的电脑", "双击运行安装包", "安装完成后回到助手点重新检测"],
      });
    }

    return await applyInstaller(id, dest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (controller.signal.aborted || message.includes("abort")) {
      return setState({ id, status: "missing", message: "已取消" });
    }
    log("error", message, id);
    return setState({ id, status: "failed", error: message, message: `失败：${message}` });
  } finally {
    abortControllers.delete(id);
  }
}

function resolveArch(os: TargetOs): Arch {
  if (hostPlatform() === os) return hostArch();
  return "x64";
}

function platformLabel(platform: string): string {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  return "Linux";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function finishDetect(id: string, message: string): Promise<ItemState> {
  const state = await detectItem(id);
  if (state.status === "missing") {
    return setState({ ...state, status: "needs_manual", message: `${message}，但当前终端还检测不到，请新开一个终端或重启助手后再检测` });
  }
  return setState({ ...state, message: state.message || message });
}

async function installGitMac(): Promise<ItemState> {
  setState({ id: "git", status: "installing", message: "macOS 将唤起命令行工具安装（如已安装会很快结束）" });
  const result = await runCommand("xcode-select", ["--install"], { itemId: "git", timeoutMs: 10000 });
  if (await tryVersion("git")) return await finishDetect("git", "已可以使用 Git");
  if (await commandExists("brew")) {
    const brew = await runCommand("brew", ["install", "git"], { itemId: "git" });
    if (brew.code === 0) return await finishDetect("git", "已通过 Homebrew 安装");
  }
  await openUrl("https://git-scm.com/download/mac").catch(() => undefined);
  return setState({
    id: "git",
    status: "open_page",
    docsUrl: "https://git-scm.com/download/mac",
    message: result.code === 0 ? "已弹出系统安装窗口，请按提示完成" : "已打开 Git 官网，请下载 macOS 安装包",
    manualSteps: ["如弹出“安装命令行工具”，点安装", "或从官网下载 pkg 后双击安装", "完成后点重新检测"],
  });
}

async function installClaudeCli(os: TargetOs): Promise<ItemState> {
  setState({ id: "claude-cli", status: "installing", message: "正在执行官方命令行安装脚本" });
  if (!sameOs(os)) {
    return setState({
      id: "claude-cli",
      status: "needs_manual",
      docsUrl: "https://code.claude.com/docs/zh-CN/quickstart",
      message: "Claude CLI 需要在目标系统的终端里执行官方安装命令",
      manualSteps:
        os === "win32"
          ? ["打开 PowerShell", "执行 irm https://claude.ai/install.ps1 | iex", "新开终端运行 claude --version"]
          : ["打开终端", "执行 curl -fsSL https://claude.ai/install.sh | bash", "新开终端运行 claude --version"],
    });
  }
  const result =
    os === "win32"
      ? await runCommand(
          "powershell",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"],
          { itemId: "claude-cli", timeoutMs: 12 * 60 * 1000 },
        )
      : await runCommand("bash", ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"], {
          itemId: "claude-cli",
          timeoutMs: 12 * 60 * 1000,
        });
  if (result.code === 0) return await finishDetect("claude-cli", "命令行安装完成");
  throw new Error(result.stderr || result.stdout || "Claude CLI 安装脚本失败");
}

async function installLarkCli(os: TargetOs, spec: { url: string; filename: string }, signal: AbortSignal): Promise<ItemState> {
  if (sameOs(os) && (await commandExists("npx"))) {
    setState({ id: "lark-cli", status: "installing", message: "正在执行 npx @larksuite/cli@latest install" });
    const result = await runCommand("npx", ["--yes", "@larksuite/cli@latest", "install"], {
      itemId: "lark-cli",
      timeoutMs: 12 * 60 * 1000,
    });
    if (result.code === 0) return await finishDetect("lark-cli", "已通过官方 npx 安装");
    log("warn", "npx 安装未成功，改为下载官方二进制", "lark-cli");
  }

  const dest = path.join(itemDir("lark-cli"), spec.filename);
  setState({ id: "lark-cli", status: "downloading", progress: 0, message: `正在下载 ${spec.filename}` });
  await downloadFile(
    spec.url,
    dest,
    (progress) => {
      setState({
        id: "lark-cli",
        status: "downloading",
        progress: progress.percent,
        received: progress.received,
        total: progress.total,
        filePath: dest,
        folderPath: itemDir("lark-cli"),
        message: progress.total ? `下载中 ${formatBytes(progress.received)} / ${formatBytes(progress.total)}` : "下载中",
      });
    },
    signal,
  );

  if (!sameOs(os)) {
    return setState({
      id: "lark-cli",
      status: "needs_manual",
      filePath: dest,
      folderPath: itemDir("lark-cli"),
      message: "飞书 CLI 安装包已下载，请在员工电脑上解压并把 lark-cli 放到 PATH",
      manualSteps: ["解压安装包", "把 lark-cli 放到可执行目录", "运行 lark-cli --version"],
    });
  }

  setState({ id: "lark-cli", status: "installing", message: "正在解压飞书 CLI" });
  const binDir = path.join(os.homedir(), ".local", "bin");
  await fs.promises.mkdir(binDir, { recursive: true });
  const extractDir = path.join(itemDir("lark-cli"), "extracted");
  await fs.promises.rm(extractDir, { recursive: true, force: true });
  await fs.promises.mkdir(extractDir, { recursive: true });

  if (dest.endsWith(".zip")) {
    await extractZip(dest, { dir: extractDir });
  } else {
    const tar = await runCommand("tar", ["-xzf", dest, "-C", extractDir], { itemId: "lark-cli" });
    if (tar.code !== 0) throw new Error(tar.stderr || "解压 tar.gz 失败");
  }

  const binary = findFile(extractDir, process.platform === "win32" ? /lark-cli\.exe$/i : /lark-cli$/);
  if (!binary) throw new Error("压缩包里没有找到 lark-cli");
  const target = path.join(binDir, path.basename(binary));
  await fs.promises.copyFile(binary, target);
  if (process.platform !== "win32") await fs.promises.chmod(target, 0o755);
  return await finishDetect("lark-cli", `已安装到 ${target}`);
}

async function installClaudian(signal: AbortSignal): Promise<ItemState> {
  const files = ["manifest.json", "main.js", "styles.css"] as const;
  const destDir = path.join(itemDir("claudian"), "2.0.15");
  await fs.promises.mkdir(destDir, { recursive: true });
  let done = 0;
  for (const file of files) {
    setState({
      id: "claudian",
      status: "downloading",
      progress: Math.round((done / files.length) * 100),
      message: `正在下载 ${file}`,
      folderPath: destDir,
    });
    await downloadFile(
      `https://github.com/YishenTu/claudian/releases/download/2.0.15/${file}`,
      path.join(destDir, file),
      undefined,
      signal,
    );
    done += 1;
  }

  const vaults = listObsidianVaults();
  const pluginDirs: string[] = [];
  for (const vault of vaults) {
    const pluginDir = path.join(vault, ".obsidian", "plugins", "claudian");
    await fs.promises.mkdir(pluginDir, { recursive: true });
    for (const file of files) {
      await fs.promises.copyFile(path.join(destDir, file), path.join(pluginDir, file));
    }
    pluginDirs.push(pluginDir);
  }

  if (pluginDirs.length) {
    return setState({
      id: "claudian",
      status: "needs_manual",
      folderPath: destDir,
      filePath: pluginDirs[0],
      progress: 100,
      message: `插件已写入 ${pluginDirs.length} 个 Obsidian 库，还需要在 Obsidian 里启用`,
      manualSteps: [
        "打开 Obsidian",
        "设置 → 第三方插件 → 关闭安全模式",
        "启用 Claudian",
        "如列表没有出现，重启一次 Obsidian",
      ],
    });
  }

  return setState({
    id: "claudian",
    status: "needs_manual",
    folderPath: destDir,
    progress: 100,
    message: "插件文件已下载。本机还没有检测到 Obsidian 库，需要你手动拷进去",
    manualSteps: [
      "先安装并打开一次 Obsidian，创建一个库",
      `把 ${destDir} 里的三个文件拷到 库/.obsidian/plugins/claudian/`,
      "设置 → 第三方插件 → 启用 Claudian",
    ],
  });
}

async function applyInstaller(id: string, dest: string): Promise<ItemState> {
  const ext = path.extname(dest).toLowerCase();
  setState({ id, status: "installing", message: "正在启动安装程序", filePath: dest, folderPath: path.dirname(dest) });

  if (process.platform === "win32") {
    if (ext === ".msi") {
      const silent = await runCommand("msiexec", ["/i", dest, "/qn", "/norestart"], { itemId: id, timeoutMs: 12 * 60 * 1000 });
      if (silent.code === 0) {
        if (id === "cc-switch") return markNeedsConfig(id, dest);
        return await finishDetect(id, "已完成静默安装");
      }
      log("warn", "静默安装失败，改为打开安装向导", id);
      launchDetached(dest);
      return manualAfterLaunch(id, dest, ["在弹出的安装向导中点下一步", "安装完成后回到这里点重新检测"]);
    }
    if (ext === ".exe") {
      const silentArgs = id === "python" ? ["/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_test=0"] : ["/VERYSILENT", "/NORESTART"];
      const silent = await runCommand(dest, silentArgs, { itemId: id, timeoutMs: 12 * 60 * 1000, shell: true });
      if (silent.code === 0) {
        if (id === "cc-switch") return markNeedsConfig(id, dest);
        return await finishDetect(id, "已完成静默安装");
      }
      log("warn", "静默安装失败，改为打开安装向导", id);
      launchDetached(dest);
      return manualAfterLaunch(id, dest, ["已打开安装包，请按向导完成安装", "Python / Git 请勾选加入 PATH", "完成后点重新检测"]);
    }
  }

  if (process.platform === "darwin") {
    if (ext === ".pkg") {
      await openPath(dest);
      return manualAfterLaunch(id, dest, ["已打开 pkg，请按系统安装器完成", "可能需要输入本机密码", "完成后点重新检测"]);
    }
    if (ext === ".dmg") {
      const copied = await tryInstallDmg(dest);
      if (copied) {
        if (id === "cc-switch") return markNeedsConfig(id, copied);
        return await finishDetect(id, `已复制到 ${copied}`);
      }
      await openPath(dest);
      return manualAfterLaunch(id, dest, ["已打开 dmg，把应用拖到“应用程序”", "如遇安全提示，到系统设置 → 隐私与安全性 允许打开", "完成后点重新检测"]);
    }
  }

  await openPath(dest).catch(() => undefined);
  return manualAfterLaunch(id, dest, ["已打开安装包所在位置", "请双击安装", "完成后点重新检测"]);
}

function markNeedsConfig(id: string, filePath: string): ItemState {
  return setState({
    id,
    status: "needs_config",
    filePath,
    folderPath: downloadDir(),
    message: "软件已处理。密钥需要单独发放、单独配置，助手不会写入任何密钥",
    manualSteps: ["打开 CC Switch", "按公司单独发送的密钥说明填入", "不要把密钥发到群里或写进仓库"],
  });
}

function manualAfterLaunch(id: string, dest: string, steps: string[]): ItemState {
  return setState({
    id,
    status: "needs_manual",
    filePath: dest,
    folderPath: path.dirname(dest),
    progress: 100,
    message: "安装包已就绪，需要你在弹出的窗口里点一下确认",
    manualSteps: steps,
  });
}

async function tryInstallDmg(dmgPath: string): Promise<string | undefined> {
  const mount = path.join(os.tmpdir(), `onboard-dmg-${Date.now()}`);
  await fs.promises.mkdir(mount, { recursive: true });
  const attach = await runCommand("hdiutil", ["attach", dmgPath, "-nobrowse", "-mountpoint", mount], { timeoutMs: 120000 });
  if (attach.code !== 0) return undefined;
  try {
    const app = findFile(mount, /\.app$/);
    if (!app) return undefined;
    const dest = path.join("/Applications", path.basename(app));
    await runCommand("rm", ["-rf", dest], { timeoutMs: 20000 });
    const copy = await runCommand("cp", ["-R", app, "/Applications"], { timeoutMs: 120000 });
    if (copy.code !== 0) return undefined;
    return dest;
  } finally {
    await runCommand("hdiutil", ["detach", mount, "-quiet"], { timeoutMs: 30000 }).catch(() => undefined);
  }
}

function findFile(root: string, pattern: RegExp): string | undefined {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (pattern.test(entry.name)) return full;
      if (entry.isDirectory() && !entry.name.startsWith(".")) stack.push(full);
    }
  }
  return undefined;
}
