import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectItem, listObsidianVaults } from "./detect.ts";
import { commandExists, runCommand } from "./exec.ts";

describe("detectItem", () => {
  it("detects Git, Python, and Node on the CI / dev machine", async () => {
    const git = await detectItem("git");
    const python = await detectItem("python");
    const node = await detectItem("node");
    assert.equal(git.status, "installed");
    assert.equal(python.status, "installed");
    assert.equal(node.status, "installed");
    assert.match(git.version || "", /\d+\.\d+/);
    assert.match(python.version || "", /\d+\.\d+/);
    assert.match(node.version || "", /\d+\.\d+/);
  });

  it("marks voice typing as an official-page install", async () => {
    const voice = await detectItem("voice-typing");
    assert.equal(voice.status, "open_page");
  });

  it("can invoke npm without relying on a Windows .cmd shim", async () => {
    assert.equal(await commandExists("npm"), true);
    const result = await runCommand("npm", ["--version"], { timeoutMs: 15000 });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /\d+\.\d+/);
  });

  it("lists Obsidian vaults without throwing when none are registered", () => {
    assert.ok(Array.isArray(listObsidianVaults()));
  });

  it("detects Feishu CLI without throwing when it is absent", async () => {
    const lark = await detectItem("lark-cli");
    assert.ok(lark.status === "missing" || lark.status === "installed");
  });
});
