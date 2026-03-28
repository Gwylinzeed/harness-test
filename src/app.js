const GRID_COLS = 20;
const GRID_ROWS = 12;
const TILE = 32;
const STORAGE_KEY = "retroforge:last-project";
const SNAPSHOT_KEY_PREFIX = "retroforge:snapshots:";
const SHARE_KEY_PREFIX = "retroforge:share:";
const SCHEMA_VERSION = "1.1.0";
const SUPPORTED_IMPORT_SCHEMAS = new Set(["1.0.0", "1.1.0"]);
const GUIDE_STEPS = [
  "创建项目",
  "放置至少 1 个图块",
  "运行一次预览",
  "添加一条逻辑规则",
  "导出项目",
];

const tileColors = {
  0: "#0b1021",
  1: "#4cc95f",
  2: "#cf8f4d",
  3: "#f9e26b",
  4: "#dc5f5f",
};

const templateMaps = {
  blank: () => buildEmptyMap(),
  platformer: () => {
    const map = buildEmptyMap();
    for (let x = 0; x < GRID_COLS; x += 1) {
      map[GRID_ROWS - 1][x] = 1;
    }
    map[GRID_ROWS - 2][8] = 3;
    map[GRID_ROWS - 2][12] = 3;
    map[GRID_ROWS - 2][15] = 4;
    return map;
  },
  dungeon: () => {
    const map = buildEmptyMap();
    for (let x = 1; x < GRID_COLS - 1; x += 1) {
      map[1][x] = 2;
      map[GRID_ROWS - 2][x] = 2;
    }
    for (let y = 1; y < GRID_ROWS - 1; y += 1) {
      map[y][1] = 2;
      map[y][GRID_COLS - 2] = 2;
    }
    map[5][5] = 3;
    map[7][13] = 4;
    return map;
  },
};

const dom = {
  projectName: document.getElementById("projectName"),
  templateSelect: document.getElementById("templateSelect"),
  createProjectBtn: document.getElementById("createProjectBtn"),
  loadProjectBtn: document.getElementById("loadProjectBtn"),
  importProjectInput: document.getElementById("importProjectInput"),
  importProjectBtn: document.getElementById("importProjectBtn"),
  exportFormat: document.getElementById("exportFormat"),
  exportProjectBtn: document.getElementById("exportProjectBtn"),
  assetInput: document.getElementById("assetInput"),
  assetSearchInput: document.getElementById("assetSearchInput"),
  importAssetsBtn: document.getElementById("importAssetsBtn"),
  assetList: document.getElementById("assetList"),
  snapshotBtn: document.getElementById("snapshotBtn"),
  restoreSnapshotBtn: document.getElementById("restoreSnapshotBtn"),
  snapshotSelect: document.getElementById("snapshotSelect"),
  snapshotList: document.getElementById("snapshotList"),
  startGuideBtn: document.getElementById("startGuideBtn"),
  nextGuideStepBtn: document.getElementById("nextGuideStepBtn"),
  guideList: document.getElementById("guideList"),
  genShareBtn: document.getElementById("genShareBtn"),
  shareLink: document.getElementById("shareLink"),
  commentInput: document.getElementById("commentInput"),
  addCommentBtn: document.getElementById("addCommentBtn"),
  commentList: document.getElementById("commentList"),
  projectMeta: document.getElementById("projectMeta"),
  layerPicker: document.getElementById("layerPicker"),
  tilePicker: document.getElementById("tilePicker"),
  objSpeed: document.getElementById("objSpeed"),
  objHp: document.getElementById("objHp"),
  objAnim: document.getElementById("objAnim"),
  objTrigger: document.getElementById("objTrigger"),
  applyObjectBtn: document.getElementById("applyObjectBtn"),
  toggleCollisionBtn: document.getElementById("toggleCollisionBtn"),
  clearMapBtn: document.getElementById("clearMapBtn"),
  mapCanvas: document.getElementById("mapCanvas"),
  previewCanvas: document.getElementById("previewCanvas"),
  previewBtn: document.getElementById("previewBtn"),
  pausePreviewBtn: document.getElementById("pausePreviewBtn"),
  resetPreviewBtn: document.getElementById("resetPreviewBtn"),
  previewDebug: document.getElementById("previewDebug"),
  ruleEvent: document.getElementById("ruleEvent"),
  ruleKey: document.getElementById("ruleKey"),
  ruleAction: document.getElementById("ruleAction"),
  addRuleBtn: document.getElementById("addRuleBtn"),
  ruleList: document.getElementById("ruleList"),
  eventLog: document.getElementById("eventLog"),
  saveStatus: document.getElementById("saveStatus"),
};

const ctx = dom.mapCanvas.getContext("2d");
const previewCtx = dom.previewCanvas.getContext("2d");

const state = {
  project: null,
  selectedTile: 1,
  previewActive: false,
  previewSession: null,
  pressedKeys: new Set(),
  animationFrameId: 0,
  editor: {
    activeLayer: "base",
    showCollision: true,
  },
};

function buildEmptyMap() {
  return Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => 0));
}

function buildEmptyCollisionMap() {
  return Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLS }, () => 0));
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function normalizeMap(inputMap) {
  if (!Array.isArray(inputMap)) {
    return buildEmptyMap();
  }

  const map = buildEmptyMap();
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      const value = Number(inputMap?.[y]?.[x] ?? 0);
      map[y][x] = Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 0;
    }
  }
  return map;
}

function normalizeCollisionMap(inputMap) {
  if (!Array.isArray(inputMap)) {
    return buildEmptyCollisionMap();
  }

  const map = buildEmptyCollisionMap();
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      map[y][x] = inputMap?.[y]?.[x] ? 1 : 0;
    }
  }
  return map;
}

