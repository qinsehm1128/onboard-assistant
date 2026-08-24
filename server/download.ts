import fs from "node:fs";
import path from "node:path";
import { UA } from "./paths.ts";

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number;
}

export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "follow",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 HTTP ${response.status}：${url}`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  const file = fs.createWriteStream(dest);
  const reader = response.body.getReader();
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      file.write(Buffer.from(value));
      onProgress?.({
        received,
        total,
        percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0,
      });
    }
  } catch (error) {
    file.destroy();
    await fs.promises.unlink(dest).catch(() => undefined);
    throw error;
  }

  await new Promise<void>((resolve, reject) => {
    file.end((err: NodeJS.ErrnoException | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });
  onProgress?.({ received, total, percent: 100 });
  return dest;
}
