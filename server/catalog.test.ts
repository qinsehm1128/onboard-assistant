import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG, itemById, itemsForOs, voiceTypingDocs } from "./catalog.ts";

describe("catalog", () => {
  it("covers the company checklist on both desktop systems", () => {
    const ids = CATALOG.map((item) => item.id);
    for (const id of [
      "git",
      "python",
      "node",
      "obsidian",
      "claudian",
      "claude-cli",
      "cc-switch",
      "clash-verge",
      "voice-typing",
      "lark-cli",
    ]) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    assert.equal(itemsForOs("win32").length, 10);
    assert.equal(itemsForOs("darwin").length, 10);
  });

  it("keeps install order so Node is ready before Lark CLI", () => {
    const win = itemsForOs("win32").map((item) => item.id);
    assert.ok(win.indexOf("python") < win.indexOf("claude-cli"));
    assert.ok(win.indexOf("node") < win.indexOf("claude-cli"));
    assert.ok(win.indexOf("node") < win.indexOf("lark-cli"));
    assert.ok(win.indexOf("obsidian") < win.indexOf("claudian"));
    assert.deepEqual(itemById("claude-cli")?.dependsOn, ["python", "node"]);
    assert.deepEqual(itemById("lark-cli")?.dependsOn, ["node"]);
    assert.deepEqual(itemById("claudian")?.dependsOn, ["obsidian"]);
  });

  it("points voice typing at the official page for each OS", () => {
    assert.equal(voiceTypingDocs("darwin"), "https://shurufa.doubao.com/pc");
    assert.equal(voiceTypingDocs("win32"), "https://z.weixin.qq.com/web/change-log/windows");
  });
});