function normalizeProject(inputProject) {
  const name = typeof inputProject?.name === "string" && inputProject.name.trim()
    ? inputProject.name.trim()
    : "imported-retroforge-project";

  return {
    schemaVersion: inputProject?.schemaVersion || SCHEMA_VERSION,
    name,
    template: inputProject?.template || "blank",
    createdAt: inputProject?.createdAt || nowStamp(),
    savedAt: inputProject?.savedAt || nowStamp(),
    map: normalizeMap(inputProject?.map),
    decorMap: normalizeMap(inputProject?.decorMap),
    collisionMap: normalizeCollisionMap(inputProject?.collisionMap),
    logicRules: Array.isArray(inputProject?.logicRules) ? inputProject.logicRules : [],
    assets: Array.isArray(inputProject?.assets) ? inputProject.assets : [],
    objectConfig: {
      speed: Number(inputProject?.objectConfig?.speed) || 8,
      hp: Number(inputProject?.objectConfig?.hp) || 100,
      animation: inputProject?.objectConfig?.animation || "idle",
      trigger: inputProject?.objectConfig?.trigger || "onCollect",
    },
    onboarding: {
      startedAt: inputProject?.onboarding?.startedAt || null,
      currentStep: Number(inputProject?.onboarding?.currentStep) || 0,
      completed: Boolean(inputProject?.onboarding?.completed),
    },
    shareToken: inputProject?.shareToken || "",
    shareUrl: inputProject?.shareUrl || "",
    comments: Array.isArray(inputProject?.comments) ? inputProject.comments : [],
  };
}

function validateImportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      reason: "invalid_root",
      message: "导入失败：文件不是有效的项目 JSON 对象",
    };
  }

  const schemaVersion = payload.schemaVersion || "1.0.0";
  if (!SUPPORTED_IMPORT_SCHEMAS.has(schemaVersion)) {
    return {
      ok: false,
      reason: "unsupported_schema",
      message: `导入失败：不支持的 schemaVersion=${schemaVersion}`,
    };
  }

  if (!payload.name || typeof payload.name !== "string") {
    return {
      ok: false,
      reason: "invalid_name",
      message: "导入失败：缺少项目名称 name",
    };
  }

  if (!Array.isArray(payload.map)) {
    return {
      ok: false,
      reason: "invalid_map",
      message: "导入失败：缺少地图数据 map",
    };
  }

  return {
    ok: true,
    reason: "ok",
    message: "导入校验通过",
  };
}

function setSaveStatus(text) {
  dom.saveStatus.textContent = text;
}

function applyProjectState(project, source) {
  state.project = normalizeProject(project);
  dom.projectName.value = state.project.name;
  dom.templateSelect.value = state.project.template;
  state.previewActive = false;
  state.previewSession = null;
  state.pressedKeys.clear();
  dom.pausePreviewBtn.textContent = "暂停预览";
  renderEditorScene();
  drawGrid(previewCtx, buildEmptyMap());
  dom.previewDebug.textContent = "[debug] 预览未启动";
  refreshMeta();
  renderObjectConfig();
  renderRuleList();
  renderAssetList();
  renderSnapshotList();
  renderGuideList();
  renderFeedback();
  scheduleAutosave();
  setSaveStatus(`已加载 ${state.project.name} | schema ${state.project.schemaVersion || SCHEMA_VERSION}`);
  logEvent(`${source}: ${state.project.name}`);
}

function nowStamp() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function drawGrid(targetCtx, map) {
  targetCtx.clearRect(0, 0, GRID_COLS * TILE, GRID_ROWS * TILE);

  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      targetCtx.fillStyle = tileColors[map[y][x]];
      targetCtx.fillRect(x * TILE, y * TILE, TILE, TILE);

      targetCtx.strokeStyle = "rgba(86, 109, 176, 0.3)";
      targetCtx.strokeRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
}

function getCombinedTile(project, x, y) {
  const decorTile = project.decorMap?.[y]?.[x] ?? 0;
  if (decorTile !== 0) {
    return decorTile;
  }
  return project.map?.[y]?.[x] ?? 0;
}

function clearCombinedTile(project, x, y) {
  if ((project.decorMap?.[y]?.[x] ?? 0) !== 0) {
    project.decorMap[y][x] = 0;
    return;
  }
  project.map[y][x] = 0;
}

function renderCompositeMap(targetCtx, project, showCollision) {
  targetCtx.clearRect(0, 0, GRID_COLS * TILE, GRID_ROWS * TILE);

  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      targetCtx.fillStyle = tileColors[getCombinedTile(project, x, y)];
      targetCtx.fillRect(x * TILE, y * TILE, TILE, TILE);
      targetCtx.strokeStyle = "rgba(86, 109, 176, 0.3)";
      targetCtx.strokeRect(x * TILE, y * TILE, TILE, TILE);

      if (showCollision && project.collisionMap?.[y]?.[x]) {
        targetCtx.fillStyle = "rgba(220, 95, 95, 0.35)";
        targetCtx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

function renderEditorScene() {
  if (!state.project) {
    drawGrid(ctx, buildEmptyMap());
    return;
  }

  renderCompositeMap(ctx, state.project, state.editor.showCollision);
}

function isSolidTile(value) {
  return value === 1 || value === 2;
}

function isEnemyTile(value) {
  return value === 4;
}

function isCoinTile(value) {
  return value === 3;
}

function findSpawnPosition(map) {
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (!isSolidTile(getCombinedTile(state.project, x, y)) && !isEnemyTile(getCombinedTile(state.project, x, y)) && !state.project.collisionMap[y][x]) {
        return { x: x * TILE + 8, y: y * TILE + 8 };
      }
    }
  }

  return { x: 8, y: 8 };
}

