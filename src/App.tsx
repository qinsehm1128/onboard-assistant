import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpCircle,
  BookOpen,
  CheckCircle2,
  Download,
  FolderOpen,
  Globe,
  KeyRound,
  LoaderCircle,
  Mic,
  RefreshCw,
  RotateCcw,
  Terminal,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { CatalogItem, ItemState, ProgressEvent, SessionInfo, TargetOs, UpdateInfo } from "@shared/types";
import { api, connectEvents, type CatalogResponse } from "./api";
import { formatBytes, isBusy, STATUS_LABEL, statusTone } from "./status";

const ICONS: Record<string, typeof Wrench> = {
  git: Terminal,
  python: Wrench,
  node: Wrench,
  obsidian: BookOpen,
  claudian: BookOpen,
  "claude-cli": Terminal,
  "cc-switch": KeyRound,
  "clash-verge": Globe,
  "voice-typing": Mic,
  "lark-cli": Terminal,
};

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [os, setOs] = useState<TargetOs>("win32");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [logs, setLogs] = useState<ProgressEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    const stop = connectEvents((event) => {
      if (event.type === "item" && event.state) {
        setStates((prev) => ({ ...prev, [event.state!.id]: event.state! }));
      }
      if (event.type === "log" && event.message) {
        setLogs((prev) => [...prev.slice(-80), event]);
      }
    });
    return stop;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setLoading(true);
        setError(null);
        const nextSession = await api.session();
        if (cancelled) return;
        setSession(nextSession);
        const initialOs: TargetOs = nextSession.hostPlatform === "darwin" ? "darwin" : "win32";
        setOs(initialOs);
        try {
          setUpdate(await api.update());
        } catch {
          setUpdate({
            status: "error",
            currentVersion: nextSession.version,
            message: "启动时检查更新失败，可稍后重试。",
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "装机服务未启动");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const [nextCatalog, detected] = await Promise.all([api.catalog(os), api.detect(os)]);
        if (cancelled) return;
        setCatalog(nextCatalog);
        setStates((prev) => ({ ...detected.items, ...pickBusy(prev) }));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "无法读取安装清单");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [os, session]);

  const items = catalog?.items ?? [];
  const doneCount = items.filter((item) => {
    const status = states[item.id]?.status;
    return status === "installed" || status === "needs_config";
  }).length;
  const overall = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const anyBusy = items.some((item) => isBusy(states[item.id]?.status ?? "unknown"));

  const grouped = useMemo(() => {
    if (!catalog) return [];
    return catalog.categories
      .map((category) => ({
        ...category,
        items: catalog.items.filter((item) => item.category === category.id),
      }))
      .filter((category) => category.items.length > 0);
  }, [catalog]);

  async function handleInstall(id: string) {
    setStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], id, status: "queued", message: "已加入队列" },
    }));
    await api.install(id, os);
  }

  async function handleInstallAll() {
    const ids = items
      .filter((item) => {
        const status = states[item.id]?.status;
        return status !== "installed" && status !== "needs_config";
      })
      .map((item) => item.id);
    if (!ids.length) return;
    setBusyAll(true);
    try {
      await api.installAll(os, ids);
    } finally {
      setBusyAll(false);
    }
  }

  async function refreshUpdate() {
    setCheckingUpdate(true);
    try {
      setUpdate(await api.update());
    } catch (err) {
      setUpdate({
        status: "error",
        currentVersion: session?.version || "—",
        message: err instanceof Error ? err.message : "检查更新失败",
      });
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleRedetect() {
    const detected = await api.detect(os);
    setStates((prev) => ({ ...detected.items, ...pickBusy(prev) }));
  }

  if (error && !catalog) {
    return (
      <Shell>
        <EmptyCard
          icon={TriangleAlert}
          title="装机服务还没连上"
          body="请先在项目目录运行 npm run dev 或 npm run desktop。如果已经在跑，点下面重试。"
          action="重新连接"
          onAction={() => window.location.reload()}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.22em] text-teal uppercase">Company setup</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">AI 电脑基础安装</h1>
          <p className="mt-3 text-sm leading-7 text-muted md:text-base">
            公开仓库，按入职清单检测、下载并安装 Git、Python、Node.js，以及 Obsidian、Claude CLI、飞书
            CLI 等。Claude CLI 会先装 Python / Node，再用 npm 安装。启动时会检查 GitHub 上的新版本。
          </p>
        </div>
        <OsSwitch
          os={os}
          locked={session?.hostPlatform === "win32" || session?.hostPlatform === "darwin"}
          host={session?.hostPlatform}
          onChange={setOs}
        />
      </header>

      <UpdateBanner
        update={update}
        checking={checkingUpdate}
        version={session?.version}
        repoUrl={session?.repoUrl}
        onCheck={() => void refreshUpdate()}
        onOpen={(url) => void api.openUrl(url)}
      />

      {session?.preview ? (
        <div className="mt-5 rounded-2xl border border-amber/30 bg-amber/8 px-4 py-3 text-sm leading-6 text-ink">
          当前是 Linux 预览环境，可以切换查看 Windows / macOS 清单，也可以试下载。真正的系统安装请在员工的
          Windows 或 macOS 电脑上运行桌面版。
        </div>
      ) : null}

      <section className="card-shadow mt-6 rounded-3xl border border-line bg-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-muted">总体进度</div>
            <div className="mt-1 text-2xl font-semibold">
              {doneCount} / {items.length || "—"} 已就绪
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => void handleRedetect()} type="button">
              <RefreshCw className="size-4" />
              重新检测
            </button>
            <button className="btn-primary" disabled={busyAll || anyBusy} onClick={() => void handleInstallAll()} type="button">
              {anyBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {anyBusy ? "正在处理" : "安装未完成项"}
            </button>
          </div>
        </div>
        <ProgressBar value={overall} />
        <p className="mt-3 text-xs text-muted">
          安装包目录：{session?.downloadDir || "检测中…"}。密钥不会写入本助手，CC Switch
          装好后按单独发放的说明配置。
        </p>
      </section>

      {loading && !catalog ? (
        <div className="mt-8 grid gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-3xl bg-line/70" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {grouped.map((category) => (
            <section key={category.id}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{category.title}</h2>
                  <p className="mt-1 text-sm text-muted">{category.hint}</p>
                </div>
              </div>
              <div className="grid gap-4">
                {category.items.map((item) => (
                  <SoftwareCard
                    key={item.id}
                    item={item}
                    state={states[item.id]}
                    onInstall={() => void handleInstall(item.id)}
                    onCancel={() => void api.cancel(item.id)}
                    onDetect={() => void api.detectOne(item.id)}
                    onOpenPath={(target) => void api.openPath(target)}
                    onOpenUrl={(url) => void api.openUrl(url)}
                    onLaunch={(target) => void api.launch(target)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <LogPanel logs={logs} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      {children}
    </div>
  );
}

function EmptyCard({
  icon: Icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: typeof TriangleAlert;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="card-shadow mx-auto mt-24 max-w-lg rounded-3xl border border-line bg-card p-8 text-center">
      <Icon className="mx-auto size-10 text-amber" />
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
      <button className="btn-primary mx-auto mt-6" onClick={onAction} type="button">
        {action}
      </button>
    </div>
  );
}

function OsSwitch({
  os,
  locked,
  host,
  onChange,
}: {
  os: TargetOs;
  locked?: boolean;
  host?: string;
  onChange: (os: TargetOs) => void;
}) {
  const options: { id: TargetOs; label: string }[] = [
    { id: "win32", label: "Windows" },
    { id: "darwin", label: "macOS" },
  ];
  return (
    <div className="rounded-2xl border border-line bg-card p-2">
      <div className="flex">
        {options.map((option) => (
          <button
            key={option.id}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              os === option.id ? "bg-ink text-paper" : "text-muted hover:text-ink"
            }`}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="px-2 pt-2 text-[11px] text-muted">
        {locked ? `已按本机识别为 ${host === "darwin" ? "macOS" : "Windows"}，仍可对照另一边清单。` : "预览时可切换系统清单"}
      </p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-teal transition-all duration-500" style={{ width: `${Math.max(value, 0)}%` }} />
    </div>
  );
}

function SoftwareCard({
  item,
  state,
  onInstall,
  onCancel,
  onDetect,
  onOpenPath,
  onOpenUrl,
  onLaunch,
}: {
  item: CatalogItem;
  state?: ItemState;
  onInstall: () => void;
  onCancel: () => void;
  onDetect: () => void;
  onOpenPath: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onLaunch: (path: string) => void;
}) {
  const status = state?.status ?? "unknown";
  const Icon = ICONS[item.id] ?? Wrench;
  const busy = isBusy(status);
  const showBar = status === "downloading" || (status === "installing" && (state?.progress ?? 0) > 0);

  return (
    <article className="card-shadow rounded-3xl border border-line bg-card p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper text-teal">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{item.name}</h3>
              {item.versionHint ? <span className="text-xs text-muted">{item.versionHint}</span> : null}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(status)}`}>
                {STATUS_LABEL[status]}
                {state?.version ? ` ${state.version}` : ""}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
            {item.notes ? <p className="mt-2 text-sm text-teal-dark">{item.notes}</p> : null}
            {state?.message ? <p className="mt-2 text-sm text-ink">{state.message}</p> : null}
            {state?.error ? <p className="mt-2 text-sm text-rose">{state.error}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {busy ? (
            <button className="btn-secondary" onClick={onCancel} type="button">
              取消
            </button>
          ) : (
            <button className="btn-primary" onClick={onInstall} type="button">
              {status === "failed" ? <RotateCcw className="size-4" /> : <Download className="size-4" />}
              {status === "installed" ? "重新安装" : status === "failed" ? "重试" : status === "open_page" ? "打开官网" : "安装 / 下载"}
            </button>
          )}
          <button className="btn-secondary" onClick={onDetect} type="button">
            检测
          </button>
          <button className="btn-secondary" onClick={() => onOpenUrl(item.docsUrl)} type="button">
            说明
          </button>
        </div>
      </div>

      {showBar || status === "installing" || status === "queued" || status === "resolving" ? (
        <div className="mt-4">
          <ProgressBar value={status === "downloading" ? state?.progress ?? 0 : status === "installing" ? 70 : 15} />
          {status === "downloading" ? (
            <p className="mt-2 text-xs text-muted">
              {formatBytes(state?.received)} / {state?.total ? formatBytes(state.total) : "未知大小"}
            </p>
          ) : null}
        </div>
      ) : null}

      {(status === "needs_manual" || status === "needs_config" || status === "open_page") && state?.manualSteps?.length ? (
        <ol className="mt-4 space-y-2 rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
          {state.manualSteps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="font-semibold text-teal">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {state?.filePath ? (
          <button className="btn-ghost" onClick={() => onLaunch(state.filePath!)} type="button">
            <CheckCircle2 className="size-4" />
            打开安装包
          </button>
        ) : null}
        {state?.folderPath ? (
          <button className="btn-ghost" onClick={() => onOpenPath(state.folderPath!)} type="button">
            <FolderOpen className="size-4" />
            打开下载目录
          </button>
        ) : null}
        {state?.docsUrl || item.docsUrl ? (
          <button className="btn-ghost" onClick={() => onOpenUrl(state?.docsUrl || item.docsUrl)} type="button">
            <Globe className="size-4" />
            打开官网
          </button>
        ) : null}
      </div>
    </article>
  );
}

function LogPanel({ logs }: { logs: ProgressEvent[] }) {
  return (
    <section className="mt-10 rounded-3xl border border-line bg-ink px-5 py-4 text-paper">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">安装日志</h2>
        <span className="text-xs text-paper/50">{logs.length ? "实时输出" : "还没有动作"}</span>
      </div>
      <div className="max-h-56 overflow-auto font-mono text-xs leading-6 text-paper/80">
        {logs.length === 0 ? (
          <p>点卡片上的“安装 / 下载”后，这里会显示检测、下载和安装过程。</p>
        ) : (
          logs.map((entry, index) => (
            <div key={`${entry.at}-${index}`}>
              <span className="text-paper/40">{entry.at.slice(11, 19)} </span>
              <span className={entry.level === "error" ? "text-red-300" : entry.level === "warn" ? "text-amber-200" : ""}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function UpdateBanner({
  update,
  checking,
  version,
  repoUrl,
  onCheck,
  onOpen,
}: {
  update: UpdateInfo | null;
  checking: boolean;
  version?: string;
  repoUrl?: string;
  onCheck: () => void;
  onOpen: (url: string) => void;
}) {
  const tone =
    update?.status === "available"
      ? "border-teal/30 bg-teal/8"
      : update?.status === "error"
        ? "border-rose/30 bg-rose/8"
        : "border-line bg-card";
  return (
    <section className={`card-shadow mt-6 rounded-3xl border px-5 py-4 ${tone}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowUpCircle className="size-4 text-teal" />
            公开仓库 · 检测更新
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">
            {checking ? "正在检查 GitHub Release…" : update?.message || `当前版本 ${version || "—"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={checking} onClick={onCheck} type="button">
            {checking ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            检查更新
          </button>
          {update?.releaseUrl ? (
            <button className="btn-primary" onClick={() => onOpen(update.releaseUrl!)} type="button">
              <Download className="size-4" />
              {update.status === "available" ? "打开新版本" : "打开发布页"}
            </button>
          ) : repoUrl ? (
            <button className="btn-secondary" onClick={() => onOpen(repoUrl)} type="button">
              <Globe className="size-4" />
              打开仓库
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function pickBusy(prev: Record<string, ItemState>): Record<string, ItemState> {
  return Object.fromEntries(Object.entries(prev).filter(([, state]) => isBusy(state.status)));
}
