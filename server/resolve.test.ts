import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickAsset } from "./resolve.ts";

describe("pickAsset", () => {
  const assets = [
    { name: "Clash.Verge_2.4.7_x64-setup.exe", browser_download_url: "https://example.com/win" },
    { name: "Clash.Verge_2.4.7_aarch64.dmg", browser_download_url: "https://example.com/mac" },
    { name: "notes.txt", browser_download_url: "https://example.com/notes" },
  ];

  it("picks the first matching pattern", () => {
    const hit = pickAsset(assets, [/aarch64\.dmg$/, /x64-setup\.exe$/]);
    assert.equal(hit?.name, "Clash.Verge_2.4.7_aarch64.dmg");
  });

  it("falls through to later patterns", () => {
    const hit = pickAsset(assets, [/arm64-setup\.exe$/, /x64-setup\.exe$/]);
    assert.equal(hit?.name, "Clash.Verge_2.4.7_x64-setup.exe");
  });

  it("returns undefined when nothing matches", () => {
    assert.equal(pickAsset(assets, [/\.msi$/]), undefined);
  });
});