function renderPreviewScene() {
  if (!state.project || !state.previewSession) {
    drawGrid(previewCtx, buildEmptyMap());
    return;
  }

  renderCompositeMap(previewCtx, state.project, false);

  const player = state.previewSession.player;
  previewCtx.fillStyle = "#5ad1e6";
  previewCtx.fillRect(player.x, player.y, TILE - 16, TILE - 16);

  previewCtx.fillStyle = "#e7eefc";
  previewCtx.font = '14px monospace';
  previewCtx.fillText(`HP ${player.hp}`, 10, GRID_ROWS * TILE + 14);
  previewCtx.fillText(`Coins ${state.previewSession.coins}`, 110, GRID_ROWS * TILE + 14);
  previewCtx.fillText(`Anim ${player.animation}`, 230, GRID_ROWS * TILE + 14);

  dom.previewDebug.textContent = [
    `[debug] running=${state.previewActive}`,
    `pos=(${player.x.toFixed(1)}, ${player.y.toFixed(1)})`,
    `hp=${player.hp}`,
    `coins=${state.previewSession.coins}`,
    `speed=${Math.max(1, Number(state.project.objectConfig?.speed ?? 8))}`,
  ].join("\n");
}

function canMoveTo(nextX, nextY) {
  const points = [
    { x: nextX, y: nextY },
    { x: nextX + TILE - 17, y: nextY },
    { x: nextX, y: nextY + TILE - 17 },
    { x: nextX + TILE - 17, y: nextY + TILE - 17 },
  ];

  return points.every((point) => {
    const gridX = Math.floor(point.x / TILE);
    const gridY = Math.floor(point.y / TILE);
    if (gridX < 0 || gridX >= GRID_COLS || gridY < 0 || gridY >= GRID_ROWS) {
      return false;
    }
    return !state.project.collisionMap[gridY][gridX] && !isSolidTile(getCombinedTile(state.project, gridX, gridY));
  });
}

function consumeCoinsAndEnemies() {
  const player = state.previewSession.player;
  const centerX = Math.floor((player.x + 8) / TILE);
  const centerY = Math.floor((player.y + 8) / TILE);

  if (centerX < 0 || centerX >= GRID_COLS || centerY < 0 || centerY >= GRID_ROWS) {
    return;
  }

  if (isCoinTile(getCombinedTile(state.project, centerX, centerY))) {
    clearCombinedTile(state.project, centerX, centerY);
    state.previewSession.coins += 1;
    logEvent(`coin_collected: total=${state.previewSession.coins}`);
    scheduleAutosave();
  }

  if (isEnemyTile(getCombinedTile(state.project, centerX, centerY))) {
    player.hp = Math.max(0, player.hp - 10);
    logEvent(`enemy_hit: hp=${player.hp}`);
  }
}

function updatePreviewSession() {
  if (!state.previewActive || !state.previewSession || !state.project) {
    return;
  }

  const player = state.previewSession.player;
  const speed = Math.max(1, Number(state.project.objectConfig?.speed ?? 8)) * 0.35;
  let dx = 0;
  let dy = 0;

  if (state.pressedKeys.has("ArrowLeft") || state.pressedKeys.has("KeyA")) {
    dx -= speed;
  }
  if (state.pressedKeys.has("ArrowRight") || state.pressedKeys.has("KeyD")) {
    dx += speed;
  }
  if (state.pressedKeys.has("ArrowUp") || state.pressedKeys.has("KeyW")) {
    dy -= speed;
  }
  if (state.pressedKeys.has("ArrowDown") || state.pressedKeys.has("KeyS")) {
    dy += speed;
  }

  if (dx !== 0 || dy !== 0) {
    player.animation = "run";
  } else {
    player.animation = state.project.objectConfig?.animation ?? "idle";
  }

  const nextX = Math.max(0, Math.min(dx + player.x, GRID_COLS * TILE - (TILE - 16)));
  const nextY = Math.max(0, Math.min(dy + player.y, GRID_ROWS * TILE - (TILE - 16)));

  if (canMoveTo(nextX, player.y)) {
    player.x = nextX;
  }
  if (canMoveTo(player.x, nextY)) {
    player.y = nextY;
  }

  consumeCoinsAndEnemies();
  renderPreviewScene();
  state.animationFrameId = window.requestAnimationFrame(updatePreviewSession);
}

function stopPreview(message) {
  state.previewActive = false;
  if (state.animationFrameId) {
    window.cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
  }
  if (message) {
    logEvent(message);
  }
}

function pauseOrResumePreview() {
  if (!state.previewSession) {
    logEvent("preview_pause: failed, reason=no_preview_session");
    return;
  }

  if (state.previewActive) {
    stopPreview("preview_paused");
    dom.pausePreviewBtn.textContent = "恢复预览";
    return;
  }

  state.previewActive = true;
  dom.pausePreviewBtn.textContent = "暂停预览";
  logEvent("preview_resumed");
  state.animationFrameId = window.requestAnimationFrame(updatePreviewSession);
}

function resetPreview() {
  if (!state.project) {
    logEvent("preview_reset: failed, reason=no_project");
    return;
  }

  stopPreview("preview_reset");
  state.previewSession = null;
  drawGrid(previewCtx, buildEmptyMap());
  dom.previewDebug.textContent = "[debug] 预览已重置";
  dom.pausePreviewBtn.textContent = "暂停预览";
}

function refreshMeta() {
  if (!state.project) {
    dom.projectMeta.textContent = "未创建项目";
    return;
  }

  dom.projectMeta.textContent = [
    `项目: ${state.project.name}`,
    `模板: ${state.project.template}`,
    `创建时间: ${state.project.createdAt}`,
    `最后保存: ${state.project.savedAt ?? "未保存"}`,
    `资源数量: ${state.project.assets?.length ?? 0}`,
    `对象: speed=${state.project.objectConfig?.speed ?? 8}, hp=${state.project.objectConfig?.hp ?? 100}`,
    `图层: ${state.editor.activeLayer}`,
    `引导进度: ${state.project.onboarding?.currentStep ?? 0}/${GUIDE_STEPS.length}`,
    `评论数量: ${state.project.comments?.length ?? 0}`,
  ].join("\n");
}

function renderObjectConfig() {
  const config = state.project?.objectConfig ?? {
    speed: 8,
    hp: 100,
    animation: "idle",
    trigger: "onCollect",
  };

  dom.objSpeed.value = String(config.speed);
  dom.objHp.value = String(config.hp);
  dom.objAnim.value = config.animation;
  dom.objTrigger.value = config.trigger;
}

