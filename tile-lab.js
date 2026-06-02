import { gridSettings, floorTileSettings, playerBaseStats } from "./Config/Config.js";
import {
    floorProceduralProfiles,
    defaultFloorProceduralProfileId,
    registerLabProceduralProfile,
} from "./Config/floorProceduralConfig.js";
import { clearFlatWallFaceCache } from "./Render/3D/WallFaceTexture.js";
import {
    bakeFloorTileTextureCanvas,
    paintPixelArea,
    paintWallFace,
} from "./Render/Floor/FloorTilePainter.js";
import {
    bakePixelsForWorldSpan,
    getTexturePixelsPerWorldUnit,
} from "./Render/Floor/floorTextureResolution.js";
import {
    renderGamePreview,
    prepareGameCanvas,
    initMapPreviewNavigation,
    focusCameraOnPlayer,
    labCamera,
    invalidateMapPreviewBakes,
    requestNavMapRender,
    requestQualityMapRender,
} from "./tile-lab-game-preview.js";
import { getGameLabDefaults, computeCombatZoom } from "./tile-lab-settings.js";
import {
    createLabMapWorld,
    focusLabNode,
    listLabMapNodes,
} from "./tile-lab-map-world.js";
import {
    initProfileEditor,
    getActiveLabProfiles,
    LAB_PROFILE_A,
} from "./tile-lab-profile-editor.js";

const PROFILE_IDS = Object.keys(floorProceduralProfiles)
    .filter((id) => !id.startsWith("__lab"))
    .sort();

const LAB_PROFILE_MAIN = LAB_PROFILE_A;
const MICRO_PREVIEW_MAX = 112;
const REPEAT_PREVIEW_MAX = 180;

/** @type {import("./GameState/GameState.js").GameState | null} */
let labWorld = null;
let labWorldMapSeed = null;

function registerEditorProfiles() {
    const { profileA } = getActiveLabProfiles();
    registerLabProceduralProfile(LAB_PROFILE_A, profileA);
}

function invalidateLabCaches() {
    clearFlatWallFaceCache();
    invalidateMapPreviewBakes();
}

function syncGameCanvasSize() {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("gamePreview");
    const size = prepareGameCanvas(canvas, stage);
    if (!size) {
        return null;
    }
    if (size.changed) {
        invalidateMapPreviewBakes();
    }
    return size;
}

function populateNodeSelect(state) {
    const select = document.getElementById("mapNodeSelect");
    if (!select || !state) {
        return;
    }
    const prev = Number(select.value) || 0;
    select.innerHTML = "";
    for (const node of listLabMapNodes(state)) {
        const opt = document.createElement("option");
        opt.value = String(node.id);
        opt.textContent = `${node.id}·L${node.layer}`;
        select.appendChild(opt);
    }
    select.value = state.getMapNode(prev) ? String(prev) : "0";
}

function ensureLabWorld(ctrl, forceRegen = false) {
    const mapSeed = Number(document.getElementById("mapSeedInput")?.value) || 1;
    if (!labWorld || forceRegen || labWorldMapSeed !== mapSeed) {
        labWorld = createLabMapWorld({
            mapSeed,
            floorTileSeed: ctrl.seed,
        });
        labWorldMapSeed = mapSeed;
        populateNodeSelect(labWorld);
    } else if (labWorld.floorTileSeed !== ctrl.seed) {
        labWorld.floorTileSeed = ctrl.seed;
        labWorld.floorTiles.clear();
        invalidateMapPreviewBakes();
    }

    const nodeId = Number(document.getElementById("mapNodeSelect")?.value) || 0;
    if (labWorld.currentNodeId !== nodeId || forceRegen) {
        const pos = focusLabNode(labWorld, nodeId);
        labCamera.x = pos.x;
        labCamera.y = pos.y;
    }

    return labWorld;
}

function makeStubGrid(cellSize) {
    return {
        cellSize,
        minX: 0,
        minY: 0,
        cols: 1,
        rows: 1,
        grid: new Uint8Array(1),
    };
}

function toCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    return canvas;
}

