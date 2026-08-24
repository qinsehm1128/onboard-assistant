import type { ItemStatus } from "@shared/types";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  unknown: "未知",
  checking: "检测中",
  missing: "未安装",
  queued: "排队中",
  resolving: "解析地址",
  downloading: "下载中",
  installing: "安装中",
  installed: "已安装",
  needs_manual: "请手动安装",
  needs_config: "需单独配置",
  open_page: "请到官网下载",
  failed: "失败",
};

export function statusTone(status: ItemStatus): string {
  switch (status) {
    case "installed":
      return "bg-moss/12 text-moss";
    case "needs_config":
      return "bg-teal/12 text-teal-dark";
    case "needs_manual":
    case "open_page":
      return "bg-amber/12 text-amber";
    case "failed":
      return "bg-rose/12 text-rose";
    case "downloading":
    case "installing":
    case "queued":
    case "resolving":
    case "checking":
      return "bg-teal/10 text-teal";
    default:
      return "bg-line text-muted";
  }
}

export function isBusy(status: ItemStatus): boolean {
  return ["queued", "checking", "resolving", "downloading", "installing"].includes(status);
}

export function formatBytes(value?: number): string {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