function getSnapshotStorageKey() {
  if (!state.project?.name) {
    return null;
  }

  return `${SNAPSHOT_KEY_PREFIX}${state.project.name}`;
}

function readSnapshots() {
  const key = getSnapshotStorageKey();
  if (!key) {
    return [];
  }

  const raw = readStorage(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots) {
  const key = getSnapshotStorageKey();
  if (!key) {
    return;
  }

  writeStorage(key, JSON.stringify(snapshots));
}

function writeSharedProject(token, payload) {
  writeStorage(`${SHARE_KEY_PREFIX}${token}`, JSON.stringify(payload));
}

function buildShareUrl(payload, token) {
  const currentUrl = new URL(window.location.href);
  const basePath = currentUrl.pathname.endsWith("/")
    ? currentUrl.pathname
    : currentUrl.pathname.replace(/[^/]*$/, "");
  const sharePageUrl = `${currentUrl.origin}${basePath}share.html`;
  const data = encodeURIComponent(JSON.stringify(payload));
  return `${sharePageUrl}#data=${data}&token=${encodeURIComponent(token)}`;
}

function renderSnapshotList() {
  const snapshots = readSnapshots();
  dom.snapshotSelect.innerHTML = '<option value="">选择快照</option>';

  if (!snapshots.length) {
    dom.snapshotList.textContent = "[snapshot] 暂无快照";
    return;
  }

  snapshots.forEach((snap, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = `${idx + 1}. ${snap.createdAt}`;
    dom.snapshotSelect.appendChild(option);
  });

  const lines = snapshots.map((snap, idx) => (
    `[${idx + 1}] ${snap.createdAt} map=${snap.summary.filledTiles} rules=${snap.summary.rules} assets=${snap.summary.assets}`
  ));
  dom.snapshotList.textContent = lines.join("\n");
}

function renderAssetList() {
  if (!state.project || !state.project.assets || !state.project.assets.length) {
    dom.assetList.textContent = "[asset] 暂无资源";
    return;
  }

  const keyword = dom.assetSearchInput.value.trim().toLowerCase();
  const filteredAssets = state.project.assets.filter((asset) => {
    if (!keyword) {
      return true;
    }
    return asset.name.toLowerCase().includes(keyword) || asset.type.toLowerCase().includes(keyword);
  });

  if (!filteredAssets.length) {
    dom.assetList.textContent = `[asset] 无匹配结果: ${keyword}`;
    return;
  }

  const lines = filteredAssets.map((asset, idx) => (
    `[${idx + 1}] ${asset.name} | ${asset.type} | ${asset.sizeKb} KB | ${asset.addedAt}`
  ));
  dom.assetList.textContent = lines.join("\n");
}

function renderRuleList() {
  if (!state.project || !state.project.logicRules || state.project.logicRules.length === 0) {
    dom.ruleList.textContent = "[rule] 暂无规则";
    return;
  }

  const lines = state.project.logicRules.map((rule, idx) => (
    `[${idx + 1}] when ${rule.event}:${rule.key} -> ${rule.action}`
  ));
  dom.ruleList.textContent = lines.join("\n");
}

function renderGuideList() {
  if (!state.project?.onboarding) {
    dom.guideList.textContent = "[guide] 未开始";
    return;
  }

  const current = state.project.onboarding.currentStep;
  const lines = GUIDE_STEPS.map((step, idx) => {
    if (idx < current) {
      return `[x] ${step}`;
    }
    if (idx === current && !state.project.onboarding.completed) {
      return `[>] ${step}`;
    }
    return `[ ] ${step}`;
  });

  const head = state.project.onboarding.completed
    ? "[guide] 已完成"
    : `[guide] 进行中 ${current}/${GUIDE_STEPS.length}`;

  dom.guideList.textContent = `${head}\n${lines.join("\n")}`;
}

function renderFeedback() {
  if (!state.project) {
    dom.shareLink.textContent = "[share] 尚未生成";
    dom.commentList.textContent = "[comment] 暂无评论";
    return;
  }

  if (state.project.shareUrl) {
    dom.shareLink.textContent = `[share] ${state.project.shareUrl}`;
  } else if (state.project.shareToken) {
    dom.shareLink.textContent = `[share] share.html?share=${state.project.shareToken}`;
  } else {
    dom.shareLink.textContent = "[share] 尚未生成";
  }

  if (!state.project.comments || state.project.comments.length === 0) {
    dom.commentList.textContent = "[comment] 暂无评论";
    return;
  }

  const lines = state.project.comments.map((item, idx) => (
    `[${idx + 1}] ${item.at} ${item.text}`
  ));
  dom.commentList.textContent = lines.join("\n");
}

function saveProject() {
  if (!state.project) {
    return;
  }

  state.project.savedAt = nowStamp();
  writeStorage(STORAGE_KEY, JSON.stringify(state.project));
  dom.saveStatus.textContent = `已保存 ${state.project.savedAt}`;
  refreshMeta();
}

let autosaveTimer = null;
function scheduleAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(() => {
    saveProject();
  }, 2000);
}

function createProject() {
  const name = dom.projectName.value.trim() || "my-retro-game";
  const template = dom.templateSelect.value;
  const mapFactory = templateMaps[template] ?? templateMaps.blank;

  state.project = {
    name,
    template,
    createdAt: nowStamp(),
    savedAt: null,
    map: mapFactory(),
    decorMap: buildEmptyMap(),
    collisionMap: buildEmptyCollisionMap(),
    logicRules: [],
    assets: [],
    objectConfig: {
      speed: 8,
      hp: 100,
      animation: "idle",
      trigger: "onCollect",
    },
    onboarding: {
      startedAt: null,
      currentStep: 0,
      completed: false,
    },
    shareToken: "",
    comments: [],
  };

  renderEditorScene();
  refreshMeta();
  renderObjectConfig();
  renderRuleList();
  renderAssetList();
  renderSnapshotList();
  renderGuideList();
  renderFeedback();
  logEvent(`project_created: ${name}, template=${template}`);
  scheduleAutosave();
}

