const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(workspaceRoot, "src", "app.js"), "utf8");
const shareSource = fs.readFileSync(path.join(workspaceRoot, "src", "share.js"), "utf8");

function mustContain(source, snippet, message) {
  assert.ok(source.includes(snippet), message + " | missing: " + snippet);
}

test("share link uses hash payload and has fallback transport", () => {
  mustContain(appSource, "function buildShareUrl(payload, token)", "buildShareUrl helper should exist");
  mustContain(appSource, "#data=", "share url should carry hash encoded payload");
  mustContain(appSource, "&token=", "share url should carry token");

  mustContain(shareSource, "function getSharePayloadFromHash()", "share page should parse payload from hash");
  mustContain(shareSource, "new URLSearchParams(hash)", "share page should parse hash params");
  mustContain(shareSource, "projectFromHash || readSharedProject(token)", "share page should fallback to token storage");
});

test("standalone export includes interactive runtime hooks", () => {
  mustContain(appSource, "function buildStandaloneHtml(payload)", "standalone html builder should exist");
  mustContain(appSource, "preview_started: standalone_runtime", "standalone runtime should emit preview started log");
  mustContain(appSource, "window.addEventListener('keydown'", "standalone runtime should bind keyboard controls");
  mustContain(appSource, "runBtn.addEventListener('click', runPreview)", "standalone runtime should be runnable via button");
  mustContain(appSource, "function tick()", "standalone runtime should define frame loop");
  mustContain(appSource, "function spawnCoinRandomly()", "standalone runtime should support ECA coin spawn action");
});

test("auto recovery and compatibility fallback helpers exist", () => {
  mustContain(appSource, "function cloneData(value)", "structuredClone fallback helper should exist");
  mustContain(appSource, "function readStorage(key)", "safe storage reader should exist");
  mustContain(appSource, "function writeStorage(key, value)", "safe storage writer should exist");
  mustContain(appSource, "function tryAutoRecover()", "auto recover flow should exist");
  mustContain(appSource, "tryAutoRecover();", "auto recover should run on app boot");
});