function bakeWallCellCanvas(worldX, worldY, storyRow, cellSize, seed, profileId) {
    const stub = makeStubGrid(cellSize);
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, stub, seed, {
        isWall: true,
        zOffset: storyRow * cellSize,
    }, profileId);
    return canvas;
}

function bakeWallColumnCanvas(worldX, worldY, cellSize, storyCount, seed, profileId) {
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize * storyCount);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let s = 0; s < storyCount; s++) {
        const row = bakeWallCellCanvas(worldX, worldY, s, cellSize, seed, profileId);
        ctx.drawImage(row, 0, s * bakeSize);
    }
    return canvas;
}

function bakeWallFacePreviewCanvas(cellSize, storyCount, seed, profileId) {
    const stub = makeStubGrid(cellSize);
    const ppwu = getTexturePixelsPerWorldUnit();
    const width = bakePixelsForWorldSpan(cellSize);
    const height = bakePixelsForWorldSpan(cellSize * storyCount);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintWallFace(ctx, width, height, { x: 0, y: 0 }, { x: cellSize, y: 0 }, ppwu, stub, seed, profileId);
    return canvas;
}

function drawTiled(ctx, source, destX, destY, tileW, tileH, cols, rows, zoom) {
    const w = tileW * zoom;
    const h = tileH * zoom;
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            ctx.drawImage(source, destX + col * w, destY + row * h, w, h);
        }
    }
}

function drawZoomedPreview(canvasEl, source, zoom, maxPx = MICRO_PREVIEW_MAX) {
    const z = Math.max(1, Math.floor(zoom));
    let w = source.width * z;
    let h = source.height * z;
    const maxDim = Math.max(w, h);
    if (maxDim > maxPx) {
        const s = maxPx / maxDim;
        w = Math.max(1, Math.floor(w * s));
        h = Math.max(1, Math.floor(h * s));
    }
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
}

function drawRepeatPreview(canvasEl, source, tileW, tileH, cols, rows, zoom, maxPx = REPEAT_PREVIEW_MAX) {
    const z = Math.max(1, Math.floor(zoom));
    let w = tileW * z * cols;
    let h = tileH * z * rows;
    const maxDim = Math.max(w, h);
    if (maxDim > maxPx) {
        const s = maxPx / maxDim;
        w = Math.max(1, Math.floor(w * s));
        h = Math.max(1, Math.floor(h * s));
        const z2 = w / (tileW * cols);
        canvasEl.width = w;
        canvasEl.height = h;
        const ctx = canvasEl.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        drawTiled(ctx, source, 0, 0, tileW, tileH, cols, rows, z2);
        return;
    }
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    drawTiled(ctx, source, 0, 0, tileW, tileH, cols, rows, z);
}

function downloadCanvas(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function readControls() {
    const cellSize = gridSettings.cellSize;
    return {
        profileId: LAB_PROFILE_MAIN,
        seed: Number(document.getElementById("seedInput").value) || 0,
        worldX: Number(document.getElementById("worldXInput").value) || 0,
        worldY: Number(document.getElementById("worldYInput").value) || 0,
        cellSize,
        zoom: Number(document.getElementById("zoomInput").value) || 6,
        storyRow: Number(document.getElementById("storyRowInput").value) || 0,
        storyCount: floorTileSettings.wallTextureStories,
        gameZoom: Number(document.getElementById("gameZoomInput").value) || 1,
        weaponRange: labWorld?.player?.weapon?.range ?? playerBaseStats.range,
        showRangeRing: document.getElementById("showRangeRingInput").checked,
    };
}

function syncCombatZoomToStage(world) {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const zoom = computeCombatZoom(viewW, viewH, world?.player?.weapon?.range ?? playerBaseStats.range);
    const zoomEl = document.getElementById("gameZoomInput");
    if (zoomEl) {
        zoomEl.value = String(zoom.toFixed(2));
        document.getElementById("gameZoomValue").textContent = zoomEl.value;
    }
}

function applyGameDefaultsToForm(world) {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const defaults = getGameLabDefaults(viewW, viewH, world);

    const cellEl = document.getElementById("cellSizeInput");
    if (cellEl) {
        cellEl.value = String(defaults.cellSize);
    }
    const storiesEl = document.getElementById("storyCountInput");
    if (storiesEl) {
        storiesEl.value = String(defaults.storyCount);
    }
    const worldXEl = document.getElementById("worldXInput");
    const worldYEl = document.getElementById("worldYInput");
    if (worldXEl) {
        worldXEl.step = String(defaults.cellSize);
    }
    if (worldYEl) {
        worldYEl.step = String(defaults.cellSize);
    }

    const rangeMeta = document.getElementById("rangeMeta");
    if (rangeMeta) {
        rangeMeta.textContent = `range ${defaults.weaponRange}`;
    }
}

function bakeFloorCellAt(worldX, worldY, cellSize, seed, profileId) {
    const stub = makeStubGrid(cellSize);
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, stub, seed, {}, profileId);
    return canvas;
}

