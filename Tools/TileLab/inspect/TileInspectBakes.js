import {
    paintPixelArea,
    bakeFloorCellCanvas,
    withLabAnimationFrame,
} from "../../../Render/Floor/FloorTilePainter.js";
import {
    bakePixelsForWorldSpan,
    getTexturePixelsPerWorldUnit,
} from "../../../Render/Floor/floorTextureResolution.js";
import { getFloorProceduralProfile } from "../../../Config/floorProceduralConfig.js";

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
    const canvas = new OffscreenCanvas(source.width, source.height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
    return canvas;
}

function bakeFloorCellAtFrame(ctrl, frameIndex) {
    const stub = makeStubGrid(ctrl.cellSize);
    return withLabAnimationFrame(ctrl.profileId, frameIndex, (profileId) =>
        bakeFloorCellCanvas(ctrl.worldX, ctrl.worldY, stub, ctrl.seed, profileId)
    );
}

function bakeWallCellAtFrame(ctrl, frameIndex) {
    const stub = makeStubGrid(ctrl.cellSize);
    return withLabAnimationFrame(ctrl.profileId, frameIndex, (profileId) => {
        const bakeSize = bakePixelsForWorldSpan(ctrl.cellSize);
        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        paintPixelArea(
            ctx,
            bakeSize,
            bakeSize,
            ctrl.worldX,
            ctrl.worldY,
            stub,
            ctrl.seed,
            { isWall: true, zOffset: ctrl.storyRow * ctrl.cellSize },
            profileId
        );
        return canvas;
    });
}

function bakeWallFaceAtFrame(ctrl, frameIndex) {
    const stub = makeStubGrid(ctrl.cellSize);
    const ppwu = getTexturePixelsPerWorldUnit();
    const width = bakePixelsForWorldSpan(ctrl.cellSize);
    const height = bakePixelsForWorldSpan(ctrl.cellSize * ctrl.storyCount);
    return withLabAnimationFrame(ctrl.profileId, frameIndex, (profileId) => {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        paintPixelArea(
            ctx,
            width,
            height,
            0,
            0,
            stub,
            ctrl.seed,
            { isWall: true, p1: { x: 0, y: 0 }, p2: { x: ctrl.cellSize, y: 0 }, pixelsPerUnit: ppwu },
            profileId
        );
        return canvas;
    });
}

function bakeWallColumnAtFrame(ctrl, frameIndex) {
    const bakeSize = bakePixelsForWorldSpan(ctrl.cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize * ctrl.storyCount);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let s = 0; s < ctrl.storyCount; s++) {
        const row = bakeWallCellAtFrame({ ...ctrl, storyRow: s }, frameIndex);
        ctx.drawImage(row, 0, s * bakeSize);
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
    return Math.min(
        frames - 1,
        Math.max(0, Math.floor(((gameTime % duration) / duration) * frames))
    );
}

export function isProfileAnimated(profileId) {
    return Boolean(getFloorProceduralProfile(profileId)?.animation);
}

function bakeInspectPickAtFrame(ctrl, pick, frameIndex) {
    switch (pick) {
        case "floor":
            return bakeFloorCellAtFrame(ctrl, frameIndex);
        case "wallCell":
            return bakeWallCellAtFrame(ctrl, frameIndex);
        case "wallColumn":
            return bakeWallColumnAtFrame(ctrl, frameIndex);
        case "wallFace":
            return bakeWallFaceAtFrame(ctrl, frameIndex);
        default:
            return null;
    }
}

/**
 * Fast inspect draw — floor + wall cell only (used on load and lightweight edits).
 */
export function drawInspectQuick(ctrl, frameIndex = 0) {
    const floorSource = bakeFloorCellAtFrame(ctrl, frameIndex);
    const wallCellSource = bakeWallCellAtFrame(ctrl, frameIndex);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallCellSource, ctrl.zoom);

    drawRepeatPreview(
        document.getElementById("floorRepeat"),
        floorSource,
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
    drawTiled(wrCtx, wallCellSource, 0, 0, wallCellSource.width, wallCellSource.height, 5, 5, tileZ * wrScale);
}

/**
 * Draw inspect previews for one animation frame (full targets).
 */
export function drawInspectAtFrame(ctrl, frameIndex = 0) {
    const floorSource = bakeFloorCellAtFrame(ctrl, frameIndex);
    const wallCellSource = bakeWallCellAtFrame(ctrl, frameIndex);
    const wallColumnSource = bakeWallColumnAtFrame(ctrl, frameIndex);
    const wallFaceSource = bakeWallFaceAtFrame(ctrl, frameIndex);

    drawZoomedPreview(document.getElementById("floorPreview"), floorSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallCellPreview"), wallCellSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallColumnPreview"), wallColumnSource, ctrl.zoom);
    drawZoomedPreview(document.getElementById("wallFacePreview"), wallFaceSource, ctrl.zoom);

    drawRepeatPreview(
        document.getElementById("floorRepeat"),
        floorSource,
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
    drawTiled(wrCtx, wallCellSource, 0, 0, wallCellSource.width, wallCellSource.height, 5, 5, z);
}

export function renderTileInspectPreviews(ctrl, gameTime = 0) {
    const frameIndex = inspectFrameIndexFromTime(ctrl.profileId, gameTime);
    drawInspectAtFrame(ctrl, frameIndex);
}

export function isAnimatedExportTarget(ctrl, pick) {
    return Boolean(ctrl && pick && isProfileAnimated(ctrl.profileId));
}

export async function downloadInspectExport(ctrl, pick) {
    if (!ctrl) {
        return;
    }

    const profile = getFloorProceduralProfile(ctrl.profileId);
    const { profileId, seed } = ctrl;

    if (profile?.animation) {
        const frameCount = profile.animation.frames ?? 1;
        const frames = [];
        for (let i = 0; i < frameCount; i++) {
            frames.push(bakeInspectPickAtFrame(ctrl, pick, i));
        }

        const width = frames[0].width;
        const height = frames[0].height;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        const stream = canvas.captureStream(30);
        let recorder;
        try {
            recorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });
        } catch (e) {
            recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        }

        const chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const stopped = new Promise((resolve) => {
            recorder.onstop = resolve;
        });

        recorder.start();

        for (let i = 0; i < frames.length; i++) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(frames[i], 0, 0);
            await new Promise((r) => setTimeout(r, 1000 / 30));
        }

        recorder.stop();
        await stopped;

        const blob = new Blob(chunks, { type: "video/webm" });
        const link = document.createElement("a");
        link.download = `tile-${pick}-${profileId}-seed${seed}.webm`;
        link.href = URL.createObjectURL(blob);
        link.click();
        return;
    }

    const src = bakeInspectPickAtFrame(ctrl, pick, 0);
    const link = document.createElement("a");
    link.download = `tile-${pick}-${profileId}-seed${seed}.png`;
    link.href = toCanvas(src).toDataURL("image/png");
    link.click();
}
