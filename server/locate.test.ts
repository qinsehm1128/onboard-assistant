import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  claudianManifestPath,
  npmViaNodeInvocation,
  obsidianConfigCandidates,
  obsidianExeCandidates,
  parseObsidianVaultPaths,
  resolveNpmInvocationForHome,
  walkFind,
  windowsDriveRoots,
  isWindowsSystemDrive,
  obsidianWalkRoots,
  larkCliCandidates,
} from "./locate.ts";

describe("windowsDriveRoots", () => {
  it("lists every drive letter that currently exists", () => {
    const exists = new Set(["C:\\", "D:\\", "E:\\"]);
    assert.deepEqual(
      windowsDriveRoots((candidate) => exists.has(candidate)),
      ["C:\\", "D:\\", "E:\\"],
    );
  });

  it("does not recurse the Windows system drive root", () => {
    assert.equal(isWindowsSystemDrive("C:\\"), true);
    assert.equal(isWindowsSystemDrive("D:\\"), false);
    const roots = obsidianWalkRoots({
      drives: ["C:\\", "D:\\"],
      localAppData: "C:\\Users\\alex\\AppData\\Local",
    });
    assert.ok(!roots.some((entry) => /^[cC]:\\$/.test(entry)));
    assert.ok(roots.some((entry) => /Program Files/i.test(entry)));
    assert.ok(roots.some((entry) => entry.startsWith("D:")));
  });
});

describe("obsidianExeCandidates", () => {
  it("covers default folders on every disk, not only C:", () => {
    const candidates = obsidianExeCandidates({
      home: "C:\\Users\\alex",
      env: {
        LOCALAPPDATA: "C:\\Users\\alex\\AppData\\Local",
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
      },
      drives: ["C:\\", "D:\\", "E:\\"],
    });
    assert.ok(candidates.some((entry) => entry.includes("Obsidian.exe") && entry.includes("D:")));
    assert.ok(candidates.some((entry) => entry.includes("Obsidian.exe") && entry.includes("E:")));
    assert.ok(candidates.some((entry) => /AppData.Local.Obsidian.Obsidian\.exe/i.test(entry)));
  });
});

describe("parseObsidianVaultPaths", () => {
  it("reads vault paths from obsidian.json regardless of disk", () => {
    const raw = JSON.stringify({
      vaults: {
        a: { path: "D:\\Notes\\Work" },
        b: { path: "E:/vaults/personal" },
        c: { path: "  " },
      },
    });
    const vaults = parseObsidianVaultPaths(raw);
    assert.equal(vaults.length, 2);
    assert.ok(vaults.some((entry) => /Notes/.test(entry)));
    assert.ok(vaults.some((entry) => /personal/.test(entry)));
  });

  it("returns nothing for broken config", () => {
    assert.deepEqual(parseObsidianVaultPaths("{"), []);
  });
});

describe("obsidianConfigCandidates", () => {
  it("also looks next to a portable Obsidian.exe", () => {
    const configs = obsidianConfigCandidates({
      home: "C:\\Users\\alex",
      env: { APPDATA: "C:\\Users\\alex\\AppData\\Roaming" },
      exePath: "D:\\Apps\\Obsidian\\Obsidian.exe",
    });
    assert.ok(configs.some((entry) => /obsidian\.json/i.test(entry) && /Roaming/i.test(entry)));
    assert.ok(configs.some((entry) => /obsidian\.json/i.test(entry) && /D:/.test(entry)));
  });
});

describe("npmViaNodeInvocation", () => {
  it("runs npm-cli.js with node.exe so Windows does not spawn npm.cmd", () => {
    const npm = npmViaNodeInvocation("npm", "D:\\nodejs", "win32");
    const npx = npmViaNodeInvocation("npx", "D:\\nodejs", "win32");
    assert.equal(npm.command, path.win32.join("D:\\nodejs", "node.exe"));
    assert.deepEqual(npm.prefix, [path.win32.join("D:\\nodejs", "node_modules", "npm", "bin", "npm-cli.js")]);
    assert.equal(npx.command, path.win32.join("D:\\nodejs", "node.exe"));
    assert.match(npx.prefix[0] ?? "", /npx-cli\.js$/);
  });
});

describe("findNpmInvocation", () => {
  it("prefers node.exe + npm-cli.js when that pair exists", () => {
    const home = "D:\\nodejs";
    const exists = (candidate: string) =>
      candidate === path.win32.join(home, "node.exe") ||
      candidate === path.join(home, "node_modules", "npm", "bin", "npm-cli.js") ||
      candidate === path.win32.join(home, "node_modules", "npm", "bin", "npm-cli.js");
    const invocation = resolveNpmInvocationForHome("npm", home, "win32", exists);
    assert.ok(invocation);
    assert.equal(invocation?.shell, false);
    assert.match(invocation?.command ?? "", /node\.exe$/);
    assert.match(invocation?.prefix[0] ?? "", /npm-cli\.js$/);
  });

  it("falls back to npm.cmd with a shell on Windows", () => {
    const home = "D:\\nodejs";
    const exists = (candidate: string) => candidate === path.win32.join(home, "npm.cmd");
    const invocation = resolveNpmInvocationForHome("npm", home, "win32", exists);
    assert.deepEqual(invocation, { command: path.win32.join(home, "npm.cmd"), prefix: [], shell: true });
  });
});

describe("larkCliCandidates", () => {
  it("looks in the npm global folder and the helper fallback directory", () => {
    const candidates = larkCliCandidates({
      home: "C:\\Users\\alex",
      env: { APPDATA: "C:\\Users\\alex\\AppData\\Roaming" },
      nodeHome: "C:\\Program Files\\nodejs",
    });
    assert.ok(candidates.some((entry) => /Roaming.npm.lark-cli/i.test(entry)));
    assert.ok(candidates.some((entry) => /@larksuite.cli.bin.lark-cli/i.test(entry)));
    assert.ok(candidates.some((entry) => /\.local.bin.lark-cli/i.test(entry)));
  });
});

describe("walkFind", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onboard-scan-"));

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds Obsidian.exe under a custom folder and skips Windows", () => {
    const hit = path.join(root, "Apps", "Obsidian", "Obsidian.exe");
    const skipped = path.join(root, "Windows", "Obsidian.exe");
    fs.mkdirSync(path.dirname(hit), { recursive: true });
    fs.mkdirSync(path.dirname(skipped), { recursive: true });
    fs.writeFileSync(hit, "");
    fs.writeFileSync(skipped, "");
    const found = walkFind([root], "Obsidian.exe", { maxDepth: 3 });
    assert.deepEqual(found, [hit]);
  });

  it("builds the Claudian plugin path inside a vault", () => {
    assert.equal(
      claudianManifestPath("/data/notes"),
      path.join("/data/notes", ".obsidian", "plugins", "claudian", "manifest.json"),
    );
  });
});
