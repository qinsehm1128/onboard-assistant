import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createApp } from "./app.ts";

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("createApp", () => {
  it("serves health, session, and both OS catalogs", async () => {
    await withServer(async (base) => {
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.ok, true);

      const session = await (await fetch(`${base}/api/session`)).json();
      assert.ok(session.downloadDir);
      assert.ok(["win32", "darwin", "linux"].includes(session.hostPlatform));
      assert.equal(session.visibility, "public");
      assert.match(session.version, /^\d+\.\d+\.\d+/);
      assert.match(session.repoUrl, /github\.com\/qinsehm1128\/onboard-assistant/);

      const update = await (await fetch(`${base}/api/update`)).json();
      assert.ok(["current", "available", "none", "error"].includes(update.status));
      assert.equal(update.currentVersion, session.version);

      const win = await (await fetch(`${base}/api/catalog?os=win32`)).json();
      const mac = await (await fetch(`${base}/api/catalog?os=darwin`)).json();
      assert.equal(win.os, "win32");
      assert.equal(mac.os, "darwin");
      assert.equal(win.items.length, 10);
      assert.equal(mac.items.length, 10);
      const winVoice = win.items.find((item: { id: string }) => item.id === "voice-typing");
      const macVoice = mac.items.find((item: { id: string }) => item.id === "voice-typing");
      assert.match(winVoice.docsUrl, /weixin\.qq\.com/);
      assert.match(macVoice.docsUrl, /doubao\.com/);
    });
  });

  it("detects local runtimes through the HTTP API", async () => {
    await withServer(async (base) => {
      const detected = await (await fetch(`${base}/api/detect?os=win32`)).json();
      assert.equal(detected.items.git.status, "installed");
      assert.equal(detected.items.python.status, "installed");
      assert.equal(detected.items.node.status, "installed");
    });
  });
});
