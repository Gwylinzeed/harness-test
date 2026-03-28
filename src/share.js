const SHARE_KEY_PREFIX = "retroforge:share:";
const TILE = 32;
const tileColors = {
  0: "#0b1021",
  1: "#4cc95f",
  2: "#cf8f4d",
  3: "#f9e26b",
  4: "#dc5f5f",
};

const dom = {
  shareTitle: document.getElementById("shareTitle"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareMeta: document.getElementById("shareMeta"),
  shareRules: document.getElementById("shareRules"),
  shareComments: document.getElementById("shareComments"),
};

const ctx = dom.shareCanvas.getContext("2d");

function getShareToken() {
  const url = new URL(window.location.href);
  return url.searchParams.get("share") || "";
}

function getSharePayloadFromHash() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const rawData = params.get("data");
  if (!rawData) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(rawData));
  } catch {
    return null;
  }
}

function readSharedProject(token) {
  if (!token) {
    return null;
  }

  let raw = null;
  try {
    raw = localStorage.getItem(`${SHARE_KEY_PREFIX}${token}`);
  } catch {
    raw = null;
  }
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getCombinedTile(project, x, y) {
  const decor = project.decorMap?.[y]?.[x] ?? 0;
  return decor !== 0 ? decor : (project.map?.[y]?.[x] ?? 0);
}

function renderMap(project) {
  for (let y = 0; y < project.map.length; y += 1) {
    for (let x = 0; x < project.map[y].length; x += 1) {
      ctx.fillStyle = tileColors[getCombinedTile(project, x, y)];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.strokeStyle = "rgba(86, 109, 176, 0.3)";
      ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      if (project.collisionMap?.[y]?.[x]) {
        ctx.fillStyle = "rgba(220,95,95,0.25)";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

function renderProject(project) {
  dom.shareTitle.textContent = `${project.name} (${project.template})`;
  dom.shareMeta.textContent = [
    `共享时间: ${project.sharedAt}`,
    `对象配置: ${JSON.stringify(project.objectConfig, null, 2)}`,
  ].join("\n");

  if (project.logicRules?.length) {
    dom.shareRules.textContent = project.logicRules
      .map((rule, idx) => `[${idx + 1}] when ${rule.event}:${rule.key} -> ${rule.action}`)
      .join("\n");
  }

  if (project.comments?.length) {
    dom.shareComments.textContent = project.comments
      .map((comment, idx) => `[${idx + 1}] ${comment.at} ${comment.text}`)
      .join("\n");
  }

  renderMap(project);
}

function renderMissing() {
  dom.shareTitle.textContent = "分享不存在或已失效";
  dom.shareMeta.textContent = "[share] 未找到对应分享数据";
  dom.shareRules.textContent = "[rule] 无数据";
  dom.shareComments.textContent = "[comment] 无数据";
  ctx.fillStyle = "#0b1021";
  ctx.fillRect(0, 0, dom.shareCanvas.width, dom.shareCanvas.height);
}

const token = getShareToken();
const projectFromHash = getSharePayloadFromHash();
const project = projectFromHash || readSharedProject(token);
if (project) {
  renderProject(project);
} else {
  renderMissing();
}