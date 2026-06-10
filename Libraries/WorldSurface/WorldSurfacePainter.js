import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { buildMapContext, createWallFaceAxes, writePixelToSamples } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan, getTexelResolution } from "./WorldSurfaceResolution.js";
import { getAnimationFrames, resolveBakeProfile } from "./ProfileBakeResolver.js";
import { sourceFrameIndexForBakeSlot } from "./AnimationFrameBake.js";
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
    if (profileOrId != null && typeof profileOrId === "object") return profileOrId;
    const provider = getSurfaceProfileProvider();
    return provider.getProfile(profileOrId ?? provider.defaultId);
}
export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options = {}, profileOrId) {
    const profile = resolvePaintProfile(profileOrId);
    const isWall = options.isWall === true || options.roofSurface === true;
    const cellSize = options.cellSize;
    if (cellSize == null) throw new Error("paintPixelArea requires options.cellSize");
    let surfaceKind = "floor";
    let wallFace = null;
    let pixelsPerUnit = options.pixelsPerUnit ?? (options.settings ? getTexelResolution(options.settings) : null);
    if (pixelsPerUnit == null) throw new Error("paintPixelArea requires options.pixelsPerUnit or options.settings");
    let zOffset = 0;
    if (isWall && options.p1 && options.p2) {
        surfaceKind = "wallFace";
        const edgeLen = Math.hypot(options.p2.x - options.p1.x, options.p2.y - options.p1.y);
        const axes = createWallFaceAxes(options.p1, options.p2);
        wallFace = { p1: options.p1, edgeLen, ...axes };
    } else if (options.roofSurface) surfaceKind = "roof";
    else if (isWall) {
        surfaceKind = "wallCell";
        zOffset = options.zOffset ?? 0;
    }
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;
    const pooled = memoryPool.getSamples(numPixels);
    const samples = { width, height, evalX: pooled.evalX, evalY: pooled.evalY, lookupX: pooled.lookupX, lookupY: pooled.lookupY, wallU: pooled.wallU, wallV: pooled.wallV, isWall, surfaceKind };
    const mapCtx = buildMapContext({ startWorldX, startWorldY, cellSize, surfaceKind, height, width, pixelsPerUnit, zOffset, wallFace, wallHeight: options.wallHeight, wallWidth: options.wallWidth });
    let idx = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            writePixelToSamples(samples, idx, x, y, mapCtx);
            idx++;
        }
    const rgbBuffer = composeSurfaceImage(samples, profile, seed);
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
function resolvePaintCellSize(optionsPayload) {
    const cellSize = optionsPayload?.cellSize ?? optionsPayload?.wallWidth;
    if (cellSize == null) throw new Error("wall bake payload requires cellSize or wallWidth");
    return cellSize;
}
function wallPaintOptions(pixelsPerUnit, optionsPayload) {
    return {
        isWall: true,
        p1: optionsPayload?.p1,
        p2: optionsPayload?.p2,
        pixelsPerUnit,
        wallHeight: optionsPayload?.wallHeight,
        wallWidth: optionsPayload?.wallWidth,
        cellSize: resolvePaintCellSize(optionsPayload),
    };
}
function bakeResolvedProfile(ctx, width, height, startWorldX, startWorldY, seed, options, baseProfile, profileKey, payload) {
    const profile = resolveBakeProfile(baseProfile, profileKey, payload);
    paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options, profile);
}
export function bakeWallAtlasCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileOrId, payload = null, optionsPayload = null) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const paintOpts = wallPaintOptions(pixelsPerUnit, { p1, p2, ...optionsPayload });
    if (payload) {
        const profileKey = typeof profileOrId === "string" ? profileOrId : getSurfaceProfileProvider().defaultId;
        const baseProfile = resolvePaintProfile(profileOrId);
        bakeResolvedProfile(ctx, width, height, 0, 0, seed, paintOpts, baseProfile, profileKey, payload);
    } else paintPixelArea(ctx, width, height, 0, 0, seed, paintOpts, profileOrId);
    return canvas;
}
function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, texelResolution) {
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return { x: minX + startCol * cellSize, y: minY + startRow * cellSize, bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk, { texelResolution }) };
}
function chunkNeedsRuntimeResolve(profile) {
    return Boolean(profile.animation);
}
/** Bake one or more ground-chunk canvases from a single worker payload. */
export function bakeGroundChunkCanvases(payload) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { frameStart, frameCount } = payload;
    const { chunkCol, chunkRow, minX, minY, seed, cellsPerChunk, cellSize, texelResolution } = payload;
    if (cellsPerChunk == null || cellSize == null || texelResolution == null) throw new Error("bakeGroundChunkCanvases payload requires cellsPerChunk, cellSize, texelResolution");
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, texelResolution);
    const useResolver = chunkNeedsRuntimeResolve(baseProfile);
    const pixelsPerUnit = texelResolution;
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    const canvases = [];
    const sourceTotal = getAnimationFrames(baseProfile.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    for (let i = 0; i < frameCount; i++) {
        payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
        const canvas = new OffscreenCanvas(bakeSize, bakeSize);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (useResolver) bakeResolvedProfile(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, paintOptions, baseProfile, profileId, payload);
        else paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, seed, paintOptions, profileId);
        canvases.push(canvas);
    }
    return canvases;
}
/** Bake a world-aligned horizontal patch (assembly playfield / rail band). */
export function bakeHorizontalPatchCanvases(payload) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { frameStart, frameCount } = payload;
    const { originX, originY, worldWidth, worldHeight, seed, cellSize, texelResolution } = payload;
    if (cellSize == null || texelResolution == null) throw new Error("bakeHorizontalPatchCanvases payload requires cellSize, texelResolution");
    const widthPx = bakePixelsForWorldSpan(worldWidth, { texelResolution });
    const heightPx = bakePixelsForWorldSpan(worldHeight, { texelResolution });
    const useResolver = chunkNeedsRuntimeResolve(baseProfile);
    const pixelsPerUnit = texelResolution;
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    const canvases = [];
    const sourceTotal = getAnimationFrames(baseProfile.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    for (let i = 0; i < frameCount; i++) {
        payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
        const canvas = new OffscreenCanvas(widthPx, heightPx);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (useResolver) bakeResolvedProfile(ctx, widthPx, heightPx, originX, originY, seed, paintOptions, baseProfile, profileId, payload);
        else paintPixelArea(ctx, widthPx, heightPx, originX, originY, seed, paintOptions, profileId);
        canvases.push(canvas);
    }
    return canvases;
}
export function bakeWallAtlasCanvases(width, height, p1, p2, pixelsPerUnit, seed, profileId, payload = {}) {
    const provider = getSurfaceProfileProvider();
    const baseProfile = provider.getProfile(profileId ?? provider.defaultId);
    if (!baseProfile.animation) return [bakeWallAtlasCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId, null, payload)];
    const { frameStart, frameCount } = payload;
    const sourceTotal = getAnimationFrames(baseProfile.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    const canvases = [];
    for (let i = 0; i < frameCount; i++) {
        payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
        canvases.push(bakeWallAtlasCanvas(width, height, p1, p2, pixelsPerUnit, seed, profileId, payload, payload));
    }
    return canvases;
}
