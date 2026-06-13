import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { createWallFaceAxes, fillWallFaceRows, writeFloorPixel, writeRoofPixel, writeWallCellPixel } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan, getTexelResolution } from "./WorldSurfaceResolution.js";
import { getAnimationFrames, resolveBakeProfile } from "./ProfileBakeResolver.js";
import { sourceFrameIndexForBakeSlot } from "./AnimationFrameBake.js";
/**
 * @typedef {Object} BakeRequest
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width
 * @property {number} height
 * @property {number} startWorldX
 * @property {number} startWorldY
 * @property {number} seed
 * @property {object} paintOptions
 * @property {string | object} profileOrId
 * @property {object} [resolvePayload]
 * @property {string} [profileKey]
 * @property {object} [baseProfile]
 */
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
function resolveBakeRequestProfile(req) {
    return req.resolvePayload ? resolveBakeProfile(req.baseProfile, req.profileKey, req.resolvePayload) : resolvePaintProfile(req.profileOrId);
}
/** @param {BakeRequest} req */
export function paintBakeRequest(req) {
    paintPixelArea(req.ctx, req.width, req.height, req.startWorldX, req.startWorldY, req.seed, req.paintOptions, resolveBakeRequestProfile(req));
}
/** @param {Omit<BakeRequest, "ctx">} req @returns {OffscreenCanvas} */
export function bakeRequestToCanvas(req) {
    const canvas = createOffscreenCanvas(req.width, req.height);
    paintBakeRequest({ ...req, ctx: canvas.getContext("2d") });
    return canvas;
}
export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options = {}, profileOrId) {
    const profile = resolvePaintProfile(profileOrId);
    const cellSize = options.cellSize;
    if (cellSize == null) throw new Error("paintPixelArea requires options.cellSize");
    const pixelsPerUnit = options.pixelsPerUnit ?? (options.settings ? getTexelResolution(options.settings) : null);
    if (pixelsPerUnit == null) throw new Error("paintPixelArea requires options.pixelsPerUnit or options.settings");
    const invPpwu = 1 / pixelsPerUnit;
    let writePixel = writeFloorPixel;
    let mapCtx = { invPpwu, startWorldX, startWorldY };
    /** @type {{ useWallBase: boolean, wallFace?: boolean, wallCell?: boolean }} */
    let bake = { useWallBase: false };
    if (options.isWall && options.p1 && options.p2) {
        const wf = { p1: options.p1, ...createWallFaceAxes(options.p1, options.p2) };
        if (options.wallHeight == null) throw new Error("paintPixelArea wallFace requires options.wallHeight");
        mapCtx = {
            invPpwu,
            height,
            p1x: wf.p1.x,
            p1y: wf.p1.y,
            dirX: wf.dirX,
            dirY: wf.dirY,
            foldX: wf.foldX,
            foldY: wf.foldY,
            invEdgeLen: wf.edgeLen > 0 ? 1 / wf.edgeLen : 1,
            wallHeight: options.wallHeight,
            wallWidth: options.wallWidth ?? cellSize,
        };
        bake = { useWallBase: true, wallFace: true };
    } else if (options.roofSurface) {
        writePixel = writeRoofPixel;
        mapCtx = { invPpwu, startWorldX, startWorldY, spanU: width > 1 ? width - 1 : 1 };
        bake = { useWallBase: true, wallCell: true };
    } else if (options.isWall) {
        writePixel = writeWallCellPixel;
        mapCtx = { invPpwu, startWorldX, startWorldY, cellSize, zOffset: options.zOffset ?? 0, height, spanU: width > 1 ? width - 1 : 1, invWallCellVSpan: height > 1 ? 1 / (height - 1) : 0 };
        bake = { useWallBase: true, wallCell: true };
    }
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;
    const pooled = memoryPool.getSamples(numPixels);
    const samples = { width, height, evalX: pooled.evalX, evalY: pooled.evalY, lookupX: pooled.lookupX, lookupY: pooled.lookupY, wallU: pooled.wallU, wallV: pooled.wallV };
    if (bake.wallFace) fillWallFaceRows(samples, width, height, mapCtx);
    else {
        let idx = 0;
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                writePixel(samples, idx, x, y, mapCtx);
                idx++;
            }
    }
    const rgbBuffer = composeSurfaceImage(samples, profile, seed, bake);
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
/** @param {object} payload */
export function bakeWallAtlasCanvases(payload) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const useResolver = Boolean(baseProfile.animation);
    if (useResolver) payload.frameIndex = 0;
    const { width, height, pixelsPerUnit, seed } = payload;
    return [
        bakeRequestToCanvas({
            width,
            height,
            startWorldX: 0,
            startWorldY: 0,
            seed,
            paintOptions: wallPaintOptions(pixelsPerUnit, payload),
            profileOrId: profileId,
            ...(useResolver ? { resolvePayload: payload, baseProfile, profileKey: profileId } : {}),
        }),
    ];
}
function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, texelResolution) {
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return { x: minX + startCol * cellSize, y: minY + startRow * cellSize, bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk, { texelResolution }) };
}
/** Bake a static ground-chunk canvas (frame 0 when the profile has a timeline). */
export function bakeGroundChunkCanvases(payload) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { chunkCol, chunkRow, minX, minY, seed, cellsPerChunk, cellSize, texelResolution } = payload;
    if (cellsPerChunk == null || cellSize == null || texelResolution == null) throw new Error("bakeGroundChunkCanvases payload requires cellsPerChunk, cellSize, texelResolution");
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, texelResolution);
    const pixelsPerUnit = texelResolution;
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    const useResolver = Boolean(baseProfile.animation);
    if (useResolver) payload.frameIndex = 0;
    const canvas = bakeRequestToCanvas({
        width: bakeSize,
        height: bakeSize,
        startWorldX: chunkWorldX,
        startWorldY: chunkWorldY,
        seed,
        paintOptions,
        profileOrId: profileId,
        ...(useResolver ? { resolvePayload: payload, baseProfile, profileKey: profileId } : {}),
    });
    return [canvas];
}
/** Bake a world-aligned horizontal patch (animated surface playfield / rail band). */
export function bakeHorizontalPatchCanvases(payload) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { frameStart, frameCount } = payload;
    const { originX, originY, worldWidth, worldHeight, seed, cellSize, texelResolution } = payload;
    if (cellSize == null || texelResolution == null) throw new Error("bakeHorizontalPatchCanvases payload requires cellSize, texelResolution");
    const widthPx = bakePixelsForWorldSpan(worldWidth, { texelResolution });
    const heightPx = bakePixelsForWorldSpan(worldHeight, { texelResolution });
    const useResolver = Boolean(baseProfile.animation);
    const pixelsPerUnit = texelResolution;
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, pixelsPerUnit, isWall: true, roofSurface: true } : { cellSize, pixelsPerUnit };
    const canvases = [];
    const sourceTotal = getAnimationFrames(baseProfile.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    for (let i = 0; i < frameCount; i++) {
        payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
        canvases.push(
            bakeRequestToCanvas({
                width: widthPx,
                height: heightPx,
                startWorldX: originX,
                startWorldY: originY,
                seed,
                paintOptions,
                profileOrId: profileId,
                ...(useResolver ? { resolvePayload: payload, baseProfile, profileKey: profileId } : {}),
            }),
        );
    }
    return canvases;
}
