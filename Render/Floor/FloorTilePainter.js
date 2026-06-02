import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import { defaultFloorProceduralProfileId, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { composeFloorImage } from "../../Procedural/FloorTextureComposer.js";
import { createWallFaceAxes, mapPixelToEval } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan, getPixelsPerWorldUnit } from "./floorTextureResolution.js";
import { resolveBakeProfile } from "./ProfileBakeResolver.js";

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
            wallV: new Float32Array(numPixels),
        };
    }
    release(samples, numPixels) {
        const pool = this.buffers.get(numPixels);
        if (pool) pool.push(samples);
    }
}
const memoryPool = new TileMemoryPool();

function resolvePaintProfile(profileOrId) {
    if (profileOrId != null && typeof profileOrId === "object") {
        return profileOrId;
    }
    return getFloorProceduralProfile(profileOrId ?? defaultFloorProceduralProfileId);
}

export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options = {}, profileOrId) {
    const profile = resolvePaintProfile(profileOrId);

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
    const samples = { width, height, evalX: pooled.evalX, evalY: pooled.evalY, lookupX: pooled.lookupX, lookupY: pooled.lookupY, wallU: pooled.wallU, wallV: pooled.wallV, isWall, surfaceKind };

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

function bakeResolvedProfile(ctx, width, height, startWorldX, startWorldY, seed, options, baseProfile, profileKey, bakeContext) {
    const profile = resolveBakeProfile(baseProfile, profileKey, bakeContext);
    paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options, profile);
}

export function bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileOrId, bakeContext = null) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    if (bakeContext) {
        const profileKey = typeof profileOrId === "string" ? profileOrId : defaultFloorProceduralProfileId;
        const baseProfile = resolvePaintProfile(profileOrId);
        bakeResolvedProfile(ctx, width, height, 0, 0, seed, { isWall: true, p1, p2, pixelsPerUnit }, baseProfile, profileKey, bakeContext);
    } else {
        paintPixelArea(ctx, width, height, 0, 0, seed, { isWall: true, p1, p2, pixelsPerUnit }, profileOrId);
    }

    return canvas;
}

function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk = floorTileSettings.cellsPerChunk) {
    const cellSize = gridSettings.cellSize;
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return { x: minX + startCol * cellSize, y: minY + startRow * cellSize, bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk) };
}

function buildBakeContextFromPayload(payload) {
    return {
        frameIndex: payload.frameIndex,
        gameTime: payload.gameTime,
    };
}

function chunkNeedsRuntimeResolve(profile) {
    return Boolean(profile.animation);
}

/** Bake one or more chunk canvases from a single worker payload. */
export function bakeFloorChunkCanvases(payload) {
    const profileId = payload.profileId ?? defaultFloorProceduralProfileId;
    const baseProfile = getFloorProceduralProfile(profileId);
    const frames = baseProfile.animation?.frames ?? 1;
    const { chunkCol, chunkRow, minX, minY, seed, cellsPerChunk = floorTileSettings.cellsPerChunk } = payload;
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk);
    const useResolver = chunkNeedsRuntimeResolve(baseProfile);
    const canvases = [];

    for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        if (useResolver) {
            const bakeContext = buildBakeContextFromPayload({ ...payload, frameIndex, profileId });
            bakeResolvedProfile(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, {}, baseProfile, profileId, bakeContext);
        } else {
            paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, {}, profileId);
        }
        canvases.push(canvas);
    }

    return canvases;
}

export function bakeWallFaceCanvases(width, height, p1, p2, pixelsPerUnit, seed, profileId, payload = {}) {
    const baseProfile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    if (!baseProfile.animation) {
        return [bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId)];
    }

    const frames = baseProfile.animation.frames;
    const canvases = [];
    for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
        const bakeContext = buildBakeContextFromPayload({ ...payload, frameIndex, profileId });
        canvases.push(bakeWallFaceCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId, bakeContext));
    }
    return canvases;
}
