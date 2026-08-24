# AI 电脑基础安装

给新员工用的装机助手。支持 **Windows** 和 **macOS**：先检测本机，再下载/安装公司入职清单里的软件。能自动装的会走静默安装或官方命令行；只能下载的，会把安装包存到本机，并在界面写出手动步骤。

## 清单

| 项目 | 处理方式 |
| --- | --- |
| Git / Python / Node.js | Windows 优先 `winget`，macOS 优先 Homebrew；失败则下载官方安装包。Python / Git 安装包尽量静默并写入 PATH。 |
| Obsidian | 下载官方 exe / dmg。Windows 尝试静默，失败则打开安装向导；macOS 尝试把 app 拷到「应用程序」。 |
| Claudian 2.0.15 | 下载插件三个文件。若本机已有 Obsidian 库，会写入 `.obsidian/plugins/claudian/`，仍需在 Obsidian 里启用。 |
| Claude CLI | **不用 PowerShell / 官方脚本。** 先装 Python 和 Node，再执行 `npm install -g @anthropic-ai/claude-code`。单独点这项时也会先把依赖排进队列。 |
| CC Switch v3.15.0 | 下载 msi / dmg 并尝试安装。**密钥需单独发放、单独配置**，助手不会写入任何密钥。 |
| Clash Verge Rev v2.4.7 | 下载对应系统安装包，能装则装，否则打开安装包。 |
| 语音打字 | macOS 打开[豆包输入法](https://shurufa.doubao.com/pc)；Windows 打开[微信输入法](https://z.weixin.qq.com/web/change-log/windows)。官网没有稳定直链，所以这一项按「打开官网」处理。 |
| 飞书 CLI | 优先 `npx @larksuite/cli@latest install`，失败再下载官方二进制并解压到 `~/.local/bin`。 |

安装包默认放在：

`~/Downloads/onboard-assistant/`

## 本机运行

需要本机已有 Node.js 20+（用这个助手装 Node 是给员工电脑用的；开发者自己先有 Node 即可）。

```bash
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:43173

安装包打开后会自己启动本机装机服务（`127.0.0.1:43174`）再加载界面，不再依赖开发服务器。

桌面窗口（开发时用 Electron）：

```bash
npm run desktop
```

生产模式（先构建界面，再用同一端口提供页面和接口）：

```bash
npm run build
npm start
```

然后打开 http://127.0.0.1:43174

## 打安装包

在对应系统上打包：

```bash
npm run dist:win
npm run dist:mac
```

产物在 `release/`。打包只是外壳，真正干活的是本地装机服务。GitHub Actions 里也可以点 **Desktop packages** 工作流，在 Windows / macOS runner 上直接编译出安装包。打 `v*` 标签时会发布到公开 GitHub Release，桌面端和界面都能检测更新。

仓库是公开的：https://github.com/qinsehm1128/onboard-assistant

启动后界面会检查最新 Release。桌面安装包还会用 `electron-updater` 对照 GitHub 做热更新检测。

## 共同仓库：编译和测试

这个目录就是给团队共用的仓库。任何人 clone 下来后，一条命令就能和 CI 跑同一套检查：

```bash
npm ci
npm run ci
```

`npm run ci` 会依次做：

1. `lint` — 静态检查
2. `typecheck` — TypeScript 编译检查
3. `test` — 清单、下载解析、本机检测、HTTP API
4. `build` — 编译出 `dist/` 网页

### GitHub Actions

推到 GitHub 后会自动跑：

| 工作流 | 何时跑 | 做什么 |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | 推送 `main`、Pull Request、手动触发 | 在 Ubuntu / Windows / macOS 上安装依赖、检查、测试、编译，并上传 `dist` |
| [Desktop packages](.github/workflows/desktop.yml) | 打 `v*` 标签，或 Actions 里手动选系统 | 在官方 runner 上编译 Windows 安装包 / macOS dmg，上传 Artifact |

把本仓库接到公司 GitHub 组织（只需做一次）：

```bash
# 在 GitHub 上新建空仓库，例如 your-org/onboard-assistant，不要勾选 README
git remote add github git@github.com:YOUR_ORG/onboard-assistant.git
git push -u github main
```

之后同事只需要：

```bash
git clone git@github.com:YOUR_ORG/onboard-assistant.git
cd onboard-assistant
npm ci
npm run ci
```

Dependabot 会每周开 PR 升级 npm 和 GitHub Actions。合并前 CI 必须绿。

## 界面会告诉你什么

- **已安装**：本机检测到了，并显示版本号。
- **下载中**：有百分比和已下载大小。
- **请手动安装**：安装包已经在下载目录，卡片上有步骤，以及「打开安装包 / 打开下载目录」。
- **请到官网下载**：没有稳定直链（语音打字）。
- **需单独配置**：CC Switch 装好了，密钥还要按单独发送的说明填写。

「安装未完成项」会按 Git → Python → Node → 其余工具的顺序排队，避免安装器互相抢锁。

## 说明

- 这是公司内部装机工具，只下载官方或清单里指定的 GitHub Release。
- Linux 上可以预览界面、试下载，但不能代替员工电脑上的 Windows / macOS 安装向导。
- 装完 Git / Python / Node 后，如果当前窗口还检测不到，新开一个终端或点「重新检测」。
