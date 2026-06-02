import { gridSettings, floorTileSettings } from "./Config/Config.js";
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
    initMapPreviewNavigation,
    focusCameraOnPlayer,
    labCamera,
    invalidateMapPreviewBakes,
} from "./tile-lab-game-preview.js";
import {
    createLabMapWorld,
    focusLabNode,
    listLabMapNodes,
} from "./tile-lab-map-world.js";
import {
    initProfileEditor,
    getActiveLabProfiles,
    LAB_PROFILE_A,
    LAB_PROFILE_B,
} from "./tile-lab-profile-editor.js";

const PROFILE_IDS = Object.keys(floorProceduralProfiles)
    .filter((id) => !id.startsWith("__lab"))
    .sort();

const LAB_PROFILE_MAIN = LAB_PROFILE_A;

/** @type {import("./GameState/GameState.js").GameState | null} */
let labWorld = null;
let labWorldMapSeed = null;

function registerEditorProfiles() {
    const { profileA, profileB } = getActiveLabProfiles();
    registerLabProceduralProfile(LAB_PROFILE_A, profileA);
    registerLabProceduralProfile(LAB_PROFILE_B, profileB);
}

function invalidateLabCaches() {
    clearFlatWallFaceCache();
    invalidateMapPreviewBakes();
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
        opt.textContent = `Node ${node.id} · L${node.layer} · ${node.strategy}`;
        select.appendChild(opt);
    }
    if (state.getMapNode(prev)) {
        select.value = String(prev);
    } else {
        select.value = "0";
    }
}

