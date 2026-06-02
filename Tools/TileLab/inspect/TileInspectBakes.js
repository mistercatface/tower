import {
    bakeFloorTileTextureCanvas,
    paintPixelArea,
    paintWallFace,
} from "../../../Render/Floor/FloorTilePainter.js";
import {
    bakePixelsForWorldSpan,
    getTexturePixelsPerWorldUnit,
} from "../../../Render/Floor/floorTextureResolution.js";

const MICRO_PREVIEW_MAX = 112;
const REPEAT_PREVIEW_MAX = 180;

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

function bakeFloorCellAt(worldX, worldY, cellSize, seed, profileId) {
    const stub = makeStubGrid(cellSize);
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, stub, seed, {}, profileId);
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

/**
 * Bake and draw micro-tile / 5×5 inspect previews.
 * @param {object} ctrl — lab control values (seed, cellSize, profileId, etc.)
 * @returns {{ floor, wallCell, wallColumn, wallFace, profileId, seed }}
 */
export function renderTileInspectPreviews(ctrl) {
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

    return {
        floor: floorSource,
        wallCell: wallCellSource,
        wallColumn: wallColumnSource,
        wallFace: wallFaceSource,
        profileId: ctrl.profileId,
        seed: ctrl.seed,
    };
}

export function downloadInspectExport(sources, pick) {
    const src = sources?.[pick];
    if (!src) {
        return;
    }
    const { profileId, seed } = sources;
    const link = document.createElement("a");
    link.download = `tile-${pick}-${profileId}-seed${seed}.png`;
    link.href = toCanvas(src).toDataURL("image/png");
    link.click();
}