function renderMapPreview(ctrl, world, { fastNav = false } = {}) {
    const size = syncGameCanvasSize();
    if (!size) {
        return;
    }
    renderGamePreview(document.getElementById("gamePreview"), {
        worldState: world,
        profileId: LAB_PROFILE_A,
        gameZoom: ctrl.gameZoom,
        showRangeRing: ctrl.showRangeRing,
        weaponRange: ctrl.weaponRange,
        viewWidth: size.width,
        viewHeight: size.height,
        fastNav,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta && world) {
        const node = world.getCurrentMapNode();
        const mode = fastNav ? "move" : "full";
        gameMeta.textContent =
            `node ${world.currentNodeId} ${node?.strategy ?? ""} · map ${labWorldMapSeed} · ` +
            `player ${Math.round(world.player.x)},${Math.round(world.player.y)} · ` +
            `zoom ${ctrl.gameZoom.toFixed(2)} · range ${ctrl.weaponRange} · ${mode} · WASD`;
    }
}

function runMapPreviewPass({ fastNav = false } = {}) {
    registerEditorProfiles();
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world, { fastNav });
    }
}

function renderAll() {
    registerEditorProfiles();
    invalidateLabCaches();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    const floorSource = bakeFloorTileTextureCanvas(ctrl.seed, ctrl.cellSize, ctrl.profileId);
    const floorAtOffset = bakeFloorCellAt(ctrl.worldX, ctrl.worldY, ctrl.cellSize, ctrl.seed, ctrl.profileId);
    const wallCellSource = bakeWallCellCanvas(ctrl.worldX, ctrl.worldY, ctrl.storyRow, ctrl.cellSize, ctrl.seed, ctrl.profileId);
    const wallColumnSource = bakeWallColumnCanvas(ctrl.worldX, ctrl.worldY, ctrl.cellSize, ctrl.storyCount, ctrl.seed, ctrl.profileId);
    const wallFaceSource = bakeWallFacePreviewCanvas(ctrl.cellSize, ctrl.storyCount, ctrl.seed, ctrl.profileId);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallColumnSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallFaceSource, ctrl.zoom);

    drawRepeatPreview(
        document.getElementById("floorRepeat"),
        floorAtOffset,
        floorSource.width,
        floorSource.height,
        5,
        5,
        ctrl.zoom
    );

    const wallRepeat = document.getElementById("wallRepeat");
    const tileZ = Math.max(1, Math.floor(ctrl.zoom));
    let wrW = wallCellSource.width * tileZ * 5;
    let wrH = wallCellSource.height * tileZ * 5;
    const wrMax = REPEAT_PREVIEW_MAX;
    let wrScale = 1;
    if (Math.max(wrW, wrH) > wrMax) {
        wrScale = wrMax / Math.max(wrW, wrH);
        wrW = Math.floor(wrW * wrScale);
        wrH = Math.floor(wrH * wrScale);
    }
    wallRepeat.width = wrW;
    wallRepeat.height = wrH;
    const wrCtx = wallRepeat.getContext("2d");
    wrCtx.clearRect(0, 0, wrW, wrH);
    const z = tileZ * wrScale;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = bakeWallCellCanvas(
                ctrl.worldX + col * ctrl.cellSize,
                ctrl.worldY + row * ctrl.cellSize,
                ctrl.storyRow,
                ctrl.cellSize,
                ctrl.seed,
                ctrl.profileId
            );
            wrCtx.drawImage(
                cell,
                col * wallCellSource.width * z,
                row * wallCellSource.height * z,
                wallCellSource.width * z,
                wallCellSource.height * z
            );
        }
    }

    renderMapPreview(ctrl, world);

    window.__tileLabSources = {
        floor: floorSource,
        wallCell: wallCellSource,
        wallColumn: wallColumnSource,
        wallFace: wallFaceSource,
        profileId: ctrl.profileId,
        seed: ctrl.seed,
    };
}