function loadLastProject() {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) {
    logEvent("autosave_recovered: no_saved_project");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    applyProjectState(parsed, "autosave_recovered");
    setSaveStatus(`已加载 ${state.project.savedAt ?? state.project.createdAt}`);
  } catch (error) {
    logEvent(`autosave_recovered_error: ${String(error)}`);
    setSaveStatus("自动恢复失败");
  }
}

function importProjectFromFile() {
  const file = dom.importProjectInput.files?.[0];
  if (!file) {
    logEvent("project_import: failed, reason=no_file");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const validation = validateImportPayload(parsed);
      if (!validation.ok) {
        logEvent(`project_import: failed, reason=${validation.reason}`);
        setSaveStatus(validation.message);
        return;
      }

      applyProjectState(parsed, "project_imported");
      dom.importProjectInput.value = "";
      setSaveStatus(`导入成功 ${state.project.name}`);
    } catch (error) {
      logEvent(`project_import: failed, reason=parse_error, detail=${String(error)}`);
      setSaveStatus("导入失败：JSON 解析错误");
    }
  };
  reader.onerror = () => {
    logEvent("project_import: failed, reason=read_error");
    setSaveStatus("导入失败：文件读取错误");
  };
  reader.readAsText(file);
}

function importAssets() {
  if (!state.project) {
    logEvent("asset_import: failed, reason=no_project");
    return;
  }

  const files = Array.from(dom.assetInput.files ?? []);
  if (!files.length) {
    logEvent("asset_import: failed, reason=no_files");
    return;
  }

  const imported = files.map((file) => ({
    name: file.name,
    type: file.type || "unknown",
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    addedAt: nowStamp(),
  }));

  state.project.assets.push(...imported);
  renderAssetList();
  refreshMeta();
  scheduleAutosave();
  dom.assetInput.value = "";
  logEvent(`asset_import: count=${imported.length}`);
}

function applyObjectConfig() {
  if (!state.project) {
    logEvent("object_config: failed, reason=no_project");
    return;
  }

  state.project.objectConfig = {
    speed: Number(dom.objSpeed.value) || 8,
    hp: Number(dom.objHp.value) || 100,
    animation: dom.objAnim.value || "idle",
    trigger: dom.objTrigger.value.trim() || "onCollect",
  };

  refreshMeta();
  scheduleAutosave();
  logEvent(
    `object_config: speed=${state.project.objectConfig.speed}, hp=${state.project.objectConfig.hp}, anim=${state.project.objectConfig.animation}`
  );
}

function startGuide() {
  if (!state.project) {
    logEvent("onboarding_started: failed, reason=no_project");
    return;
  }

  state.project.onboarding.startedAt = nowStamp();
  state.project.onboarding.currentStep = 0;
  state.project.onboarding.completed = false;
  renderGuideList();
  refreshMeta();
  scheduleAutosave();
  logEvent("onboarding_started");
}

function nextGuideStep() {
  if (!state.project) {
    logEvent("onboarding_progress: failed, reason=no_project");
    return;
  }

  if (state.project.onboarding.completed) {
    logEvent("onboarding_progress: already_completed");
    return;
  }

  state.project.onboarding.currentStep += 1;
  if (state.project.onboarding.currentStep >= GUIDE_STEPS.length) {
    state.project.onboarding.currentStep = GUIDE_STEPS.length;
    state.project.onboarding.completed = true;
    logEvent("onboarding_finished");
  } else {
    logEvent(`onboarding_progress: ${state.project.onboarding.currentStep}/${GUIDE_STEPS.length}`);
  }

  renderGuideList();
  refreshMeta();
  scheduleAutosave();
}

function generateShareLink() {
  if (!state.project) {
    logEvent("share_link: failed, reason=no_project");
    return;
  }

  state.project.shareToken = Math.random().toString(36).slice(2, 10);
  const payload = buildSharePayload();
  state.project.shareUrl = buildShareUrl(payload, state.project.shareToken);
  writeSharedProject(state.project.shareToken, payload);
  renderFeedback();
  scheduleAutosave();
  logEvent(`share_link: generated=${state.project.shareToken}, transport=hash+token`);
}

function addComment() {
  if (!state.project) {
    logEvent("comment_add: failed, reason=no_project");
    return;
  }

  const text = dom.commentInput.value.trim();
  if (!text) {
    logEvent("comment_add: failed, reason=empty");
    return;
  }

  state.project.comments.push({
    text,
    at: nowStamp(),
  });
  dom.commentInput.value = "";
  if (state.project.shareToken) {
    const payload = buildSharePayload();
    state.project.shareUrl = buildShareUrl(payload, state.project.shareToken);
    writeSharedProject(state.project.shareToken, payload);
  }
  renderFeedback();
  refreshMeta();
  scheduleAutosave();
  logEvent(`comment_add: total=${state.project.comments.length}`);
}

function createSnapshot() {
  if (!state.project) {
    logEvent("snapshot_created: failed, reason=no_project");
    return;
  }

  let filledTiles = 0;
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (state.project.map[y][x] !== 0) {
        filledTiles += 1;
      }
    }
  }

  const snapshots = readSnapshots();
  const snapshot = {
    createdAt: nowStamp(),
    map: cloneData(state.project.map),
    decorMap: cloneData(state.project.decorMap),
    collisionMap: cloneData(state.project.collisionMap),
    logicRules: cloneData(state.project.logicRules),
    assets: cloneData(state.project.assets),
    objectConfig: cloneData(state.project.objectConfig),
    onboarding: cloneData(state.project.onboarding),
    shareToken: state.project.shareToken,
    shareUrl: state.project.shareUrl,
    comments: cloneData(state.project.comments),
    summary: {
      filledTiles,
      rules: state.project.logicRules.length,
      assets: state.project.assets.length,
      collision: state.project.collisionMap.flat().filter(Boolean).length,
    },
  };

  snapshots.push(snapshot);
  writeSnapshots(snapshots.slice(-20));
  renderSnapshotList();
  logEvent(`snapshot_created: total=${snapshots.length}`);
}

