import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import { defaultFloorProceduralProfileId, getFloorProceduralProfile, registerRuntimeFloorProfile, unregisterRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { composeFloorImage } from "../../Procedural/FloorTextureComposer.js";
import { createWallFaceAxes, mapPixelToEval } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan, drawBakedTexture, getPixelsPerWorldUnit } from "./floorTextureResolution.js";

class TileMemoryPool {
    constructor() {
        this.buffers = new Map();
    }
    getSamples(numPixels) {
        if (!this.buffers.has(numPixels)) this.buffers.set(numPixels, []);
        const pool = this.buffers.get(numPixels);
        if (pool.length > 0) return pool.pop();
        return {
            evalX: new Float32Array(numPixels),
            evalY: new Float32Array(numPixels),
            lookupX: new Float32Array(numPixels),
            lookupY: new Float32Array(numPixels),
            wallU: new Float32Array(numPixels),
            wallV: new Float32Array(numPixels)
        };
    }
    release(samples, numPixels) {
        const pool = this.buffers.get(numPixels);
        if (pool) pool.push(samples);
    }
}
const memoryPool = new TileMemoryPool();

export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options = {}, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);

    const isWall = options.isWall === true;
    const cellSize = options.cellSize ?? gridSettings.cellSize;

    let surfaceKind = "floor";
    let wallFace = null;
    let pixelsPerUnit = options.pixelsPerUnit ?? getPixelsPerWorldUnit();
    let zOffset = 0;

    if (isWall && options.p1 && options.p2) {
        surfaceKind = "wallFace";
        const edgeLen = Math.hypot(options.p2.x - options.p1.x, options.p2.y - options.p1.y);
        const axes = createWallFaceAxes(options.p1, options.p2);
        wallFace = { p1: options.p1, edgeLen, ...axes };
    } else if (isWall) {
        surfaceKind = "wallCell";
        zOffset = options.zOffset ?? 0;
    }

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const numPixels = width * height;
    const pooled = memoryPool.getSamples(numPixels);
    const samples = {
        width,
        height,
        evalX: pooled.evalX,
        evalY: pooled.evalY,
        lookupX: pooled.lookupX,
        lookupY: pooled.lookupY,
        wallU: pooled.wallU,
        wallV: pooled.wallV,
        isWall,
        surfaceKind,
    };

    let idx = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const mapped = mapPixelToEval({ x, y, startWorldX, startWorldY, cellSize, surfaceKind, height, width, pixelsPerUnit, bakeWidth: width, zOffset, wallFace });

            samples.evalX[idx] = mapped.evalX;
            samples.evalY[idx] = mapped.evalY;
            samples.wallU[idx] = mapped.wallU ?? 0;
            samples.wallV[idx] = mapped.wallV ?? 0;
            idx++;
        }
    }

    let faceKey = "";
    if (wallFace && options.p2) {
        faceKey = `_p1:${wallFace.p1.x},${wallFace.p1.y}_p2:${options.p2.x},${options.p2.y}`;
    }
    const requestKey = `${surfaceKind}_${startWorldX},${startWorldY}_${width}x${height}_${pixelsPerUnit}_${zOffset}_${seed}${faceKey}`;
    const rgbBuffer = composeFloorImage(samples, profile, seed, requestKey);

    let dataIdx = 0;
    for (let i = 0; i < numPixels; i++) {
        data[dataIdx++] = rgbBuffer[i * 3];
        data[dataIdx++] = rgbBuffer[i * 3 + 1];
        data[dataIdx++] = rgbBuffer[i * 3 + 2];
        data[dataIdx++] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    memoryPool.release(pooled, numPixels);
}

export function bakeFloorCellCanvas(worldX, worldY, seed, profileId) {
    const cellSize = gridSettings.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, seed, {}, profileId);
    return canvas;
}

export function bakeWallCellCanvas(worldX, worldY, storyRow, seed, profileId) {
    const cellSize = gridSettings.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, seed, { isWall: true, zOffset: storyRow * cellSize }, profileId);
    return canvas;
}

export function bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, width, height, 0, 0, seed, { isWall: true, p1, p2, pixelsPerUnit }, profileId);
    return canvas;
}

