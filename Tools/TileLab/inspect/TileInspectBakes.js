import { getFloorProceduralProfile } from "../../../Config/floorProceduralConfig.js";
import { TileWorkerCoordinator } from "../../../Render/Floor/TileWorkerCoordinator.js";
import { getTexturePixelsPerWorldUnit } from "../../../Render/Floor/floorTextureResolution.js";

const MICRO_PREVIEW_MAX = 112;
const REPEAT_PREVIEW_MAX = 180;

function toCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    return canvas;
}

async function bakeFloorCellAtFrame(ctrl, frameIndex) {
    const bitmaps = await TileWorkerCoordinator.requestLabFloorCellBake({ worldX: ctrl.worldX, worldY: ctrl.worldY, seed: ctrl.seed, profileId: ctrl.profileId, frameIndex });
    return bitmaps[0];
}

async function bakeWallCellAtFrame(ctrl, frameIndex) {
    const bitmaps = await TileWorkerCoordinator.requestLabWallCellBake({ worldX: ctrl.worldX, worldY: ctrl.worldY, storyRow: ctrl.storyRow, seed: ctrl.seed, profileId: ctrl.profileId, frameIndex });
    return bitmaps[0];
}

async function bakeWallFaceAtFrame(ctrl, frameIndex) {
    const ppwu = getTexturePixelsPerWorldUnit();
    const bitmaps = await TileWorkerCoordinator.requestLabWallFaceBake({
        cellSize: ctrl.cellSize,
        storyCount: ctrl.storyCount,
        pixelsPerUnit: ppwu,
        seed: ctrl.seed,
        profileId: ctrl.profileId,
        frameIndex,
    });
    return bitmaps[0];
}

async function bakeWallColumnAtFrame(ctrl, frameIndex) {
    const promises = [];
    for (let s = 0; s < ctrl.storyCount; s++) {
        promises.push(bakeWallCellAtFrame({ ...ctrl, storyRow: s }, frameIndex));
    }
    const rows = await Promise.all(promises);

    if (rows.length === 0) return null;

    const bakeSize = rows[0].width;
    const canvas = new OffscreenCanvas(bakeSize, bakeSize * ctrl.storyCount);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    for (let s = 0; s < rows.length; s++) {
        ctx.drawImage(rows[s], 0, s * bakeSize);
        rows[s].close(); // We just copied it, can close the bitmap
    }
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

export function inspectFrameIndexFromTime(profileId, gameTime) {
    const profile = getFloorProceduralProfile(profileId);
    if (!profile?.animation) {
        return 0;
    }
    const frames = profile.animation.frames ?? 1;
    const duration = profile.animation.durationMs ?? 1000;
    return Math.min(frames - 1, Math.max(0, Math.floor(((gameTime % duration) / duration) * frames)));
}

export function isProfileAnimated(profileId) {
    return Boolean(getFloorProceduralProfile(profileId)?.animation);
}

async function bakeInspectPickAtFrame(ctrl, pick, frameIndex) {
    switch (pick) {
        case "floor":
            return await bakeFloorCellAtFrame(ctrl, frameIndex);
        case "wallCell":
            return await bakeWallCellAtFrame(ctrl, frameIndex);
        case "wallColumn":
            return await bakeWallColumnAtFrame(ctrl, frameIndex);
        case "wallFace":
            return await bakeWallFaceAtFrame(ctrl, frameIndex);
        default:
            return null;
    }
}

/**
 * Fast inspect draw — floor + wall cell only (used on load and lightweight edits).
 */
export async function drawInspectQuick(ctrl, frameIndex = 0) {
    const [floorSource, wallCellSource] = await Promise.all([bakeFloorCellAtFrame(ctrl, frameIndex), bakeWallCellAtFrame(ctrl, frameIndex)]);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallCellSource, ctrl.zoom);
    drawRepeatPreview(document.getElementById("floorRepeat"), floorSource, floorSource.width, floorSource.height, 5, 5, ctrl.zoom);

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
    drawTiled(wrCtx, wallCellSource, 0, 0, wallCellSource.width, wallCellSource.height, 5, 5, tileZ * wrScale);

    floorSource.close();
    wallCellSource.close();
}

/**
 * Draw inspect previews for one animation frame (full targets).
 */
export async function drawInspectAtFrame(ctrl, frameIndex = 0) {
    const [floorSource, wallCellSource, wallColumnSource, wallFaceSource] = await Promise.all([
        bakeFloorCellAtFrame(ctrl, frameIndex),
        bakeWallCellAtFrame(ctrl, frameIndex),
        bakeWallColumnAtFrame(ctrl, frameIndex),
        bakeWallFaceAtFrame(ctrl, frameIndex),
    ]);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallColumnSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallFaceSource, ctrl.zoom);

    drawRepeatPreview(document.getElementById("floorRepeat"), floorSource, floorSource.width, floorSource.height, 5, 5, ctrl.zoom);

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
    drawTiled(wrCtx, wallCellSource, 0, 0, wallCellSource.width, wallCellSource.height, 5, 5, z);

    floorSource.close();
    wallCellSource.close();
    // wallColumnSource is an OffscreenCanvas, so it doesn't need to be closed like ImageBitmap
    wallFaceSource.close();
}

export async function renderTileInspectPreviews(ctrl, gameTime = 0) {
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, gameTime);
    await drawInspectAtFrame(ctrl, frameIndex);
}

export async function downloadInspectExport(ctrl, pick) {
    if (!ctrl) {
        return;
    }

    const profile = getFloorProceduralProfile(ctrl.profileId);
    const { profileId, seed } = ctrl;

    if (profile?.animation) {
        return;
    }

    const src = await bakeInspectPickAtFrame(ctrl, pick, 0);
    const link = document.createElement("a");
    link.download = `tile-${pick}-${profileId}-seed${seed}.png`;
    link.href = toCanvas(src).toDataURL("image/png");
    link.click();

    if (src instanceof ImageBitmap) {
        src.close();
    }
}