function restoreLatestSnapshot() {
  if (!state.project) {
    logEvent("snapshot_restore: failed, reason=no_project");
    return;
  }

  const snapshots = readSnapshots();
  if (!snapshots.length) {
    logEvent("snapshot_restore: failed, reason=no_snapshot");
    return;
  }

  const selectedIndex = dom.snapshotSelect.value === ""
    ? snapshots.length - 1
    : Number(dom.snapshotSelect.value);
  const selectedSnapshot = snapshots[selectedIndex];
  if (!selectedSnapshot) {
    logEvent("snapshot_restore: failed, reason=invalid_snapshot");
    return;
  }

  state.project.map = cloneData(selectedSnapshot.map);
  state.project.decorMap = cloneData(selectedSnapshot.decorMap ?? buildEmptyMap());
  state.project.collisionMap = cloneData(selectedSnapshot.collisionMap ?? buildEmptyCollisionMap());
  state.project.logicRules = cloneData(selectedSnapshot.logicRules);
  state.project.assets = cloneData(selectedSnapshot.assets);
  state.project.objectConfig = cloneData(selectedSnapshot.objectConfig);
  state.project.onboarding = cloneData(selectedSnapshot.onboarding);
  state.project.shareToken = selectedSnapshot.shareToken;
  state.project.shareUrl = selectedSnapshot.shareUrl || "";
  state.project.comments = cloneData(selectedSnapshot.comments);

  renderEditorScene();
  renderCompositeMap(previewCtx, state.project, false);
  renderObjectConfig();
  renderRuleList();
  renderAssetList();
  renderGuideList();
  renderFeedback();
  refreshMeta();
  scheduleAutosave();
  logEvent(`snapshot_restore: ${selectedSnapshot.createdAt}`);
}

function logEvent(message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const line = `[${time}] ${message}`;
  dom.eventLog.textContent = `${line}\n${dom.eventLog.textContent}`;
}

function updateTile(event) {
  if (!state.project) {
    return;
  }

  const rect = dom.mapCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / (rect.width / GRID_COLS));
  const y = Math.floor((event.clientY - rect.top) / (rect.height / GRID_ROWS));

  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) {
    return;
  }

  if (state.editor.activeLayer === "collision") {
    state.project.collisionMap[y][x] = event.buttons === 2 ? 0 : 1;
  } else if (state.editor.activeLayer === "decor") {
    state.project.decorMap[y][x] = event.buttons === 2 ? 0 : state.selectedTile;
  } else {
    state.project.map[y][x] = event.buttons === 2 ? 0 : state.selectedTile;
  }

  renderEditorScene();
  scheduleAutosave();
}

function clearMap() {
  if (!state.project) {
    return;
  }

  if (state.editor.activeLayer === "collision") {
    state.project.collisionMap = buildEmptyCollisionMap();
  } else if (state.editor.activeLayer === "decor") {
    state.project.decorMap = buildEmptyMap();
  } else {
    state.project.map = buildEmptyMap();
  }

  renderEditorScene();
  logEvent(`tilemap_edited: clear_layer=${state.editor.activeLayer}`);
  scheduleAutosave();
}

function runPreview() {
  if (!state.project) {
    logEvent("preview_started: failed, reason=no_project");
    return;
  }

  const spawn = findSpawnPosition(state.project.map);
  stopPreview();
  state.previewActive = true;
  state.previewSession = {
    player: {
      x: spawn.x,
      y: spawn.y,
      hp: Number(state.project.objectConfig?.hp ?? 100),
      animation: state.project.objectConfig?.animation ?? "idle",
    },
    coins: 0,
  };

  let coins = 0;
  let enemies = 0;
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (state.project.map[y][x] === 3) {
        coins += 1;
      }
      if (state.project.map[y][x] === 4) {
        enemies += 1;
      }
      if (state.project.decorMap[y][x] === 3) {
        coins += 1;
      }
      if (state.project.decorMap[y][x] === 4) {
        enemies += 1;
      }
    }
  }

  logEvent(`preview_started: project=${state.project.name}, coins=${coins}, enemies=${enemies}`);
  renderPreviewScene();
  dom.pausePreviewBtn.textContent = "暂停预览";
  state.animationFrameId = window.requestAnimationFrame(updatePreviewSession);
}

function addRule() {
  if (!state.project) {
    logEvent("logic_flow_published: failed, reason=no_project");
    return;
  }

  const event = dom.ruleEvent.value;
  const key = dom.ruleKey.value.trim() || "Space";
  const action = dom.ruleAction.value;

  state.project.logicRules.push({ event, key, action });
  renderRuleList();
  scheduleAutosave();
  logEvent(`logic_flow_published: event=${event}, key=${key}, action=${action}`);
}

function spawnCoinRandomly() {
  const emptyTiles = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (getCombinedTile(state.project, x, y) === 0 && !state.project.collisionMap[y][x]) {
        emptyTiles.push({ x, y });
      }
    }
  }

  if (emptyTiles.length === 0) {
    return false;
  }

  const selected = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
  state.project.decorMap[selected.y][selected.x] = 3;
  renderEditorScene();
  renderCompositeMap(previewCtx, state.project, false);
  scheduleAutosave();
  return true;
}

function handlePreviewKey(event) {
  state.pressedKeys.add(event.code);

  if (!state.previewActive || !state.project || !state.project.logicRules) {
    return;
  }

  const matchedRules = state.project.logicRules.filter((rule) => (
    rule.event === "key_press" && rule.key.toLowerCase() === event.code.toLowerCase()
  ));

  matchedRules.forEach((rule) => {
    if (rule.action === "log_message") {
      logEvent(`rule_triggered: ${rule.key} -> log_message`);
    }

    if (rule.action === "spawn_coin") {
      const ok = spawnCoinRandomly();
      logEvent(`rule_triggered: ${rule.key} -> spawn_coin, success=${ok}`);
    }
  });
}

