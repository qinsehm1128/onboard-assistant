import type { CatalogItem, CategoryId, ItemState, ProgressEvent, SessionInfo, TargetOs, UpdateInfo } from "@shared/types";

export interface CatalogResponse {
  os: TargetOs;
  categories: { id: CategoryId; title: string; hint: string }[];
  items: CatalogItem[];
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `请求失败 ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  session: () => fetch("/api/session").then((res) => readJson<SessionInfo>(res)),
  update: () => fetch("/api/update").then((res) => readJson<UpdateInfo>(res)),
  catalog: (os: TargetOs) => fetch(`/api/catalog?os=${os}`).then((res) => readJson<CatalogResponse>(res)),
  detect: (os: TargetOs) =>
    fetch(`/api/detect?os=${os}`).then((res) => readJson<{ items: Record<string, ItemState> }>(res)),
  detectOne: (id: string) =>
    fetch(`/api/detect/${id}`, { method: "POST" }).then((res) => readJson<ItemState>(res)),
  install: (id: string, os: TargetOs) =>
    fetch(`/api/install/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ os }),
    }).then((res) => readJson<{ ok: boolean }>(res)),
  installAll: (os: TargetOs, ids: string[]) =>
    fetch("/api/install-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ os, ids }),
    }).then((res) => readJson<{ ok: boolean }>(res)),
  cancel: (id: string) => fetch(`/api/cancel/${id}`, { method: "POST" }).then((res) => readJson<{ ok: boolean }>(res)),
  openPath: (target: string) =>
    fetch("/api/open-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target }),
    }),
  openUrl: async (url: string) => {
    const response = await fetch("/api/open-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) window.open(url, "_blank", "noopener,noreferrer");
  },
  launch: (target: string) =>
    fetch("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target }),
    }),
};

export function connectEvents(onEvent: (event: ProgressEvent) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as ProgressEvent);
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}
