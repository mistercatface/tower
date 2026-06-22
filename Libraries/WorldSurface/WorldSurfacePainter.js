import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { SeededNoise2D } from "../Procedural/Noise/SeededNoise2D.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { copyRgbTripletsToRgba } from "../Canvas/imageDataBuffer.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { createWallFaceAxes, fillWallFaceRows, writeFloorPixel, writeRoofPixel, writeWallCellPixel } from "./SurfaceCoordinateMapper.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
import { getTileWorkerBakeConstants } from "./TileWorkerBakeConstants.js";
import { getAnimationFrames, resolveBakeProfile } from "./ProfileBakeResolver.js";
import { sourceFrameIndexForBakeSlot } from "./AnimationFrameBake.js";
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
    const provider = getSurfaceProfileProvider();
    return provider.getProfile(profileOrId ?? provider.defaultId);
}
function resolveBakeRequestProfile(req) {
    return req.resolvePayload ? resolveBakeProfile(req.baseProfile, req.profileKey, req.resolvePayload) : resolvePaintProfile(req.profileOrId);
}
/** @param {BakeRequest} req */
export function paintBakeRequest(req, bakeSession = globalBakeSession) {
    paintPixelArea(req.ctx, req.width, req.height, req.startWorldX, req.startWorldY, req.seed, req.paintOptions, resolveBakeRequestProfile(req), bakeSession);
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
function getFirstAnimatedMotifIndex(profile) {
    const anim = profile.animation;
    if (!anim) return null;
    let firstIdx = null;
    const stages = anim.stages || [];
    for (const stage of stages) {
        if (!stage.tracks) continue;
        for (const track of stage.tracks) {
            if (!track.targetPath) continue;
            const match = track.targetPath.match(/^motifs\[(\d+)\]/);
            if (match) {
                const idx = parseInt(match[1], 10);
                if (firstIdx === null || idx < firstIdx) firstIdx = idx;
            }
        }
    }
    return firstIdx;
}
/** @param {object} payload */
export function bakeWallAtlasCanvases(payload, bakeSession = globalBakeSession) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const useResolver = Boolean(baseProfile.animation);
    if (useResolver) payload.frameIndex = 0;
    const { width, height, seed } = payload;
    return [
        bakeRequestToCanvas(
            {
                width,
                height,
                startWorldX: 0,
                startWorldY: 0,
                seed,
                paintOptions: wallPaintOptions(payload),
                profileOrId: profileId,
                ...(useResolver ? { resolvePayload: payload, baseProfile, profileKey: profileId } : {}),
            },
            bakeSession,
        ),
    ];
}
function chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, surfaceBakeScale) {
    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    return { x: minX + startCol * cellSize, y: minY + startRow * cellSize, bakeSize: bakePixelsForWorldSpan(cellSize * cellsPerChunk, surfaceBakeScale) };
}
/** Bake a static ground-chunk canvas (frame 0 when the profile has a timeline). */
export function bakeGroundChunkCanvases(payload, bakeSession = globalBakeSession) {
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { chunkCol, chunkRow, minX, minY, seed } = payload;
    const { cellSize, cellsPerChunk, surfaceBakeScale } = getTileWorkerBakeConstants();
    const { x: chunkWorldX, y: chunkWorldY, bakeSize } = chunkWorldOrigin(chunkCol, chunkRow, minX, minY, cellsPerChunk, cellSize, surfaceBakeScale);
    const zLevel = payload.zLevel ?? 0;
    const paintOptions = zLevel > 0 ? { cellSize, surfaceBakeScale, isWall: true, roofSurface: true } : { cellSize, surfaceBakeScale };
    const useResolver = Boolean(baseProfile.animation);
    if (useResolver) payload.frameIndex = 0;
    const canvas = bakeRequestToCanvas(
        {
            width: bakeSize,
            height: bakeSize,
            startWorldX: chunkWorldX,
            startWorldY: chunkWorldY,
            seed,
            paintOptions,
            profileOrId: profileId,
            ...(useResolver ? { resolvePayload: payload, baseProfile, profileKey: profileId } : {}),
        },
        bakeSession,
    );
    return [canvas];
}
/** Bake a world-aligned horizontal patch (animated surface playfield / rail band). */
export function bakeHorizontalPatchCanvases(payload, bakeSession = globalBakeSession) {
    const metricsOn = isTileBakeMetricsEnabled();
    if (metricsOn) bakeSession.noiseEvaluator.resetProfile();
    const provider = getSurfaceProfileProvider();
    const profileId = payload.profileId ?? provider.defaultId;
    const baseProfile = provider.getProfile(profileId);
    const { frameStart, frameCount } = payload;
    const { originX, originY, worldWidth, worldHeight, seed } = payload;
    const { cellSize, surfaceBakeScale } = getTileWorkerBakeConstants();
    const widthPx = bakePixelsForWorldSpan(worldWidth, surfaceBakeScale);
    const heightPx = bakePixelsForWorldSpan(worldHeight, surfaceBakeScale);
    const useResolver = Boolean(baseProfile.animation);
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
    const firstAnimIdx = useResolver ? getFirstAnimatedMotifIndex(baseProfile) : null;
    if (!metricsOn) {
        let staticBuffer = null;
        if (useResolver && firstAnimIdx !== null && firstAnimIdx > 0) staticBuffer = composeSurfaceImage(samples, baseProfile, seed, bakeSession, bake, null, 0, firstAnimIdx);
        const canvases = [];
        const sourceTotal = getAnimationFrames(baseProfile.animation);
        const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
        for (let i = 0; i < frameCount; i++) {
            payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
            const frameProfile = useResolver ? resolveBakeProfile(baseProfile, profileId, payload) : resolvePaintProfile(profileId);
            let frameBuffer;
            if (staticBuffer) {
                frameBuffer = new Float32Array(staticBuffer);
                composeSurfaceImage(samples, frameProfile, seed, bakeSession, bake, frameBuffer, firstAnimIdx, undefined);
            } else frameBuffer = composeSurfaceImage(samples, frameProfile, seed, bakeSession, bake);
            const canvas = createOffscreenCanvas(widthPx, heightPx);
            const ctx = canvas.getContext("2d");
            const imgData = ctx.createImageData(widthPx, heightPx);
            copyRgbTripletsToRgba(imgData.data, frameBuffer, numPixels);
            ctx.putImageData(imgData, 0, 0);
            canvases.push(canvas);
        }
        bakeSession.memoryPool.release(pooled, numPixels);
        bakeSession.lastMetrics = null;
        return canvases;
    }
    const phases = createEmptyBakePhases();
    phases.sampleFillMs = performance.now() - phaseStart;
    let staticBuffer = null;
    if (useResolver && firstAnimIdx !== null && firstAnimIdx > 0) {
        phaseStart = performance.now();
        staticBuffer = composeSurfaceImage(samples, baseProfile, seed, bakeSession, bake, null, 0, firstAnimIdx);
        phases.composeStaticMs = performance.now() - phaseStart;
    }
    const canvases = [];
    const sourceTotal = getAnimationFrames(baseProfile.animation);
    const bakeTotal = payload.animationBakeFrames ?? sourceTotal;
    for (let i = 0; i < frameCount; i++) {
        payload.frameIndex = sourceFrameIndexForBakeSlot(frameStart + i, bakeTotal, sourceTotal);
        const frameProfile = useResolver ? resolveBakeProfile(baseProfile, profileId, payload) : resolvePaintProfile(profileId);
        let frameBuffer;
        phaseStart = performance.now();
        if (staticBuffer) {
            frameBuffer = new Float32Array(staticBuffer);
            composeSurfaceImage(samples, frameProfile, seed, bakeSession, bake, frameBuffer, firstAnimIdx, undefined);
            phases.composeFrameMs += performance.now() - phaseStart;
        } else {
            frameBuffer = composeSurfaceImage(samples, frameProfile, seed, bakeSession, bake);
            const composeMs = performance.now() - phaseStart;
            if (frameCount === 1) phases.composeStaticMs += composeMs;
            else phases.composeFrameMs += composeMs;
        }
        phaseStart = performance.now();
        const canvas = createOffscreenCanvas(widthPx, heightPx);
        const ctx = canvas.getContext("2d");
        const imgData = ctx.createImageData(widthPx, heightPx);
        copyRgbTripletsToRgba(imgData.data, frameBuffer, numPixels);
        ctx.putImageData(imgData, 0, 0);
        phases.rgbaCopyMs += performance.now() - phaseStart;
        canvases.push(canvas);
    }
    bakeSession.memoryPool.release(pooled, numPixels);
    bakeSession.lastMetrics = createTileBakeMetrics("bakeHorizontalPatch", numPixels, phases, bakeSession.noiseEvaluator.profile);
    return canvases;
}
