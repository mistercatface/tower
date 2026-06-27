import { resolveSurfaceProfile, surfaceProfileDefaults } from "../Procedural/SurfaceProfileProvider.js";
import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { SeededNoise2D } from "../Procedural/Noise/SeededNoise2D.js";
import { copyRgbTripletsToRgba } from "../Canvas/imageDataBuffer.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { createWallFaceAxes, fillWallFaceRows, writeFloorPixel, writeRoofPixel, writeWallCellPixel } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { getTileWorkerBakeConstants } from "./TileWorkerBakeConstants.js";
import { createEmptyBakePhases, createTileBakeMetrics, isTileBakeMetricsEnabled } from "./TileBakeMetrics.js";
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
        this.rgbBuffers = new Map();
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
    getRgbBuffer(numPixels) {
        const size = numPixels * 3;
        if (!this.rgbBuffers.has(size)) this.rgbBuffers.set(size, []);
        const pool = this.rgbBuffers.get(size);
        if (pool.length > 0) return pool.pop();
        return new Float32Array(size);
    }
    releaseRgbBuffer(buffer, numPixels) {
        const pool = this.rgbBuffers.get(numPixels * 3);
        if (pool) pool.push(buffer);
    }
}
export class BakeSession {
    constructor() {
        this.memoryPool = new TileMemoryPool();
        this.noiseEvaluator = new SeededNoise2D(0);
        this.lastMetrics = null;
    }
}
export const globalBakeSession = new BakeSession();
function resolvePaintProfile(profileOrId) {
    if (profileOrId != null && typeof profileOrId === "object") return profileOrId;
    return resolveSurfaceProfile(profileOrId ?? surfaceProfileDefaults.defaultId);
}
/** @param {BakeRequest} req */
export function paintBakeRequest(req, bakeSession = globalBakeSession) {
    paintPixelArea(req.ctx, req.width, req.height, req.startWorldX, req.startWorldY, req.seed, req.paintOptions, resolvePaintProfile(req.profileOrId), bakeSession);
}
/** @param {Omit<BakeRequest, "ctx">} req @returns {OffscreenCanvas} */
export function bakeRequestToCanvas(req, bakeSession = globalBakeSession) {
    const canvas = createOffscreenCanvas(req.width, req.height);
    paintBakeRequest({ ...req, ctx: canvas.getContext("2d") }, bakeSession);
    return canvas;
}
export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, seed, options = {}, profileOrId, bakeSession = globalBakeSession) {
    const metricsOn = isTileBakeMetricsEnabled();
    if (metricsOn) bakeSession.noiseEvaluator.resetProfile();
    const profile = resolvePaintProfile(profileOrId);
    const cellSize = options.cellSize;
    if (cellSize == null) throw new Error("paintPixelArea requires options.cellSize");
    const surfaceBakeScale = options.surfaceBakeScale;
    if (surfaceBakeScale == null) throw new Error("paintPixelArea requires options.surfaceBakeScale");
    const invBakeScale = 1 / surfaceBakeScale;
    let writePixel = writeFloorPixel;
    let mapCtx = { invBakeScale, startWorldX, startWorldY };
    /** @type {{ useWallBase: boolean, wallFace?: boolean, wallCell?: boolean }} */
    let bake = { useWallBase: false };
    if (options.isWall && options.p1 && options.p2) {
        const wf = { p1: options.p1, ...createWallFaceAxes(options.p1, options.p2) };
        if (options.wallHeight == null) throw new Error("paintPixelArea wallFace requires options.wallHeight");
        mapCtx = {
            invBakeScale,
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
        mapCtx = { invBakeScale, startWorldX, startWorldY, spanU: width > 1 ? width - 1 : 1 };
        bake = { useWallBase: true, wallCell: true };
    } else if (options.isWall) {
        writePixel = writeWallCellPixel;
        mapCtx = { invBakeScale, startWorldX, startWorldY, cellSize, zOffset: options.zOffset ?? 0, height, spanU: width > 1 ? width - 1 : 1, invWallCellVSpan: height > 1 ? 1 / (height - 1) : 0 };
        bake = { useWallBase: true, wallCell: true };
    }
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;
    const pooled = bakeSession.memoryPool.getSamples(numPixels);
    const samples = { width, height, evalX: pooled.evalX, evalY: pooled.evalY, lookupX: pooled.lookupX, lookupY: pooled.lookupY, wallU: pooled.wallU, wallV: pooled.wallV };
    if (!metricsOn) {
        if (bake.wallFace) fillWallFaceRows(samples, width, height, mapCtx);
        else {
            let idx = 0;
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++) {
                    writePixel(samples, idx, x, y, mapCtx);
                    idx++;
                }
        }
        const rgbBuffer = composeSurfaceImage(samples, profile, seed, bakeSession, bake);
        copyRgbTripletsToRgba(data, rgbBuffer, numPixels);
        ctx.putImageData(imgData, 0, 0);
        bakeSession.memoryPool.release(pooled, numPixels);
        bakeSession.lastMetrics = null;
        return;
    }
    const phases = createEmptyBakePhases();
    let phaseStart = performance.now();
    if (bake.wallFace) fillWallFaceRows(samples, width, height, mapCtx);
    else {
        let idx = 0;
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                writePixel(samples, idx, x, y, mapCtx);
                idx++;
            }
    }
    phases.sampleFillMs = performance.now() - phaseStart;
    phaseStart = performance.now();
    const rgbBuffer = composeSurfaceImage(samples, profile, seed, bakeSession, bake);
    phases.composeStaticMs = performance.now() - phaseStart;
    phaseStart = performance.now();
    copyRgbTripletsToRgba(data, rgbBuffer, numPixels);
    ctx.putImageData(imgData, 0, 0);
    phases.rgbaCopyMs = performance.now() - phaseStart;
    bakeSession.memoryPool.release(pooled, numPixels);
    bakeSession.lastMetrics = createTileBakeMetrics("paintPixelArea", numPixels, phases, bakeSession.noiseEvaluator.profile);
}
function resolvePaintCellSize(optionsPayload) {
    const cellSize = optionsPayload?.wallWidth ?? getTileWorkerBakeConstants().cellSize;
    return cellSize;
}
function wallPaintOptions(optionsPayload) {
    const { surfaceBakeScale } = getTileWorkerBakeConstants();
    const cellSize = resolvePaintCellSize(optionsPayload);
    return { isWall: true, p1: optionsPayload?.p1, p2: optionsPayload?.p2, surfaceBakeScale, wallHeight: optionsPayload?.wallHeight, wallWidth: cellSize, cellSize };
}
/** @param {object} payload */
export function bakeWallAtlasCanvases(payload, bakeSession = globalBakeSession) {
    const profileId = payload.profileId ?? surfaceProfileDefaults.defaultId;
    const { width, height, seed } = payload;
    return [bakeRequestToCanvas({ width, height, startWorldX: 0, startWorldY: 0, seed, paintOptions: wallPaintOptions(payload), profileOrId: profileId }, bakeSession)];
}
function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, surfaceBakeScale) {
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return { x: minX + startCol * cellSize, y: minY + startRow * cellSize, bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk, surfaceBakeScale) };
}
/** Bake a static ground-chunk canvas. */
export function bakeGroundChunkCanvases(payload, bakeSession = globalBakeSession) {
    const profileId = payload.profileId ?? surfaceProfileDefaults.defaultId;
    const { chunkCol, chunkRow, minX, minY, seed } = payload;
    const { cellSize, cellsPerChunk, surfaceBakeScale } = getTileWorkerBakeConstants();
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, surfaceBakeScale);
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, surfaceBakeScale, isWall: true, roofSurface: true } : { cellSize, surfaceBakeScale };
    const canvas = bakeRequestToCanvas({ width: bakeSize, height: bakeSize, startWorldX: chunkWorldX, startWorldY: chunkWorldY, seed, paintOptions, profileOrId: profileId }, bakeSession);
    return [canvas];
}
/** Bake a world-aligned horizontal patch. */
export function bakeHorizontalPatchCanvases(payload, bakeSession = globalBakeSession) {
    const metricsOn = isTileBakeMetricsEnabled();
    if (metricsOn) bakeSession.noiseEvaluator.resetProfile();
    const profileId = payload.profileId ?? surfaceProfileDefaults.defaultId;
    const baseProfile = resolveSurfaceProfile(profileId);
    const { originX, originY, worldWidth, worldHeight, seed } = payload;
    const { cellSize, surfaceBakeScale } = getTileWorkerBakeConstants();
    const widthPx = bakePixelsForWorldSpan(worldWidth, surfaceBakeScale);
    const heightPx = bakePixelsForWorldSpan(worldHeight, surfaceBakeScale);
    const zLevel = payload.zLevel ?? 0;
    const numPixels = widthPx * heightPx;
    const pooled = bakeSession.memoryPool.getSamples(numPixels);
    const samples = { width: widthPx, height: heightPx, evalX: pooled.evalX, evalY: pooled.evalY, lookupX: pooled.lookupX, lookupY: pooled.lookupY, wallU: pooled.wallU, wallV: pooled.wallV };
    const invBakeScale = 1 / surfaceBakeScale;
    let writePixel = writeFloorPixel;
    let mapCtx = { invBakeScale, startWorldX: originX, startWorldY: originY };
    let bake = { useWallBase: false };
    if (zLevel > 0) {
        writePixel = writeRoofPixel;
        mapCtx = { invBakeScale, startWorldX: originX, startWorldY: originY, spanU: widthPx > 1 ? widthPx - 1 : 1 };
        bake = { useWallBase: true, wallCell: true };
    }
    let idx = 0;
    let phaseStart = metricsOn ? performance.now() : 0;
    for (let y = 0; y < heightPx; y++)
        for (let x = 0; x < widthPx; x++) {
            writePixel(samples, idx, x, y, mapCtx);
            idx++;
        }
    if (!metricsOn) {
        const frameBuffer = bakeSession.memoryPool.getRgbBuffer(numPixels);
        composeSurfaceImage(samples, baseProfile, seed, bakeSession, bake, frameBuffer);
        const canvas = createOffscreenCanvas(widthPx, heightPx);
        const ctx = canvas.getContext("2d");
        const imgData = ctx.createImageData(widthPx, heightPx);
        copyRgbTripletsToRgba(imgData.data, frameBuffer, numPixels);
        ctx.putImageData(imgData, 0, 0);
        const canvases = [canvas];
        bakeSession.memoryPool.releaseRgbBuffer(frameBuffer, numPixels);
        bakeSession.memoryPool.release(pooled, numPixels);
        bakeSession.lastMetrics = null;
        return canvases;
    }
    const phases = createEmptyBakePhases();
    phases.sampleFillMs = performance.now() - phaseStart;
    const frameBuffer = bakeSession.memoryPool.getRgbBuffer(numPixels);
    phaseStart = performance.now();
    composeSurfaceImage(samples, baseProfile, seed, bakeSession, bake, frameBuffer);
    phases.composeStaticMs += performance.now() - phaseStart;
    phaseStart = performance.now();
    const canvas = createOffscreenCanvas(widthPx, heightPx);
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(widthPx, heightPx);
    copyRgbTripletsToRgba(imgData.data, frameBuffer, numPixels);
    ctx.putImageData(imgData, 0, 0);
    phases.rgbaCopyMs += performance.now() - phaseStart;
    const canvases = [canvas];
    bakeSession.memoryPool.releaseRgbBuffer(frameBuffer, numPixels);
    bakeSession.memoryPool.release(pooled, numPixels);
    bakeSession.lastMetrics = createTileBakeMetrics("bakeHorizontalPatch", numPixels, phases, bakeSession.noiseEvaluator.profile);
    return canvases;
}
