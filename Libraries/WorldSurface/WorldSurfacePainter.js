import { resolveSurfaceProfile } from "../../Config/procedural/profiles.js";
import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { SeededNoise2D } from "../Procedural/Noise/SeededNoise2D.js";
import { copyRgbTripletsToRgba } from "../Canvas/canvas.js";
import { createOffscreenCanvas } from "../Canvas/canvas.js";
import { createWallFaceAxes } from "./WallFaceColumns.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { createEmptyBakePhases, createTileBakeMetrics, isTileBakeMetricsEnabled } from "./TileBakeMetrics.js";
let tileWorkerBakeConstants = null;
export function installTileWorkerBakeConstants(constants) {
    tileWorkerBakeConstants = constants;
}
export function getTileWorkerBakeConstants() {
    if (!tileWorkerBakeConstants) throw new Error("Tile worker bake constants not installed");
    return tileWorkerBakeConstants;
}
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
    return resolveSurfaceProfile(profileOrId);
}
function writeFloorPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + y * invBakeScale;
    samples.wallU[idx] = 0;
    samples.wallV[idx] = 0;
}
function fillWallFaceRows(samples, width, height, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    const H = mapCtx.wallHeight;
    const W = mapCtx.wallWidth;
    const heightPx = mapCtx.height;
    const dirX = mapCtx.dirX;
    const dirY = mapCtx.dirY;
    const foldX = mapCtx.foldX;
    const foldY = mapCtx.foldY;
    const invEdgeLen = mapCtx.invEdgeLen;
    const p1x = mapCtx.p1x;
    const p1y = mapCtx.p1y;
    let idx = 0;
    for (let y = 0; y < height; y++) {
        const v = (heightPx - 1 - y) * invBakeScale;
        let evalXBase;
        let evalYBase;
        let wallV;
        if (v < W) {
            const foldOffset = H + v;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = 1;
        } else {
            const z = H + W - v;
            const foldOffset = z;
            evalXBase = p1x + foldX * foldOffset;
            evalYBase = p1y + foldY * foldOffset;
            wallV = z / H;
        }
        for (let x = 0; x < width; x++, idx++) {
            const dist = x * invBakeScale;
            samples.evalX[idx] = evalXBase + dist * dirX;
            samples.evalY[idx] = evalYBase + dist * dirY;
            samples.wallU[idx] = dist * invEdgeLen;
            samples.wallV[idx] = wallV;
        }
    }
}
function writeWallCellPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + (mapCtx.cellSize - y * invBakeScale) + mapCtx.zOffset;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = (mapCtx.height - 1 - y) * mapCtx.invWallCellVSpan;
}
function writeRoofPixel(samples, idx, x, y, mapCtx) {
    const invBakeScale = mapCtx.invBakeScale;
    samples.evalX[idx] = mapCtx.startWorldX + x * invBakeScale;
    samples.evalY[idx] = mapCtx.startWorldY + y * invBakeScale;
    samples.wallU[idx] = x / mapCtx.spanU;
    samples.wallV[idx] = 1;
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
    const { width, height, seed, profileId } = payload;
    return [bakeRequestToCanvas({ width, height, startWorldX: 0, startWorldY: 0, seed, paintOptions: wallPaintOptions(payload), profileOrId: profileId }, bakeSession)];
}
/** Bake a static ground-chunk canvas. */
export function bakeGroundChunkCanvases(payload, bakeSession = globalBakeSession) {
    const { minX, minY, seed, profileId } = payload;
    const { cellSize, cellsPerChunk, surfaceBakeScale } = getTileWorkerBakeConstants();
    const bakeSize = bakePixelsForWorldSpan(cellSize * cellsPerChunk, surfaceBakeScale);
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, surfaceBakeScale, isWall: true, roofSurface: true } : { cellSize, surfaceBakeScale };
    const canvas = bakeRequestToCanvas({ width: bakeSize, height: bakeSize, startWorldX: minX, startWorldY: minY, seed, paintOptions, profileOrId: profileId }, bakeSession);
    return [canvas];
}
