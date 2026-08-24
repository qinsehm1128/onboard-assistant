import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectItem } from "./detect.ts";

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
});
