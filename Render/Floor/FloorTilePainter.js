import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import { defaultFloorProceduralProfileId, getFloorProceduralProfile, registerRuntimeFloorProfile, unregisterRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { createPaintContext, composeFloorImage } from "../../Procedural/FloorTextureComposer.js";
import { createWallFaceAxes, mapPixelToEval, queryObstacleBlocked } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan, drawBakedTexture, getTexturePixelsPerWorldUnit } from "./floorTextureResolution.js";

export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, obstacleGrid, seed, options = {}, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const paintContext = createPaintContext(profile, seed);

    const isWall = options.isWall === true;
    const cellSize = obstacleGrid.cellSize;
    const texturePixelsPerWorldUnit = options.texturePixelsPerWorldUnit ?? getTexturePixelsPerWorldUnit();

    let surfaceKind = "floor";
    let wallFace = null;
    let pixelsPerUnit = texturePixelsPerWorldUnit;
    let zOffset = 0;

    if (isWall && options.p1 && options.p2) {
        surfaceKind = "wallFace";
        const edgeLen = Math.hypot(options.p2.x - options.p1.x, options.p2.y - options.p1.y);
        const axes = createWallFaceAxes(options.p1, options.p2);
        wallFace = { p1: options.p1, edgeLen, ...axes };
        pixelsPerUnit = options.pixelsPerUnit;
    } else if (isWall) {
        surfaceKind = "wallCell";
        zOffset = options.zOffset ?? 0;
    }

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const numPixels = width * height;
    const samples = {
        width,
        height,
        evalX: new Float32Array(numPixels),
        evalY: new Float32Array(numPixels),
        lookupX: new Float32Array(numPixels),
        lookupY: new Float32Array(numPixels),
        wallU: new Float32Array(numPixels),
        wallV: new Float32Array(numPixels),
        blocked: new Uint8Array(numPixels),
        isWall,
        surfaceKind,
    };

    let idx = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const mapped = mapPixelToEval({ x, y, startWorldX, startWorldY, cellSize, surfaceKind, height, width, pixelsPerUnit, texturePixelsPerWorldUnit, bakeWidth: width, zOffset, wallFace });

            const blocked = queryObstacleBlocked(mapped.evalX, mapped.evalY, obstacleGrid);

            samples.evalX[idx] = mapped.evalX;
            samples.evalY[idx] = mapped.evalY;
            samples.wallU[idx] = mapped.wallU ?? 0;
            samples.wallV[idx] = mapped.wallV ?? 0;
            samples.blocked[idx] = blocked ? 1 : 0;
            idx++;
        }
    }

    let faceKey = "";
    if (wallFace && options.p2) {
        faceKey = `_p1:${wallFace.p1.x},${wallFace.p1.y}_p2:${options.p2.x},${options.p2.y}`;
    }
    const requestKey = `${surfaceKind}_${startWorldX},${startWorldY}_${width}x${height}_${pixelsPerUnit}_${zOffset}_${seed}${faceKey}`;
    const rgbBuffer = composeFloorImage(samples, paintContext, requestKey);

    let dataIdx = 0;
    for (let i = 0; i < numPixels; i++) {
        data[dataIdx++] = rgbBuffer[i * 3];
        data[dataIdx++] = rgbBuffer[i * 3 + 1];
        data[dataIdx++] = rgbBuffer[i * 3 + 2];
        data[dataIdx++] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
}

export function bakeFloorCellCanvas(worldX, worldY, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, obstacleGrid, seed, {}, profileId);
    return canvas;
}

export function bakeWallCellCanvas(worldX, worldY, storyRow, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, obstacleGrid, seed, { isWall: true, zOffset: storyRow * cellSize }, profileId);
    return canvas;
}

export function bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, profileId) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, width, height, 0, 0, obstacleGrid, seed, { isWall: true, p1, p2, pixelsPerUnit }, profileId);
    return canvas;
}

export function bakeWallCellCanvases(worldX, worldY, storyRow, obstacleGrid, seed, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const anim = profile.animation;

    if (!anim) {
        return [bakeWallCellCanvas(worldX, worldY, storyRow, obstacleGrid, seed, profileId)];
    }

    const frames = [];
    for (let i = 0; i < anim.frames; i++) {
        const t = i / (anim.frames - 1);
        const val = anim.startValue + (anim.endValue - anim.startValue) * t;
        const tempId = `${profileId}_anim_wallcell_${i}`;
        const cloned = JSON.parse(JSON.stringify(profile));
        setDeep(cloned, anim.targetPath, val);
        registerRuntimeFloorProfile(tempId, cloned);

        const canvas = bakeWallCellCanvas(worldX, worldY, storyRow, obstacleGrid, seed, tempId);

        frames.push(canvas);
        unregisterRuntimeFloorProfile(tempId);
    }
    return frames;
}