function exportActive() {
    const pick = document.getElementById("exportTarget").value;
    const src = window.__tileLabSources?.[pick];
    if (!src) {
        return;
    }
    const { profileId, seed } = window.__tileLabSources;
    downloadCanvas(toCanvas(src), `tile-${pick}-${profileId}-seed${seed}.png`);
}

function initPresetSelect() {
    const select = document.getElementById("presetSelect");
    for (const id of PROFILE_IDS) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = defaultFloorProceduralProfileId;
}

function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");
    for (const btn of buttons) {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("active"));
            panels.forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
        });
    }
}

function bindControls() {
    const rerender = () => renderAll();
    const ids = [
        "seedInput",
        "worldXInput",
        "worldYInput",
        "zoomInput",
        "storyRowInput",
        "gameZoomInput",
        "mapSeedInput",
        "mapNodeSelect",
        "showRangeRingInput",
    ];
    for (const id of ids) {
        document.getElementById(id)?.addEventListener("input", rerender);
        document.getElementById(id)?.addEventListener("change", rerender);
    }
    document.getElementById("gameZoomValue").textContent = document.getElementById("gameZoomInput").value;
    document.getElementById("gameZoomInput").addEventListener("input", (e) => {
        document.getElementById("gameZoomValue").textContent = e.target.value;
        renderAll();
    });
    document.getElementById("zoomValue").textContent = document.getElementById("zoomInput").value;
    document.getElementById("zoomInput").addEventListener("input", (e) => {
        document.getElementById("zoomValue").textContent = e.target.value;
        renderAll();
    });
    document.getElementById("regenerateBtn").addEventListener("click", rerender);
    document.getElementById("exportBtn").addEventListener("click", exportActive);
    document.getElementById("randomSeedBtn").addEventListener("click", () => {
        document.getElementById("seedInput").value = String(Math.floor(Math.random() * 1_000_000));
        renderAll();
    });
    document.getElementById("regenMapBtn").addEventListener("click", () => {
        labWorld = null;
        renderAll();
    });
    document.getElementById("mapNodeSelect")?.addEventListener("change", () => {
        if (labWorld) {
            const pos = focusLabNode(labWorld, Number(document.getElementById("mapNodeSelect").value) || 0);
            labCamera.x = pos.x;
            labCamera.y = pos.y;
            renderAll();
        }
    });

    const stage = document.getElementById("mapStage");
    if (stage && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
            applyGameDefaultsToForm(labWorld);
            syncCombatZoomToStage(labWorld);
            requestQualityMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
        });
        ro.observe(stage);
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            renderAll();
            syncCombatZoomToStage(labWorld);
        });
    });
}

function onMapNavChange(reason) {
    if (reason === "idle-quality" || reason === "zoom") {
        requestQualityMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
        return;
    }
    requestNavMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
}

initPresetSelect();
initTabs();
initProfileEditor({ onChange: renderAll });
initMapPreviewNavigation(() => ({ ...readControls(), worldState: labWorld }), onMapNavChange);
bindControls();
document.getElementById("mapSeedInput").value = "42";
document.getElementById("cellSizeInput").value = String(gridSettings.cellSize);
document.getElementById("storyCountInput").value = String(floorTileSettings.wallTextureStories ?? 8);
document.getElementById("seedInput").value = "42";
const gameZoomEl = document.getElementById("gameZoomInput");
if (gameZoomEl) {
    const z = computeCombatZoom(800, 600, playerBaseStats.range);
    gameZoomEl.value = String(z.toFixed(2));
    document.getElementById("gameZoomValue").textContent = gameZoomEl.value;
}