function handlePreviewKeyUp(event) {
  state.pressedKeys.delete(event.code);
}

function buildExportPayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: state.project.name,
    template: state.project.template,
    createdAt: state.project.createdAt,
    savedAt: state.project.savedAt,
    map: state.project.map,
    decorMap: state.project.decorMap,
    collisionMap: state.project.collisionMap,
    logicRules: state.project.logicRules,
    assets: state.project.assets,
    objectConfig: state.project.objectConfig,
    onboarding: state.project.onboarding,
    shareToken: state.project.shareToken,
    shareUrl: state.project.shareUrl,
    comments: state.project.comments,
    exportedAt: nowStamp(),
  };
}

function buildSharePayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: state.project.name,
    template: state.project.template,
    map: state.project.map,
    decorMap: state.project.decorMap,
    collisionMap: state.project.collisionMap,
    objectConfig: state.project.objectConfig,
    logicRules: state.project.logicRules,
    comments: state.project.comments,
    sharedAt: nowStamp(),
  };
}

function buildStandaloneHtml(payload) {
  const serialized = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.name} - RetroForge Export</title>
  <style>
    body { margin: 0; background: #0b1021; color: #e7eefc; font-family: monospace; }
    header { padding: 12px 16px; border-bottom: 2px solid #2e3f76; }
    main { display: grid; grid-template-columns: 1fr 320px; gap: 12px; padding: 12px; }
    canvas, pre { width: 100%; border: 2px solid #2e3f76; border-radius: 8px; background: #060a18; }
    pre { margin: 0; padding: 10px; white-space: pre-wrap; color: #a8ffd1; }
    .panel { border: 2px solid #2e3f76; border-radius: 8px; padding: 10px; background: #121a33; }
    button { padding: 8px 12px; background: #ffd166; border: 0; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1 style="margin:0;font-size:18px;">${payload.name}</h1>
    <div>template=${payload.template} exportedAt=${payload.exportedAt}</div>
  </header>
  <main>
    <section class="panel">
      <button id="runBtn">运行预览</button>
      <canvas id="canvas" width="640" height="384"></canvas>
    </section>
    <aside class="panel">
      <div>对象配置</div>
      <pre id="meta"></pre>
      <div style="margin-top:8px;">事件日志</div>
      <pre id="log"></pre>
    </aside>
  </main>
  <script>
    const payload = ${serialized};
    const TILE = 32;
    const colors = {0:'#0b1021',1:'#4cc95f',2:'#cf8f4d',3:'#f9e26b',4:'#dc5f5f'};
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const logEl = document.getElementById('log');
    const metaEl = document.getElementById('meta');
    const runBtn = document.getElementById('runBtn');
    const pressed = new Set();
    let frameId = 0;
    let running = false;
    let coins = 0;

    const player = {
      x: 8,
      y: 8,
      hp: Number(payload.objectConfig?.hp ?? 100),
      animation: payload.objectConfig?.animation ?? 'idle',
    };

    function log(message) {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      logEl.textContent = '[' + time + '] ' + message + '\n' + logEl.textContent;
    }

    function getTile(x, y) {
      const decor = payload.decorMap?.[y]?.[x] ?? 0;
      return decor !== 0 ? decor : (payload.map?.[y]?.[x] ?? 0);
    }

    function isSolid(v) {
      return v === 1 || v === 2;
    }

    function canMove(nextX, nextY) {
      const points = [
        { x: nextX, y: nextY },
        { x: nextX + TILE - 17, y: nextY },
        { x: nextX, y: nextY + TILE - 17 },
        { x: nextX + TILE - 17, y: nextY + TILE - 17 },
      ];

      return points.every((p) => {
        const gx = Math.floor(p.x / TILE);
        const gy = Math.floor(p.y / TILE);
        if (gx < 0 || gy < 0 || gy >= payload.map.length || gx >= payload.map[0].length) {
          return false;
        }
        return !(payload.collisionMap?.[gy]?.[gx]) && !isSolid(getTile(gx, gy));
      });
    }

    function drawWorld() {
      const rows = payload.map.length;
      const cols = payload.map[0].length;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          ctx.fillStyle = colors[getTile(x, y)] ?? colors[0];
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.strokeStyle = 'rgba(86,109,176,0.3)';
          ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
          if (payload.collisionMap?.[y]?.[x]) {
            ctx.fillStyle = 'rgba(220,95,95,0.25)';
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
        }
      }

      ctx.fillStyle = '#5ad1e6';
      ctx.fillRect(player.x, player.y, TILE - 16, TILE - 16);
      metaEl.textContent = JSON.stringify({
        speed: Number(payload.objectConfig?.speed ?? 8),
        hp: player.hp,
        coins,
        animation: player.animation,
      }, null, 2);
    }

    function spawnCoinRandomly() {
      const emptyTiles = [];
      for (let y = 0; y < payload.map.length; y += 1) {
        for (let x = 0; x < payload.map[y].length; x += 1) {
          if (getTile(x, y) === 0 && !(payload.collisionMap?.[y]?.[x])) {
            emptyTiles.push({ x, y });
          }
        }
      }

      if (!emptyTiles.length) {
        return false;
      }

      const selected = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
      payload.decorMap[selected.y][selected.x] = 3;
      return true;
    }

    function consume() {
      const cx = Math.floor((player.x + 8) / TILE);
      const cy = Math.floor((player.y + 8) / TILE);
      if (cx < 0 || cy < 0 || cy >= payload.map.length || cx >= payload.map[0].length) {
        return;
      }

      const tile = getTile(cx, cy);
      if (tile === 3) {
        if ((payload.decorMap?.[cy]?.[cx] ?? 0) !== 0) {
          payload.decorMap[cy][cx] = 0;
        } else {
          payload.map[cy][cx] = 0;
        }
        coins += 1;
        log('coin_collected: total=' + coins);
      }

      if (tile === 4) {
        player.hp = Math.max(0, player.hp - 10);
        log('enemy_hit: hp=' + player.hp);
      }
    }

    function tick() {
      if (!running) {
        return;
      }

      const speed = Math.max(1, Number(payload.objectConfig?.speed ?? 8)) * 0.35;
      let dx = 0;
      let dy = 0;

      if (pressed.has('ArrowLeft') || pressed.has('KeyA')) dx -= speed;
      if (pressed.has('ArrowRight') || pressed.has('KeyD')) dx += speed;
      if (pressed.has('ArrowUp') || pressed.has('KeyW')) dy -= speed;
      if (pressed.has('ArrowDown') || pressed.has('KeyS')) dy += speed;

      player.animation = (dx !== 0 || dy !== 0) ? 'run' : (payload.objectConfig?.animation ?? 'idle');

      const maxX = payload.map[0].length * TILE - (TILE - 16);
      const maxY = payload.map.length * TILE - (TILE - 16);
      const nextX = Math.max(0, Math.min(player.x + dx, maxX));
      const nextY = Math.max(0, Math.min(player.y + dy, maxY));

      if (canMove(nextX, player.y)) player.x = nextX;
      if (canMove(player.x, nextY)) player.y = nextY;

      consume();
      drawWorld();
      frameId = window.requestAnimationFrame(tick);
    }

    window.addEventListener('keydown', (event) => {
      pressed.add(event.code);
      const rules = Array.isArray(payload.logicRules) ? payload.logicRules : [];
      rules
        .filter((rule) => rule.event === 'key_press' && String(rule.key).toLowerCase() === event.code.toLowerCase())
        .forEach((rule) => {
          if (rule.action === 'log_message') {
            log('rule_triggered: ' + rule.key + ' -> log_message');
          }
          if (rule.action === 'spawn_coin') {
            const ok = spawnCoinRandomly();
            log('rule_triggered: ' + rule.key + ' -> spawn_coin, success=' + ok);
          }
        });
    });

    window.addEventListener('keyup', (event) => {
      pressed.delete(event.code);
    });

    function runPreview() {
      if (running) {
        running = false;
        if (frameId) {
          window.cancelAnimationFrame(frameId);
          frameId = 0;
        }
      }
      running = true;
      log('preview_started: standalone_runtime');
      drawWorld();
      tick();
    }

    runBtn.addEventListener('click', runPreview);
    drawWorld();
    log('preview_ready: use WASD or Arrow Keys');
  </script>
</body>
</html>`;
}

function exportProject() {
  if (!state.project) {
    logEvent("export_completed: failed, reason=no_project");
    return;
  }

  const payload = buildExportPayload();
  const format = dom.exportFormat.value;
  const fileNameBase = `${state.project.name || "retroforge-project"}`;
  const output = format === "html"
    ? buildStandaloneHtml(payload)
    : JSON.stringify(payload, null, 2);
  const blob = new Blob([output], { type: format === "html" ? "text/html" : "application/json" });
  const link = document.createElement("a");
  const fileName = `${fileNameBase}.${format === "html" ? "html" : "json"}`;
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);

  logEvent(`export_completed: file=${fileName}, format=${format}`);
}

dom.createProjectBtn.addEventListener("click", createProject);
dom.loadProjectBtn.addEventListener("click", loadLastProject);
dom.importProjectBtn.addEventListener("click", importProjectFromFile);
dom.exportProjectBtn.addEventListener("click", exportProject);
dom.layerPicker.addEventListener("change", (event) => {
  state.editor.activeLayer = event.target.value;
  refreshMeta();
});
dom.toggleCollisionBtn.addEventListener("click", () => {
  state.editor.showCollision = !state.editor.showCollision;
  dom.toggleCollisionBtn.textContent = state.editor.showCollision ? "隐藏碰撞层" : "显示碰撞层";
  renderEditorScene();
});
dom.assetSearchInput.addEventListener("input", renderAssetList);
dom.importAssetsBtn.addEventListener("click", importAssets);
dom.snapshotBtn.addEventListener("click", createSnapshot);
dom.restoreSnapshotBtn.addEventListener("click", restoreLatestSnapshot);
dom.applyObjectBtn.addEventListener("click", applyObjectConfig);
dom.startGuideBtn.addEventListener("click", startGuide);
dom.nextGuideStepBtn.addEventListener("click", nextGuideStep);
dom.genShareBtn.addEventListener("click", generateShareLink);
dom.addCommentBtn.addEventListener("click", addComment);
dom.tilePicker.addEventListener("change", (event) => {
  state.selectedTile = Number(event.target.value);
});
dom.clearMapBtn.addEventListener("click", clearMap);
dom.previewBtn.addEventListener("click", runPreview);
dom.pausePreviewBtn.addEventListener("click", pauseOrResumePreview);
dom.resetPreviewBtn.addEventListener("click", resetPreview);
dom.addRuleBtn.addEventListener("click", addRule);

dom.mapCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
dom.mapCanvas.addEventListener("mousedown", (event) => {
  updateTile(event);
  dom.mapCanvas.addEventListener("mousemove", updateTile);
});
window.addEventListener("mouseup", () => {
  dom.mapCanvas.removeEventListener("mousemove", updateTile);
});
window.addEventListener("keydown", handlePreviewKey);
window.addEventListener("keyup", handlePreviewKeyUp);

function tryAutoRecover() {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    applyProjectState(parsed, "autosave_recovered_auto");
    setSaveStatus(`已自动恢复 ${state.project.savedAt ?? state.project.createdAt}`);
  } catch (error) {
    setSaveStatus("自动恢复失败");
    logEvent(`autosave_recovered_auto_error: ${String(error)}`);
  }
}

// 初始化空画布，方便用户直接上手。
drawGrid(ctx, buildEmptyMap());
drawGrid(previewCtx, buildEmptyMap());
renderObjectConfig();
renderRuleList();
renderAssetList();
renderSnapshotList();
renderGuideList();
renderFeedback();
tryAutoRecover();