export function drawWallCell(ctx, destX, destY, storyRow, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const bakeCtx = canvas.getContext("2d");
    bakeCtx.imageSmoothingEnabled = false;
    paintPixelArea(bakeCtx, bakeSize, bakeSize, destX, destY, obstacleGrid, seed, { isWall: true, zOffset: storyRow * cellSize }, profileId);
    drawBakedTexture(ctx, canvas, destX, destY, cellSize, cellSize);
}

export function bakeFloorTileTextureCanvas(seed, cellSize = gridSettings.cellSize, profileId) {
    const stubGrid = { cellSize, minX: 0, minY: 0, cols: 1, rows: 1, grid: new Uint8Array(1) };
    return bakeFloorCellCanvas(0, 0, stubGrid, seed, profileId);
}

export function bakeFloorChunkCanvas({ chunkCol, chunkRow, obstacleGrid, seed, cellsPerChunk = floorTileSettings.cellsPerChunk, profileId }) {
    const cellSize = obstacleGrid.cellSize;
    const chunkWorldSize = cellSize * cellsPerChunk;
    const bakeSize = bakePixelsForWorldSpan(chunkWorldSize);
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const anim = profile.animation;

    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    const chunkWorldX = obstacleGrid.minX + startCol * cellSize;
    const chunkWorldY = obstacleGrid.minY + startRow * cellSize;

    if (!anim) {
        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, obstacleGrid, seed, {}, profileId);
        return [canvas];
    }

    const frames = [];
    for (let i = 0; i < anim.frames; i++) {
        const t = i / (anim.frames - 1);
        const val = anim.startValue + (anim.endValue - anim.startValue) * t;

        const tempId = `${profileId}_anim_chunk_${i}`;
        const cloned = JSON.parse(JSON.stringify(profile));
        setDeep(cloned, anim.targetPath, val);

        registerRuntimeFloorProfile(tempId, cloned);

        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, obstacleGrid, seed, {}, tempId);

        frames.push(canvas);
        unregisterRuntimeFloorProfile(tempId);
    }

    return frames;
}

function setDeep(obj, path, value) {
    const parts = path
        .replace(/\]/g, "")
        .split(/[\[\.]+/)
        .filter(Boolean);
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
}

/** Bake using a single animation frame's profile override (Tile Lab preview / export). */
export function withLabAnimationFrame(profileId, frameIndex, fn, { staticBake = false, stableId = false } = {}) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    if (!profile?.animation) {
        return fn(profileId ?? defaultFloorProceduralProfileId);
    }

    const anim = profile.animation;
    const frames = anim.frames;
    const idx = Math.min(frames - 1, Math.max(0, frameIndex ?? 0));
    const t = frames > 1 ? idx / (anim.frames - 1) : 0;
    const val = anim.startValue + (anim.endValue - anim.startValue) * t;
    const tempId = stableId ? `${profileId}_export` : `${profileId}_lab_frame_${idx}`;
    const cloned = JSON.parse(JSON.stringify(profile));
    setDeep(cloned, anim.targetPath, val);
    if (staticBake) {
        delete cloned.animation;
    }
    registerRuntimeFloorProfile(tempId, cloned);
    try {
        return fn(tempId);
    } finally {
        if (!stableId) {
            unregisterRuntimeFloorProfile(tempId);
        }
    }
}

export function bakeWallFaceCanvases(width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const anim = profile.animation;

    if (!anim) {
        return [bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, profileId)];
    }

    const frames = [];
    for (let i = 0; i < anim.frames; i++) {
        const t = i / (anim.frames - 1);
        const val = anim.startValue + (anim.endValue - anim.startValue) * t;

        const tempId = `${profileId}_anim_${i}`;
        const cloned = JSON.parse(JSON.stringify(profile));
        setDeep(cloned, anim.targetPath, val);

        registerRuntimeFloorProfile(tempId, cloned);

        const canvas = bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, tempId);

        frames.push(canvas);
        unregisterRuntimeFloorProfile(tempId);
    }
    return frames;
}