function ensureLabWorld(ctrl, forceRegen = false) {
    const mapSeed = Number(document.getElementById("mapSeedInput")?.value) || 1;
    if (!labWorld || forceRegen || labWorldMapSeed !== mapSeed) {
        labWorld = createLabMapWorld({
            canvasWidth: 900,
            canvasHeight: 700,
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
    const p1 = { x: 0, y: 0 };
    const p2 = { x: cellSize, y: 0 };
    const width = bakePixelsForWorldSpan(cellSize);
    const height = bakePixelsForWorldSpan(cellSize * storyCount);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintWallFace(ctx, width, height, p1, p2, ppwu, stub, seed, profileId);
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

function drawZoomedPreview(canvasEl, source, zoom) {
    const z = Math.max(1, Math.floor(zoom));
    canvasEl.width = source.width * z;
    canvasEl.height = source.height * z;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(source, 0, 0, canvasEl.width, canvasEl.height);
}

function downloadCanvas(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function readControls() {
    const seed = Number(document.getElementById("seedInput").value) || 0;
    const worldX = Number(document.getElementById("worldXInput").value) || 0;
    const worldY = Number(document.getElementById("worldYInput").value) || 0;
    const cellSize = Number(document.getElementById("cellSizeInput").value) || gridSettings.cellSize;
    const zoom = Number(document.getElementById("zoomInput").value) || 8;
    const storyRow = Number(document.getElementById("storyRowInput").value) || 0;
    const storyCount = Number(document.getElementById("storyCountInput").value) || floorTileSettings.wallTextureStories;
    const gameZoom = Number(document.getElementById("gameZoomInput").value) || 1;
    const weaponRange = Number(document.getElementById("weaponRangeInput").value) || 150;
    const mapSeed = Number(document.getElementById("mapSeedInput")?.value) || 1;
    const showRangeRing = document.getElementById("showRangeRingInput").checked;
    const compareB = document.getElementById("compareBInput")?.checked ?? true;
    return {
        profileId: LAB_PROFILE_MAIN,
        seed,
        worldX,
        worldY,
        cellSize,
        zoom,
        storyRow,
        storyCount,
        gameZoom,
        weaponRange,
        showRangeRing,
        compareB,
        mapSeed,
    };
}

function updateMeta({ seed, cellSize, storyCount }) {
    const ppwu = getTexturePixelsPerWorldUnit();
    const bakePx = bakePixelsForWorldSpan(cellSize);
    const el = document.getElementById("metaLine");
    el.textContent =
        `Live editor profile · seed ${seed} · cell ${cellSize}px · bake ${bakePx}×${bakePx}px · ppwu ${ppwu} · wall stories ${storyCount}`;
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

function renderAll() {
    registerEditorProfiles();
    invalidateLabCaches();

    const ctrl = readControls();
    const {
        profileId,
        seed,
        worldX,
        worldY,
        cellSize,
        zoom,
        storyRow,
        storyCount,
        gameZoom,
        weaponRange,
        showRangeRing,
        compareB,
    } = ctrl;

    const world = ensureLabWorld(ctrl);

    const floorSource = bakeFloorTileTextureCanvas(seed, cellSize, profileId);
    const floorAtOffset = bakeFloorCellAt(worldX, worldY, cellSize, seed, profileId);
    const wallCellSource = bakeWallCellCanvas(worldX, worldY, storyRow, cellSize, seed, profileId);
    const wallColumnSource = bakeWallColumnCanvas(worldX, worldY, cellSize, storyCount, seed, profileId);
    const wallFaceSource = bakeWallFacePreviewCanvas(cellSize, storyCount, seed, profileId);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallColumnSource, zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallFaceSource, zoom);

    const floorRepeat = document.getElementById("floorRepeat");
    const tileZ = Math.max(1, Math.floor(zoom));
    const repeatCols = 5;
    const repeatRows = 5;
    floorRepeat.width = floorSource.width * tileZ * repeatCols;
    floorRepeat.height = floorSource.height * tileZ * repeatRows;
    const frCtx = floorRepeat.getContext("2d");
    frCtx.clearRect(0, 0, floorRepeat.width, floorRepeat.height);
    drawTiled(frCtx, floorAtOffset, 0, 0, floorSource.width, floorSource.height, repeatCols, repeatRows, tileZ);

    const wallRepeat = document.getElementById("wallRepeat");
    wallRepeat.width = wallCellSource.width * tileZ * repeatCols;
    wallRepeat.height = wallCellSource.height * tileZ * repeatRows;
    const wrCtx = wallRepeat.getContext("2d");
    wrCtx.clearRect(0, 0, wallRepeat.width, wallRepeat.height);
    for (let row = 0; row < repeatRows; row++) {
        for (let col = 0; col < repeatCols; col++) {
            const wx = worldX + col * cellSize;
            const wy = worldY + row * cellSize;
            const cell = bakeWallCellCanvas(wx, wy, storyRow, cellSize, seed, profileId);
            wrCtx.drawImage(cell, col * wallCellSource.width * tileZ, row * wallCellSource.height * tileZ,
                wallCellSource.width * tileZ, wallCellSource.height * tileZ);
        }
    }

    const previewOpts = {
        worldState: world,
        gameZoom,
        showRangeRing,
        weaponRange,
    };

    renderGamePreview(document.getElementById("gamePreviewA"), {
        ...previewOpts,
        profileId: LAB_PROFILE_A,
    });

    const panelB = document.getElementById("gamePreviewBPanel");
    if (compareB && panelB) {
        panelB.style.display = "";
        renderGamePreview(document.getElementById("gamePreviewB"), {
            ...previewOpts,
            profileId: LAB_PROFILE_B,
        });
    } else if (panelB) {
        panelB.style.display = "none";
    }

    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta) {
        const node = world.getCurrentMapNode();
        gameMeta.textContent =
            `Full map · node ${world.currentNodeId} (${node?.strategy ?? "?"}) · map seed ${labWorldMapSeed} · ` +
            `player ${Math.round(world.player.x)}, ${Math.round(world.player.y)} · zoom ${gameZoom.toFixed(2)} · ` +
            `WASD move · drag move · wheel zoom`;
    }

    updateMeta(ctrl);
    window.__tileLabSources = {
        floor: floorSource,
        wallCell: wallCellSource,
        wallColumn: wallColumnSource,
        wallFace: wallFaceSource,
        profileId,
        seed,
    };
}

function exportActive() {
    const pick = document.getElementById("exportTarget").value;
    const src = window.__tileLabSources?.[pick];
    if (!src) {
        return;
    }
    const { profileId, seed } = window.__tileLabSources;
    const png = toCanvas(src);
    downloadCanvas(png, `tile-${pick}-${profileId}-seed${seed}.png`);
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

function bindControls() {
    const rerender = () => renderAll();
    for (const id of [
        "seedInput",
        "worldXInput",
        "worldYInput",
        "cellSizeInput",
        "zoomInput",
        "storyRowInput",
        "storyCountInput",
        "gameZoomInput",
        "mapSeedInput",
        "mapNodeSelect",
        "weaponRangeInput",
        "showRangeRingInput",
        "compareBInput",
    ]) {
        document.getElementById(id).addEventListener("input", rerender);
        document.getElementById(id).addEventListener("change", rerender);
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
    document.getElementById("regenMapBtn")?.addEventListener("click", () => {
        labWorld = null;
        renderAll();
    });
    document.getElementById("focusPlayerBtn")?.addEventListener("click", () => {
        if (labWorld) {
            focusCameraOnPlayer(labWorld);
            renderAll();
        }
    });
    document.getElementById("mapNodeSelect")?.addEventListener("change", () => {
        if (labWorld) {
            const nodeId = Number(document.getElementById("mapNodeSelect").value) || 0;
            const pos = focusLabNode(labWorld, nodeId);
            labCamera.x = pos.x;
            labCamera.y = pos.y;
            renderAll();
        }
    });
}

let panRenderPending = false;
function schedulePanRender() {
    if (panRenderPending) {
        return;
    }
    panRenderPending = true;
    requestAnimationFrame(() => {
        panRenderPending = false;
        registerEditorProfiles();
        const ctrl = readControls();
        const world = ensureLabWorld(ctrl);
        const previewOpts = {
            worldState: world,
            gameZoom: ctrl.gameZoom,
            showRangeRing: ctrl.showRangeRing,
            weaponRange: ctrl.weaponRange,
        };
        renderGamePreview(document.getElementById("gamePreviewA"), {
            ...previewOpts,
            profileId: LAB_PROFILE_A,
        });
        if (ctrl.compareB) {
            renderGamePreview(document.getElementById("gamePreviewB"), {
                ...previewOpts,
                profileId: LAB_PROFILE_B,
            });
        }
    });
}

initPresetSelect();
initProfileEditor({ onChange: renderAll });
initMapPreviewNavigation(() => ({ ...readControls(), worldState: labWorld }), schedulePanRender);
bindControls();
document.getElementById("mapSeedInput").value = "42";
document.getElementById("cellSizeInput").value = String(gridSettings.cellSize);
document.getElementById("storyCountInput").value = String(floorTileSettings.wallTextureStories ?? 8);
document.getElementById("seedInput").value = "42";
renderAll();
