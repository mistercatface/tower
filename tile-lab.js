import { gridSettings, floorTileSettings } from "./Config/Config.js";
import {
    floorProceduralProfiles,
    defaultFloorProceduralProfileId,
} from "./Config/floorProceduralConfig.js";
import {
    bakeFloorTileTextureCanvas,
    paintPixelArea,
    paintWallFace,
} from "./Render/Floor/FloorTilePainter.js";
import {
    bakePixelsForWorldSpan,
    getTexturePixelsPerWorldUnit,
} from "./Render/Floor/floorTextureResolution.js";
import { renderGamePreview } from "./tile-lab-game-preview.js";

const PROFILE_IDS = Object.keys(floorProceduralProfiles).sort();

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

function drawZoomedPreview(canvasEl, source, zoom, label) {
    const z = Math.max(1, Math.floor(zoom));
    canvasEl.width = source.width * z;
    canvasEl.height = source.height * z;
    const ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(source, 0, 0, canvasEl.width, canvasEl.height);
    canvasEl.dataset.label = label;
    canvasEl.dataset.bakeW = String(source.width);
    canvasEl.dataset.bakeH = String(source.height);
}

function downloadCanvas(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function readControls() {
    const profileId = document.getElementById("profileSelect").value;
    const seed = Number(document.getElementById("seedInput").value) || 0;
    const worldX = Number(document.getElementById("worldXInput").value) || 0;
    const worldY = Number(document.getElementById("worldYInput").value) || 0;
    const cellSize = Number(document.getElementById("cellSizeInput").value) || gridSettings.cellSize;
    const zoom = Number(document.getElementById("zoomInput").value) || 8;
    const storyRow = Number(document.getElementById("storyRowInput").value) || 0;
    const storyCount = Number(document.getElementById("storyCountInput").value) || floorTileSettings.wallTextureStories;
    const gameZoom = Number(document.getElementById("gameZoomInput").value) || 1;
    const roomCells = Number(document.getElementById("roomCellsInput").value) || 10;
    const weaponRange = Number(document.getElementById("weaponRangeInput").value) || 150;
    const showRangeRing = document.getElementById("showRangeRingInput").checked;
    return {
        profileId,
        seed,
        worldX,
        worldY,
        cellSize,
        zoom,
        storyRow,
        storyCount,
        gameZoom,
        roomCells,
        weaponRange,
        showRangeRing,
    };
}

function updateMeta({ profileId, seed, cellSize, storyCount }) {
    const ppwu = getTexturePixelsPerWorldUnit();
    const bakePx = bakePixelsForWorldSpan(cellSize);
    const el = document.getElementById("metaLine");
    el.textContent =
        `Profile: ${profileId} · seed ${seed} · cell ${cellSize}px · bake ${bakePx}×${bakePx}px · ppwu ${ppwu} · wall stories ${storyCount}`;
}

function renderAll() {
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
        roomCells,
        weaponRange,
        showRangeRing,
    } = ctrl;

    const floorSource = bakeFloorTileTextureCanvas(seed, cellSize, profileId);
    const floorAtOffset = bakeFloorCellAt(worldX, worldY, cellSize, seed, profileId);
    const wallCellSource = bakeWallCellCanvas(worldX, worldY, storyRow, cellSize, seed, profileId);
    const wallColumnSource = bakeWallColumnCanvas(worldX, worldY, cellSize, storyCount, seed, profileId);
    const wallFaceSource = bakeWallFacePreviewCanvas(cellSize, storyCount, seed, profileId);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, zoom, "floor");
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, zoom, "wallCell");
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallColumnSource, zoom, "wallColumn");
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallFaceSource, zoom, "wallFace");

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

    const gameCanvas = document.getElementById("gamePreview");
    const gameStats = renderGamePreview(gameCanvas, {
        profileId,
        seed,
        worldX,
        worldY,
        cellSize,
        gameZoom,
        showRangeRing,
        roomCells,
        weaponRange,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta) {
        gameMeta.textContent =
            `Combat preview · camera zoom ${gameStats.zoom.toFixed(2)} · room ${roomCells}×${roomCells} cells`;
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

function bakeFloorCellAt(worldX, worldY, cellSize, seed, profileId) {
    const stub = makeStubGrid(cellSize);
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, stub, seed, {}, profileId);
    return canvas;
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

function initProfileSelect() {
    const select = document.getElementById("profileSelect");
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
        "profileSelect",
        "seedInput",
        "worldXInput",
        "worldYInput",
        "cellSizeInput",
        "zoomInput",
        "storyRowInput",
        "storyCountInput",
        "gameZoomInput",
        "roomCellsInput",
        "weaponRangeInput",
        "showRangeRingInput",
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
}

initProfileSelect();
bindControls();
document.getElementById("cellSizeInput").value = String(gridSettings.cellSize);
document.getElementById("storyCountInput").value = String(floorTileSettings.wallTextureStories ?? 8);
document.getElementById("seedInput").value = "42";
renderAll();
