import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_REPO, compareVersions, currentVersion, REPO_URL } from "./update.ts";
import { expandIds } from "./install.ts";

describe("compareVersions", () => {
  it("orders semver tags", () => {
    assert.equal(compareVersions("1.1.0", "1.0.0"), 1);
    assert.equal(compareVersions("1.0.0", "1.1.0"), -1);
    assert.equal(compareVersions("v1.1.0", "1.1.0"), 0);
  });
});

describe("update metadata", () => {
  it("reads the public repo and package version", () => {
    assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
    assert.equal(APP_REPO.owner, "qinsehm1128");
    assert.equal(REPO_URL, "https://github.com/qinsehm1128/onboard-assistant");
  });
});

describe("expandIds", () => {
  it("installs Python and Node before Claude CLI", () => {
    assert.deepEqual(expandIds(["claude-cli"]), ["python", "node", "claude-cli"]);
  });
});
