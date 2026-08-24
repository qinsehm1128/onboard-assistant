import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickAsset, resolveDownload } from "./resolve.ts";

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

describe("resolveDownload", () => {
  it("returns pinned Windows and macOS installers without calling GitHub", async () => {
    const clashWin = await resolveDownload("clash-verge", "win32", "x64");
    const clashMac = await resolveDownload("clash-verge", "darwin", "arm64");
    const switchWin = await resolveDownload("cc-switch", "win32", "x64");
    const larkMac = await resolveDownload("lark-cli", "darwin", "arm64");
    assert.match(clashWin.filename, /x64-setup\.exe$/);
    assert.match(clashMac.filename, /aarch64\.dmg$/);
    assert.match(switchWin.filename, /\.msi$/);
    assert.match(larkMac.filename, /darwin-arm64\.tar\.gz$/);
  });

  it("marks voice typing as an official-page download", async () => {
    const voice = await resolveDownload("voice-typing", "darwin", "arm64");
    assert.equal(voice.pageOnly, true);
    assert.match(voice.pageUrl || "", /doubao\.com/);
  });
});