export function bakeWallCellCanvases(worldX, worldY, storyRow, seed, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const anim = profile.animation;

    if (!anim) {
        return [bakeWallCellCanvas(worldX, worldY, storyRow, seed, profileId)];
    }

    const frames = [];
    const tracks = anim.tracks || [{ targetPath: anim.targetPath, startValue: anim.startValue, endValue: anim.endValue }];
    for (let i = 0; i < anim.frames; i++) {
        const t = anim.frames > 1 ? i / (anim.frames - 1) : 0;
        const tempId = `${profileId}_anim_wallcell_${i}`;
        const cloned = JSON.parse(JSON.stringify(profile));
        for (const track of tracks) {
            if (track.targetPath) {
                const val = track.startValue + (track.endValue - track.startValue) * t;
                setDeep(cloned, track.targetPath, val);
            }
        }
        registerRuntimeFloorProfile(tempId, cloned);

        const canvas = bakeWallCellCanvas(worldX, worldY, storyRow, seed, tempId);

        frames.push(canvas);
        unregisterRuntimeFloorProfile(tempId);
    }
    return frames;
}

export function drawWallCell(ctx, destX, destY, storyRow, seed, profileId) {
    const cellSize = gridSettings.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const bakeCtx = canvas.getContext("2d");
    bakeCtx.imageSmoothingEnabled = false;
    paintPixelArea(bakeCtx, bakeSize, bakeSize, destX, destY, seed, { isWall: true, zOffset: storyRow * cellSize }, profileId);
    drawBakedTexture(ctx, canvas, destX, destY, cellSize, cellSize);
}

export function bakeFloorTileTextureCanvas(seed, profileId) {
    return bakeFloorCellCanvas(0, 0, seed, profileId);
}

function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk = floorTileSettings.cellsPerChunk) {
    const cellSize = gridSettings.cellSize;
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return {
        x: minX + startCol * cellSize,
        y: minY + startRow * cellSize,
        bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk),
    };
}

/** Static chunk bake — animated profiles use bakeFloorChunkFrameCanvas via the coordinator. */
export function bakeFloorChunkCanvas({ chunkCol, chunkRow, minX, minY, seed, cellsPerChunk = floorTileSettings.cellsPerChunk, profileId }) {
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, {}, profileId);
    return [canvas];
}

/** Single animation frame for a floor chunk — dispatched as its own worker job. */
export function bakeFloorChunkFrameCanvas({ chunkCol, chunkRow, minX, minY, seed, frameIndex, cellsPerChunk = floorTileSettings.cellsPerChunk, profileId }) {
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk);
    return withLabAnimationFrame(profileId, frameIndex, (tempProfileId) => {
        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, {}, tempProfileId);
        return canvas;
    });
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
    const tempId = stableId ? `${profileId}_export` : `${profileId}_lab_frame_${idx}`;
    const cloned = JSON.parse(JSON.stringify(profile));
    
    const tracks = anim.tracks || [{ targetPath: anim.targetPath, startValue: anim.startValue, endValue: anim.endValue }];
    for (const track of tracks) {
        if (track.targetPath) {
            const val = track.startValue + (track.endValue - track.startValue) * t;
            setDeep(cloned, track.targetPath, val);
        }
    }
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

export function bakeWallFaceCanvases(width, height, p1, p2, pixelsPerUnit, seed, profileId) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const anim = profile.animation;

    if (!anim) {
        return [bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId)];
    }

    const frames = [];
    const tracks = anim.tracks || [{ targetPath: anim.targetPath, startValue: anim.startValue, endValue: anim.endValue }];
    for (let i = 0; i < anim.frames; i++) {
        const t = anim.frames > 1 ? i / (anim.frames - 1) : 0;

        const tempId = `${profileId}_anim_${i}`;
        const cloned = JSON.parse(JSON.stringify(profile));
        for (const track of tracks) {
            if (track.targetPath) {
                const val = track.startValue + (track.endValue - track.startValue) * t;
                setDeep(cloned, track.targetPath, val);
            }
        }

        registerRuntimeFloorProfile(tempId, cloned);

        const canvas = bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, tempId);

        frames.push(canvas);
        unregisterRuntimeFloorProfile(tempId);
    }
    return frames;
}
