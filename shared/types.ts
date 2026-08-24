export type HostPlatform = "win32" | "darwin" | "linux";
export type TargetOs = "win32" | "darwin";
export type Arch = "x64" | "arm64";

export type CategoryId = "runtime" | "ai" | "network" | "input" | "collab";

export type ItemStatus =
  | "unknown"
  | "checking"
  | "missing"
  | "queued"
  | "resolving"
  | "downloading"
  | "installing"
  | "installed"
  | "needs_manual"
  | "needs_config"
  | "open_page"
  | "failed";

export interface CatalogItem {
  id: string;
  name: string;
  category: CategoryId;
  summary: string;
  docsUrl: string;
  notes?: string;
  versionHint?: string;
  platforms: TargetOs[];
  dependsOn: string[];
  order: number;
  kind: "auto" | "cli" | "app" | "plugin" | "page";
}

export interface ItemState {
  id: string;
  status: ItemStatus;
  version?: string;
  progress?: number;
  received?: number;
  total?: number;
  message?: string;
  error?: string;
  filePath?: string;
  folderPath?: string;
  manualSteps?: string[];
  docsUrl?: string;
}

export interface SessionInfo {
  hostPlatform: HostPlatform;
  arch: Arch;
  downloadDir: string;
  preview: boolean;
  hostname: string;
  version: string;
  repoUrl: string;
  visibility: "public" | "private";
}

export type UpdateStatus = "checking" | "current" | "available" | "none" | "error";

export interface UpdateInfo {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseName?: string;
  publishedAt?: string;
  notes?: string;
  message: string;
}

export interface ProgressEvent {
  type: "item" | "log" | "session";
  id?: string;
  state?: ItemState;
  level?: "info" | "warn" | "error";
  message?: string;
  at: string;
}

export interface DetectResponse {
  items: Record<string, ItemState>;
}
