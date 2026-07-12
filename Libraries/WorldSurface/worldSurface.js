import { setNoiseProfileEnabled, SeededNoise2D } from "../Procedural/Noise/SeededNoise2D.js";
import { minCornerAabbF32, intersectAabbOptionalF32 } from "../Math/math.js";
import { ENGINE_F32, ENGINE_BOUNDS_BASE, B_CELL, B_FOOTPRINT, B_TMP } from "../../Core/engineMemory.js";
import { projectWorldAabbCorners, boundsToCellRect, resolveCellWallHeightAtIdx, resolveChunkSurfaceProfileIdAtKey, packChunkKey, worldToChunkKey, chunkKeyBounds, wrapChunkKey, forEachChunkKeyInRange, forEachChunkKeyInCellBounds, cellIdxToChunkKey } from "../Spatial/spatial.js";
import { LruMap } from "../DataStructures/LruMap.js";
import { releaseOffscreenCanvas, drawImageQuadScalars, copyRgbTripletsToRgba, createOffscreenCanvas, traceAabbRect, clipToPath, composeDestinationIn } from "../Canvas/canvas.js";
import { registerRuntimeSurfaceProfile, resolveSurfaceProfile, shippedSurfaceProfileIds, surfaceProfileKnown } from "../../Config/procedural/profiles.js";
import { PromiseWorkerPoolHost } from "../Workers/PromiseWorkerPoolHost.js";
import { MinHeap } from "../DataStructures/MinHeap.js";
import { composeSurfaceImage } from "../Procedural/SurfaceTextureComposer.js";
import { railWallFootprintAabbF32, railWallAtZLevel, chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, defaultWallCapPx, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { VIEW_TIER } from "../Viewport/ViewBounds.js";
/** Runtime profile revision counters — bumped when TileLab/game registers edited profiles. */
const revisions = new Map();
export function getSurfaceProfileRevision(profileId) {
    return revisions.get(profileId) ?? 0;
}
/** @returns {number} New revision after bump. */
export function bumpSurfaceProfileRevision(profileId) {
    const rev = (revisions.get(profileId) ?? 0) + 1;
    revisions.set(profileId, rev);
    return rev;
}
export const TILE_WORKER_MESSAGE = { CONFIGURE_BAKE_CONSTANTS: "configureBakeConstants", BAKE_GROUND_CHUNK: "bakeGroundChunk", BAKE_WALL_ATLAS: "bakeWallAtlas", REGISTER_RUNTIME_PROFILE: "registerRuntimeProfile" };
export const EMPTY_BAKE_TIMING_STATS = { sampleCount: 0, sampleFillMs: 0, composeStaticMs: 0, composeFrameMs: 0, rgbaCopyMs: 0, transferMs: 0, noiseCallsPerPixel: 0, noiseHitRate: 0, noiseOverflowRate: 0 };
let tileBakeMetricsEnabled = false;
export function isTileBakeMetricsEnabled() {
    return tileBakeMetricsEnabled;
}
export function setTileBakeMetricsEnabled(enabled) {
    tileBakeMetricsEnabled = Boolean(enabled);
    setNoiseProfileEnabled(enabled);
}
export function createEmptyBakePhases() {
    return { sampleFillMs: 0, composeStaticMs: 0, composeFrameMs: 0, rgbaCopyMs: 0, transferMs: 0 };
}
export function createNoiseProfileSnapshot(profile, numPixels) {
    const calls = profile.calls;
    return { calls, hits: profile.hits, overflows: profile.overflows, numPixels, callsPerPixel: numPixels > 0 ? calls / numPixels : 0, hitRate: calls > 0 ? profile.hits / calls : 0, overflowRate: calls > 0 ? profile.overflows / calls : 0 };
}
export function createTileBakeMetrics(jobType, numPixels, phases, noiseProfile) {
    return { jobType, numPixels, phases: { ...phases }, noise: createNoiseProfileSnapshot(noiseProfile, numPixels) };
}
export class TileBakeMetricsAccumulator {
    constructor(windowSize = 32) {
        this.windowSize = windowSize;
        this.samples = [];
    }
    record(metrics) {
        if (!metrics) return;
        this.samples.push(metrics);
        if (this.samples.length > this.windowSize) this.samples.shift();
    }
    averages() {
        if (this.samples.length === 0) return { ...EMPTY_BAKE_TIMING_STATS };
        let sampleFillMs = 0;
        let composeStaticMs = 0;
        let composeFrameMs = 0;
        let rgbaCopyMs = 0;
        let transferMs = 0;
        let noiseCallsPerPixel = 0;
        let noiseHitRate = 0;
        let noiseOverflowRate = 0;
        const n = this.samples.length;
        for (let i = 0; i < n; i++) {
            const sample = this.samples[i];
            const phases = sample.phases;
            sampleFillMs += phases.sampleFillMs;
            composeStaticMs += phases.composeStaticMs;
            composeFrameMs += phases.composeFrameMs;
            rgbaCopyMs += phases.rgbaCopyMs;
            transferMs += phases.transferMs ?? 0;
            noiseCallsPerPixel += sample.noise.callsPerPixel;
            noiseHitRate += sample.noise.hitRate;
            noiseOverflowRate += sample.noise.overflowRate;
        }
        return { sampleCount: n, sampleFillMs: sampleFillMs / n, composeStaticMs: composeStaticMs / n, composeFrameMs: composeFrameMs / n, rgbaCopyMs: rgbaCopyMs / n, transferMs: transferMs / n, noiseCallsPerPixel: noiseCallsPerPixel / n, noiseHitRate: noiseHitRate / n, noiseOverflowRate: noiseOverflowRate / n };
    }
}
export function formatTileBakeMetricsLog(type, metrics, transferMs = 0) {
    const phases = metrics.phases;
    const noise = metrics.noise;
    return `[TileWorker] ${type} | sampleFill: ${phases.sampleFillMs.toFixed(2)}ms` + ` | composeStatic: ${phases.composeStaticMs.toFixed(2)}ms` + ` | composeFrame: ${phases.composeFrameMs.toFixed(2)}ms` + ` | rgbaCopy: ${phases.rgbaCopyMs.toFixed(2)}ms` + ` | transfer: ${transferMs.toFixed(2)}ms` + ` | noise: ${noise.callsPerPixel.toFixed(2)} calls/px` + ` hit ${(noise.hitRate * 100).toFixed(1)}%` + ` overflow ${(noise.overflowRate * 100).toFixed(1)}%` + ` (${metrics.numPixels}px)`;
}
export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCacheKey(chunkKey, profileId, profileRevision, zLevel = 0) {
    return `chunk:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkKey}`;
}
export function staticRoofMaskCacheKey(chunkKey, zLevel) {
    return `staticRoofMask:${horizontalZCacheTag(zLevel)}:${chunkKey}`;
}
export function staticRoofDrawCacheKey(chunkKey, profileId, profileRevision, zLevel) {
    return `staticRoofDraw:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkKey}`;
}
export function groundChunkWorkerDedupeKey(payload, profileRevision) {
    const chunkKey = payload.tileChunkKey ?? payload.chunkKey;
    return `${groundChunkCacheKey(chunkKey, payload.profileId, profileRevision, payload.zLevel ?? 0)}:${payload.seed ?? 0}`;
}
export function wallAtlasWorkerDedupeKey(payload, profileRevision) {
    const p1 = payload.p1;
    const p2 = payload.p2;
    return `wall:${profileRevision}:${payload.profileId}:${p1.x.toFixed(1)},${p1.y.toFixed(1)}-${p2.x.toFixed(1)},${p2.y.toFixed(1)}:${payload.width}x${payload.height}:${payload.wallHeight ?? 0}:${payload.seed ?? 0}`;
}
export class SurfaceBakeCacheKeys {
    constructor(surfaceSpace) {
        this.surfaceSpace = surfaceSpace;
    }
    wrappedChunkKey(chunkKey) {
        return this.surfaceSpace.wrappedChunkKey(chunkKey);
    }
    groundChunkKey(chunkKey, profileId, zLevel = 0) {
        const wrapped = this.wrappedChunkKey(chunkKey);
        return groundChunkCacheKey(wrapped, profileId, getSurfaceProfileRevision(profileId), zLevel);
    }
    staticRoofMaskKey(chunkKey, zLevel) {
        return staticRoofMaskCacheKey(chunkKey, zLevel);
    }
    staticRoofDrawKey(chunkKey, profileId, zLevel) {
        return staticRoofDrawCacheKey(chunkKey, profileId, getSurfaceProfileRevision(profileId), zLevel);
    }
    wallAtlasKeyScalars(x1, y1, x2, y2, surfaceSeed, profileId, atlasHeight) {
        const atlas = this.surfaceSpace.wallAtlasScalars(x1, y1, x2, y2);
        const rev = getSurfaceProfileRevision(profileId);
        const key = `wall:${rev}:${profileId}:${surfaceSeed}:${atlasHeight}:${atlas.keyX1},${atlas.keyY1}-${atlas.keyX2},${atlas.keyY2}`;
        return { key, wrappedP1: atlas.wrappedP1, wrappedP2: atlas.wrappedP2, rev };
    }
    wallAtlasKey(p1, p2, surfaceSeed, profileId, atlasHeight) {
        return this.wallAtlasKeyScalars(p1.x, p1.y, p2.x, p2.y, surfaceSeed, profileId, atlasHeight);
    }
}
export function createWallFaceAxes(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const edgeLen = Math.hypot(dx, dy);
    if (edgeLen <= 0) return { edgeLen: 0, dirX: 0, dirY: 0, foldX: 0, foldY: 0 };
    const dirX = dx / edgeLen;
    const dirY = dy / edgeLen;
    return { edgeLen, dirX, dirY, foldX: -dirY, foldY: dirX };
}
/** World-aligned slices along a wall base edge (stable when the camera moves). */
export function wallFaceColumns(p1, p2, cellSize) {
    const { edgeLen, dirX: edgeDirX, dirY: edgeDirY } = createWallFaceAxes(p1, p2);
    if (edgeLen < 0.001) return [];
    const uStart = p1.x * edgeDirX + p1.y * edgeDirY;
    const uEnd = uStart + edgeLen;
    const firstTile = Math.floor(uStart / cellSize);
    const lastTile = Math.ceil(uEnd / cellSize);
    const columns = [];
    for (let tile = firstTile; tile < lastTile; tile++) {
        const u0World = tile * cellSize;
        const u1World = (tile + 1) * cellSize;
        let u0 = (u0World - uStart) / edgeLen;
        let u1 = (u1World - uStart) / edgeLen;
        u0 = Math.max(0, Math.min(1, u0));
        u1 = Math.max(0, Math.min(1, u1));
        if (u1 - u0 < 1e-6) continue;
        const midU = (u0 + u1) * 0.5;
        columns.push({ u0, u1, worldX: p1.x + (p2.x - p1.x) * midU, worldY: p1.y + (p2.y - p1.y) * midU });
    }
    return columns;
}
const WALL_CHUNK_TEXTURE_SAMPLE_CHUNK = 0;
function positiveModulo(value, period) {
    return ((value % period) + period) % period;
}
export class SurfaceSpatialMap {
    constructor(settings) {
        this.settings = settings;
        this._boundsBank = new Float32Array(16);
    }
    get _cellBoundsO() {
        return 0;
    }
    get _pointsO() {
        return 4;
    }
    get _chunkBoundsO() {
        return 8;
    }
    get chunkDrawBoundsO() {
        return 12;
    }
    chunkSizePx(obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        return obstacleGrid.cellSize * cellsPerChunk;
    }
    chunkBoundsF32(buf, o, obstacleGrid, chunkKey, cellsPerChunk = this.settings.cellsPerChunk) {
        const sizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        chunkKeyBounds(buf, o, obstacleGrid.minX, obstacleGrid.minY, chunkKey, sizePx);
    }
    surfaceTileChunks(cellsPerChunk = this.settings.cellsPerChunk) {
        return this.settings.surfaceTilePeriodCells / cellsPerChunk;
    }
    wrappedChunkKey(chunkKey, cellsPerChunk = this.settings.cellsPerChunk) {
        return wrapChunkKey(chunkKey, this.surfaceTileChunks(cellsPerChunk));
    }
    tileChunkBoundsF32(buf, o, obstacleGrid, chunkKey, cellsPerChunk = this.settings.cellsPerChunk) {
        this.chunkBoundsF32(buf, o, obstacleGrid, this.wrappedChunkKey(chunkKey, cellsPerChunk), cellsPerChunk);
    }
    viewportChunkKeyRangeF32(buf, o, obstacleGrid, chunkSizePx) {
        return this.boundsToChunkKeyRangeF32(buf, o, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    boundsToChunkKeyRangeF32(buf, o, gridMinX, gridMinY, chunkSizePx) {
        return { startKey: worldToChunkKey(buf[o], buf[o + 1], gridMinX, gridMinY, chunkSizePx), endKey: worldToChunkKey(buf[o + 2] - 1, buf[o + 3] - 1, gridMinX, gridMinY, chunkSizePx) };
    }
    wallAtlasScalars(x1, y1, x2, y2) {
        const surfaceTilePeriodPx = this.settings.surfaceTilePeriodPx;
        const wx1 = positiveModulo(x1, surfaceTilePeriodPx);
        const wy1 = positiveModulo(y1, surfaceTilePeriodPx);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        return { wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, keyX1: wx1.toFixed(1), keyY1: wy1.toFixed(1), keyX2: wx2.toFixed(1), keyY2: wy2.toFixed(1) };
    }
    wallAtlas(p1, p2) {
        return this.wallAtlasScalars(p1.x, p1.y, p2.x, p2.y);
    }
    flatHorizontalSample(worldCorners8, obstacleGrid) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < 4; i++) {
            const px = worldCorners8[i * 2];
            const py = worldCorners8[i * 2 + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }
        const chunkKey = worldToChunkKey(minX, minY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
        this.chunkBoundsF32(this._boundsBank, this._chunkBoundsO, obstacleGrid, chunkKey);
        const b = this._boundsBank;
        const o = this._chunkBoundsO;
        return { chunkKey, chunkSizePx, minX: b[o], minY: b[o + 1], maxX: b[o + 2], maxY: b[o + 3] };
    }
    wallChunkTextureSample(cellSize) {
        const chunkSizePx = cellSize * this.settings.cellsPerChunk;
        const chunkKey = packChunkKey(WALL_CHUNK_TEXTURE_SAMPLE_CHUNK, WALL_CHUNK_TEXTURE_SAMPLE_CHUNK);
        minCornerAabbF32(this._boundsBank, this._chunkBoundsO, 0, 0, chunkSizePx, chunkSizePx);
        const b = this._boundsBank;
        const o = this._chunkBoundsO;
        return { chunkKey, chunkSizePx, minX: b[o], minY: b[o + 1], maxX: b[o + 2], maxY: b[o + 3], centerX: (b[o] + b[o + 2]) / 2, centerY: (b[o + 1] + b[o + 3]) / 2 };
    }
}
/** LRU cache of baked surface ImageBitmap arrays (world chunks + wall atlases). */
export class SurfaceBitmapCache {
    constructor(maxEntries = 2046) {
        this.maxEntries = maxEntries;
        this.cache = new LruMap(maxEntries, {
            onEvict: (key, value) => {
                this._closeOrphanedBitmaps(value, null);
                this._dropEntry(key);
            },
        });
        this._generation = new Map();
        this._globalGeneration = 0;
    }
    _dropEntry(key) {
        this._generation.delete(key);
    }
    get(key) {
        const value = this.cache.get(key);
        return value === undefined ? null : value;
    }
    peek(key) {
        const value = this.cache.peek(key);
        return value === undefined ? null : value;
    }
    _closeOrphanedBitmaps(oldVal, newVal) {
        if (!oldVal) return;
        const isReused = (item) => {
            if (!newVal) return false;
            if (Array.isArray(newVal)) return newVal.includes(item);
            return newVal === item;
        };
        const disposeItem = (item) => {
            if (isReused(item)) return;
            if (item instanceof ImageBitmap) item.close();
            else if (item instanceof OffscreenCanvas) releaseOffscreenCanvas(item);
        };
        if (Array.isArray(oldVal)) for (const item of oldVal) disposeItem(item);
        else disposeItem(oldVal);
    }
    set(key, value) {
        const existing = this.peek(key);
        if (existing && existing !== value) this._closeOrphanedBitmaps(existing, value);
        this.cache.set(key, value);
    }
    delete(key) {
        const existing = this.cache.peek(key);
        if (existing !== undefined) {
            this._closeOrphanedBitmaps(existing, null);
            this.cache.delete(key);
            this._dropEntry(key);
        }
    }
    deleteByPrefix(prefix) {
        for (const key of [...this.cache.keys()]) if (key.startsWith(prefix)) this.delete(key);
    }
    clear() {
        for (const value of this.cache.values()) this._closeOrphanedBitmaps(value, null);
        this.cache.clear();
        this._generation.clear();
    }
    /** True while any cached surface is still waiting on its worker bake. */
    hasPlaceholders() {
        for (const value of this.cache.values()) if (Array.isArray(value) && value[0]?.isPlaceholder) return true;
        return false;
    }
    getOrStart(key) {
        let canvases = this.get(key);
        if (canvases) return canvases;
        const placeholder = [{ isPlaceholder: true }];
        this.set(key, placeholder);
        this._generation.set(key, ++this._globalGeneration);
        return placeholder;
    }
    isValidGeneration(key, generation) {
        return this._generation.get(key) === generation;
    }
    getCurrentGeneration(key) {
        return this._generation.get(key);
    }
    commitBake(key, generation, bitmaps) {
        if (!this.isValidGeneration(key, generation)) {
            bitmaps.forEach((b) => b.close());
            return;
        }
        if (!bitmaps?.length || !isDrawableBakedSurface(bitmaps[0])) {
            if (bitmaps) for (const b of bitmaps) if (b && typeof b.close === "function") b.close();
            return;
        }
        const existing = this.peek(key);
        if (existing?.[0]?.isPlaceholder === true) this.set(key, bitmaps);
        else if (existing !== bitmaps) bitmaps.forEach((b) => b.close());
    }
}
export const EMPTY_TILE_BAKE_STATS = { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0, bakeTiming: { ...EMPTY_BAKE_TIMING_STATS } };
/**
 * Main-thread tile surface bake client — pool, scheduler, profile sync, and request API.
 */
export class TileSurfaceWorkerClient {
    constructor(workerUrl, options = {}) {
        this.workerUrl = workerUrl;
        this.workerReady = Promise.resolve();
        this.registeredRuntimeProfileIds = new Set();
        this.pendingFocusX = 0;
        this.pendingFocusY = 0;
        this._started = false;
        if (options.pool && options.scheduler) {
            this.pool = options.pool;
            this.scheduler = options.scheduler;
        } else {
            this.pool = new PromiseWorkerPoolHost(workerUrl, { name: "TileSurfaceWorker", onJobComplete: (workerIndex, result) => this.scheduler.finishJob(workerIndex, result) });
            this.scheduler = new TileBakeScheduler(this.pool, { getProfileRevision: getSurfaceProfileRevision });
        }
    }
    _whenWorkersReady(run) {
        return Promise.resolve(this.workerReady).then(run);
    }
    _ensureStarted() {
        if (this._started) return;
        this.scheduler.updateFocus(this.pendingFocusX, this.pendingFocusY);
        this.pool.ensureStarted();
        this._started = true;
    }
    _sendRequest(type, payload, tier = TILE_BAKE_TIER.STATIC) {
        this._ensureStarted();
        return this._whenWorkersReady(() => this.scheduler.enqueue(type, payload, tier));
    }
    _broadcastRequest(type, payload) {
        this._ensureStarted();
        return this.scheduler.broadcast(type, payload);
    }
    _ensureRuntimeProfileOnWorkers(profileId) {
        if (!profileId) return this._whenWorkersReady(() => {});
        if (shippedSurfaceProfileIds().includes(profileId)) return this._whenWorkersReady(() => {});
        if (!surfaceProfileKnown(profileId)) return Promise.reject(new Error(`Unknown surface procedural profile: ${profileId}`));
        if (this.registeredRuntimeProfileIds.has(profileId)) return this.workerReady;
        const profile = resolveSurfaceProfile(profileId);
        if (!profile.id) profile.id = profileId;
        return this.registerRuntimeProfile(profile);
    }
    _requestProfileBake(type, payload, tier) {
        const profileId = payload.profileId;
        return this._ensureRuntimeProfileOnWorkers(profileId).then(() => {
            return this._sendRequest(type, payload, tier);
        });
    }
    updateFocus(x, y) {
        this.pendingFocusX = x;
        this.pendingFocusY = y;
        if (this._started) this.scheduler.updateFocus(x, y);
    }
    stats() {
        return this._started ? this.scheduler.stats() : { ...EMPTY_TILE_BAKE_STATS };
    }
    enableTileBakeMetrics(enabled = true) {
        setTileBakeMetricsEnabled(enabled);
        if (!this._started) return Promise.resolve();
        return this._broadcastRequest(TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS, { metricsEnabled: enabled });
    }
    requestGroundChunkBake(payload) {
        return this._requestProfileBake(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, payload, TILE_BAKE_TIER.STATIC);
    }
    requestWallAtlasBake(payload) {
        return this._requestProfileBake(TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS, payload, TILE_BAKE_TIER.STATIC);
    }
    registerRuntimeProfile(profile) {
        registerRuntimeSurfaceProfile(profile);
        bumpSurfaceProfileRevision(profile.id);
        this._ensureStarted();
        this.registeredRuntimeProfileIds.add(profile.id);
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, profile));
        return this.workerReady;
    }
    syncBakeConstants(settings) {
        const constants = { cellSize: settings.cellSize, cellsPerChunk: settings.cellsPerChunk, surfaceBakeScale: settings.surfaceBakeScale, surfaceTilePeriodPx: settings.surfaceTilePeriodPx, metricsEnabled: settings.metricsEnabled };
        this._ensureStarted();
        this.workerReady = this.workerReady.then(() => this._broadcastRequest(TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS, constants));
        return this.workerReady;
    }
    shutdown() {
        if (!this._started) return;
        this.pool.shutdown();
        this._started = false;
    }
}
/** @type {TileSurfaceWorkerClient | null} */
let client = null;
/**
 * @param {{ workerUrl: URL | string }} config — game injects Render/WorldSurface/TileWorkerEntry.js
 */
export function configureTileWorkerCoordinator({ workerUrl }) {
    client = new TileSurfaceWorkerClient(workerUrl);
}
function requireClient() {
    if (!client) throw new Error("TileWorkerCoordinator requires configureTileWorkerCoordinator({ workerUrl }) from game bootstrap");
    return client;
}
export const TileWorkerCoordinator = {
    updateFocus(x, y) {
        client?.updateFocus(x, y);
    },
    stats() {
        return client?.stats() ?? EMPTY_TILE_BAKE_STATS;
    },
    enableTileBakeMetrics(enabled = true) {
        return requireClient().enableTileBakeMetrics(enabled);
    },
    requestGroundChunkBake(payload) {
        return requireClient().requestGroundChunkBake(payload);
    },
    requestWallAtlasBake(payload) {
        return requireClient().requestWallAtlasBake(payload);
    },
    registerRuntimeProfile(profile) {
        return requireClient().registerRuntimeProfile(profile);
    },
    syncBakeConstants(settings) {
        return requireClient().syncBakeConstants(settings);
    },
};
export const TILE_BAKE_TIER = { REGISTRATION: -1, STATIC: 0 };
const FOCUS_RESORT_DIST_SQ = 16 * 16;
function compareJobs(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.distSq - b.distSq;
}
function profileIdFromPayload(payload) {
    return payload?.profileId ?? payload?.id;
}
function dedupeKeyFor(type, payload, tier, getProfileRevision) {
    if (tier === TILE_BAKE_TIER.REGISTRATION) return null;
    const rev = getProfileRevision(profileIdFromPayload(payload));
    if (type === TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK) return groundChunkWorkerDedupeKey(payload, rev);
    if (type === TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS) return wallAtlasWorkerDedupeKey(payload, rev);
    return null;
}
/**
 * Priority queue + promise lifecycle for tile surface worker bakes.
 * Job tiers drain registration → static; within a tier jobs sort by distance to focus.
 */
export class TileBakeScheduler {
    constructor(pool, options = {}) {
        this.pool = pool;
        this.getProfileRevision = options.getProfileRevision ?? (() => 0);
        this.queue = new MinHeap(compareJobs);
        this.pending = new Map();
        this.inFlightByKey = new Map();
        this.nextReqId = 1;
        this.focusX = 0;
        this.focusY = 0;
        this.sortFocusX = 0;
        this.sortFocusY = 0;
        this.metricsAccumulator = new TileBakeMetricsAccumulator();
    }
    updateFocus(x, y) {
        this.focusX = x;
        this.focusY = y;
    }
    stats() {
        let busyWorkers = 0;
        if (this.pool._started)
            this.pool.forEachSlot((_index, slot) => {
                if (slot.busy) busyWorkers++;
            });
        return { queueSize: this.queue.size, pendingCount: this.pending.size, inFlightDedupeCount: this.inFlightByKey.size, busyWorkers, bakeTiming: this.metricsAccumulator.averages() };
    }
    enqueue(type, payload, tier) {
        const dedupeKey = dedupeKeyFor(type, payload, tier, this.getProfileRevision);
        if (dedupeKey) {
            const existing = this.inFlightByKey.get(dedupeKey);
            if (existing) return existing;
        }
        const promise = new Promise((resolve, reject) => {
            const id = this.nextReqId++;
            this.pending.set(id, { resolve, reject, dedupeKey });
            const job = { id, type, payload, tier, revision: this.getProfileRevision(profileIdFromPayload(payload)), distSq: this._jobDistSq(payload), dedupeKey };
            this.queue.push(job);
            this._dispatch();
        });
        if (dedupeKey) this.inFlightByKey.set(dedupeKey, promise);
        return promise;
    }
    finishJob(_workerIndex, { id, bitmaps, error, metrics }) {
        if (metrics && isTileBakeMetricsEnabled()) this.metricsAccumulator.record(metrics);
        this._settle(id, bitmaps, error);
        this._dispatch();
    }
    broadcast(type, payload) {
        this.pool.ensureStarted();
        return Promise.all(Array.from({ length: this.pool.size }, () => this.enqueue(type, payload, TILE_BAKE_TIER.REGISTRATION)));
    }
    _jobDistSq(payload) {
        const cx = payload?.centerX ?? this.focusX;
        const cy = payload?.centerY ?? this.focusY;
        return (cx - this.focusX) ** 2 + (cy - this.focusY) ** 2;
    }
    _resortQueueIfNeeded() {
        if (this.queue.size > 1) {
            const movedSq = (this.focusX - this.sortFocusX) ** 2 + (this.focusY - this.sortFocusY) ** 2;
            if (movedSq < FOCUS_RESORT_DIST_SQ) return;
        }
        this.sortFocusX = this.focusX;
        this.sortFocusY = this.focusY;
        const data = this.queue.data;
        for (const job of data) job.distSq = this._jobDistSq(job.payload);
        for (let i = (data.length >> 1) - 1; i >= 0; i--) this.queue.down(i);
    }
    _settle(id, bitmaps, error) {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (entry.dedupeKey) this.inFlightByKey.delete(entry.dedupeKey);
        if (error) entry.reject(new Error(error));
        else entry.resolve(bitmaps);
    }
    _dropIfObsolete(job) {
        const currentRev = this.getProfileRevision(profileIdFromPayload(job.payload));
        if (job.revision !== undefined && job.revision < currentRev) {
            this._settle(job.id, [], null);
            return true;
        }
        return false;
    }
    _popNextJob() {
        while (this.queue.size > 0) {
            const popped = this.queue.pop();
            if (!this.pending.has(popped.id)) continue;
            if (this._dropIfObsolete(popped)) continue;
            return popped;
        }
        return null;
    }
    _dispatch() {
        if (this.queue.size === 0) return;
        this.pool.ensureStarted();
        this._resortQueueIfNeeded();
        this.pool.forEachIdle((wi) => {
            const job = this._popNextJob();
            if (!job) return;
            this.pool.markBusy(wi, { jobId: job.id, tier: job.tier });
            this.pool.postJob(wi, { id: job.id, type: job.type, payload: job.payload });
        });
    }
}
export function clampStampWallHeightLevel(level, settings) {
    return Math.max(1, Math.min(settings.maxWallHeightLevel, Math.round(level)));
}
const sProjectedChunkCorners = new Float32Array(8);
/** @param {number} worldSpan @param {number} surfaceBakeScale */
export function bakePixelsForWorldSpan(worldSpan, surfaceBakeScale) {
    return Math.max(1, Math.round(worldSpan * surfaceBakeScale));
}
/** @param {CanvasImageSource & { width?: number, height?: number, isPlaceholder?: boolean } | null | undefined} canvas */
export function isDrawableBakedSurface(canvas) {
    if (!canvas || canvas.isPlaceholder) return false;
    const w = canvas.width;
    const h = canvas.height;
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
}
export function drawProjectedHorizontalChunkAtF32(ctx, canvas, buf, o, zLevel, viewport) {
    projectWorldAabbCorners(sProjectedChunkCorners, 0, buf[o], buf[o + 1], buf[o + 2], buf[o + 3], zLevel, viewport);
    drawImageQuadScalars(ctx, canvas, 0, 0, canvas.width, canvas.height, sProjectedChunkCorners[0], sProjectedChunkCorners[1], sProjectedChunkCorners[2], sProjectedChunkCorners[3], sProjectedChunkCorners[4], sProjectedChunkCorners[5], sProjectedChunkCorners[6], sProjectedChunkCorners[7]);
}
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
        return { evalX: new Float32Array(numPixels), evalY: new Float32Array(numPixels), lookupX: new Float32Array(numPixels), lookupY: new Float32Array(numPixels), wallU: new Float32Array(numPixels), wallV: new Float32Array(numPixels) };
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
        mapCtx = { invBakeScale, height, p1x: wf.p1.x, p1y: wf.p1.y, dirX: wf.dirX, dirY: wf.dirY, foldX: wf.foldX, foldY: wf.foldY, invEdgeLen: wf.edgeLen > 0 ? 1 / wf.edgeLen : 1, wallHeight: options.wallHeight, wallWidth: options.wallWidth ?? cellSize };
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
/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 * Elevated-chunk clip helpers live in ChunkDrawPass.js.
 */
export function chunkHasBlockedCellsF32(obstacleGrid, buf, o) {
    const rect = boundsToCellRect(buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, rect.minCol);
    const endCol = Math.min(cols - 1, rect.maxCol);
    const startRow = Math.max(0, rect.minRow);
    const endRow = Math.min(rows - 1, rect.maxRow);
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) if (obstacleGrid.grid[rowOffset + c] !== 0) return true;
    }
    return false;
}
export function buildStaticRoofMaskCanvasF32(obstacleGrid, buf, o, zLevel, settings) {
    const surfaceBakeScale = settings.surfaceBakeScale;
    const bakeSize = bakePixelsForWorldSpan(buf[o + 2] - buf[o], surfaceBakeScale);
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, surfaceBakeScale);
    const canvas = createOffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    const minX = buf[o];
    const minY = buf[o + 1];
    const rect = boundsToCellRect(minX - obstacleGrid.minX, minY - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, rect.minCol);
    const endCol = Math.min(cols - 1, rect.maxCol);
    const startRow = Math.max(0, rect.minRow);
    const endRow = Math.min(rows - 1, rect.maxRow);
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) {
            const idx = rowOffset + c;
            if (resolveCellWallHeightAtIdx(obstacleGrid, idx) === zLevel) {
                obstacleGrid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
                const x = Math.round((ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL] - minX) * surfaceBakeScale);
                const y = Math.round((ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1] - minY) * surfaceBakeScale);
                ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
                any = true;
            }
        }
    }
    return any ? canvas : null;
}
export function clipChunkToFlatWallFootprintsF32(ctx, obstacleGrid, buf, o, zLevel) {
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        const rect = boundsToCellRect(buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
        const cols = obstacleGrid.cols;
        const rows = obstacleGrid.rows;
        const startCol = Math.max(0, rect.minCol);
        const endCol = Math.min(cols - 1, rect.maxCol);
        const startRow = Math.max(0, rect.minRow);
        const endRow = Math.min(rows - 1, rect.maxRow);
        for (let r = startRow; r <= endRow; r++) {
            const rowOffset = r * cols;
            for (let c = startCol; c <= endCol; c++) {
                const idx = rowOffset + c;
                // 1. Voxel wall footprints
                const cellZ = resolveCellWallHeightAtIdx(obstacleGrid, idx);
                if (cellZ === zLevel) {
                    const o = ENGINE_BOUNDS_BASE + B_CELL;
                    obstacleGrid.getCellBoundsByIdxF32(ENGINE_F32, o, idx);
                    traceAabbRect(clipCtx, ENGINE_F32[o], ENGINE_F32[o + 1], ENGINE_F32[o + 2], ENGINE_F32[o + 3]);
                    clippedAny = true;
                }
                // 2. Rail wall footprints
                for (let side = 0; side < 4; side++)
                    if (railWallAtZLevel(obstacleGrid, idx, side, zLevel)) {
                        const o = ENGINE_BOUNDS_BASE + B_FOOTPRINT;
                        railWallFootprintAabbF32(ENGINE_F32, o, obstacleGrid, idx, side);
                        traceAabbRect(clipCtx, ENGINE_F32[o], ENGINE_F32[o + 1], ENGINE_F32[o + 2], ENGINE_F32[o + 3]);
                        clippedAny = true;
                    }
            }
        }
        return clippedAny;
    });
}
/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
const ELEVATED_CHUNK_ROOF = 0;
const ELEVATED_CHUNK_FLAT_RAIL = 1;
export class WorldSurfaceEngine {
    constructor(settings) {
        this.settings = settings;
        this.surfaceSpace = new SurfaceSpatialMap(settings);
        this.cacheKeys = new SurfaceBakeCacheKeys(this.surfaceSpace);
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this._engineBounds = new Float32Array(8);
        this._chunkDraw = { ctx: null, obstacleGrid: null, viewport: null, state: null, zLevel: 0, beforeDraw: null };
        this._visibleChunkFrame = { obstacleGrid: null, viewport: null, state: null, zLevel: 0, chunkKeyRange: { startKey: 0, endKey: 0 } };
        this._resolvedChunkCanvas = null;
        this.activeSurfaceProfileId = SURFACE_PROFILE_ID.tomatoGarden;
        this.worldSurfaceSeed = (Math.random() * 0x100000000) >>> 0;
        this.bakeCooldowns = new Map();
        this.bakeFailCounts = new Map();
    }
    get chunkDrawBoundsO() {
        return 0;
    }
    get _chunkBoundsO() {
        return 4;
    }
    clearBakeCache() {
        this.surfaceCache.clear();
    }
    invalidateGridBounds(region, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        const zLevels = obstacleGrid.collectStaticStructureZLevels();
        const clearChunk = (chunkKey) => {
            const profileId = resolveChunkSurfaceProfileIdAtKey(obstacleGrid, chunkKey, this.activeSurfaceProfileId);
            for (const zLevel of zLevels) {
                this.surfaceCache.delete(this.cacheKeys.staticRoofMaskKey(chunkKey, zLevel));
                this.surfaceCache.delete(this.cacheKeys.staticRoofDrawKey(chunkKey, profileId, zLevel));
            }
        };
        if (region === null || region === undefined) {
            const cols = obstacleGrid.cols;
            const startKey = packChunkKey(0, 0);
            const endKey = packChunkKey(((cols - 1) / cellsPerChunk) | 0, ((obstacleGrid.rows - 1) / cellsPerChunk) | 0);
            forEachChunkKeyInRange(startKey, endKey, clearChunk);
            return;
        }
        if (typeof region === "number") {
            clearChunk(cellIdxToChunkKey(region, obstacleGrid, cellsPerChunk));
            return;
        }
        if (region.startCol != null) {
            forEachChunkKeyInCellBounds(region, cellsPerChunk, clearChunk);
            return;
        }
        throw new Error("invalidateGridBounds region must be null, cell index, or CellBounds");
    }
    buildGroundChunkPayload(state, chunkKey, profileId, zLevel = 0, boundsSample = null) {
        let minX, minY, centerX, centerY, tileChunkKey;
        if (boundsSample) {
            minX = boundsSample.minX;
            minY = boundsSample.minY;
            centerX = boundsSample.centerX;
            centerY = boundsSample.centerY;
            tileChunkKey = boundsSample.chunkKey;
        } else {
            this.surfaceSpace.chunkBoundsF32(this._engineBounds, this._chunkBoundsO, state.obstacleGrid, chunkKey);
            const b = this._engineBounds;
            const o = this._chunkBoundsO;
            centerX = (b[o] + b[o + 2]) / 2;
            centerY = (b[o + 1] + b[o + 3]) / 2;
            this.surfaceSpace.tileChunkBoundsF32(this._engineBounds, this._chunkBoundsO, state.obstacleGrid, chunkKey);
            minX = b[o];
            minY = b[o + 1];
            tileChunkKey = this.surfaceSpace.wrappedChunkKey(chunkKey);
        }
        return { chunkKey, tileChunkKey, minX, minY, seed: this.worldSurfaceSeed, profileId, centerX, centerY, zLevel: zLevel ?? 0 };
    }
    ensureWallAtlas(key, p1, p2, columns, wallHeight, profileId) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const cooldown = this.bakeCooldowns.get(key);
        if (cooldown && performance.now() < cooldown) return null;
        const edgeLen = createWallFaceAxes(p1, p2).edgeLen;
        if (edgeLen < 0.001 || columns.length === 0) return null;
        const cellSize = this.settings.cellSize;
        const surfaceBakeScale = this.settings.surfaceBakeScale;
        const canvasWidth = Math.max(1, Math.ceil(edgeLen * surfaceBakeScale));
        const hVal = resolveWallCapHeightPx(wallHeight, this.settings);
        const canvasHeight = Math.max(1, Math.ceil((hVal + cellSize) * surfaceBakeScale));
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestWallAtlasBake({ width: canvasWidth, height: canvasHeight, p1, p2, seed: this.worldSurfaceSeed, profileId, centerX: (p1.x + p2.x) / 2, centerY: (p1.y + p2.y) / 2, wallHeight: hVal }));
    }
    hasPendingSurfaceBakes() {
        return this.surfaceCache.hasPlaceholders();
    }
    _scheduleBake(key, bakeFn) {
        const placeholder = this.surfaceCache.getOrStart(key);
        const generation = this.surfaceCache.getCurrentGeneration(key);
        bakeFn()
            .then((bitmaps) => {
                if (!bitmaps?.length || !isDrawableBakedSurface(bitmaps[0])) {
                    if (bitmaps) for (const b of bitmaps) if (b && typeof b.close === "function") b.close();
                    throw new Error("Invalid or empty bitmaps returned from bake");
                }
                this.surfaceCache.commitBake(key, generation, bitmaps);
                this.bakeFailCounts.delete(key);
                this.bakeCooldowns.delete(key);
            })
            .catch((err) => {
                if (this.surfaceCache.isValidGeneration(key, generation)) {
                    this.surfaceCache.delete(key);
                    const fails = (this.bakeFailCounts.get(key) || 0) + 1;
                    this.bakeFailCounts.set(key, fails);
                    const delay = Math.min(10000, 1000 * Math.pow(2, fails - 1));
                    this.bakeCooldowns.set(key, performance.now() + delay);
                    console.log("retrying bake request");
                }
            });
        return placeholder;
    }
    getGroundChunkCanvas(chunkKey, state, zLevel = 0, boundsSample = null, profileIdOverride = null) {
        const profileId = profileIdOverride ?? this.activeSurfaceProfileId;
        const key = this.cacheKeys.groundChunkKey(chunkKey, profileId, zLevel);
        const canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;
        const cooldown = this.bakeCooldowns.get(key);
        if (cooldown && performance.now() < cooldown) return null;
        const payload = this.buildGroundChunkPayload(state, chunkKey, profileId, zLevel, boundsSample);
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(payload));
    }
    getOrEnsureWallAtlasScalars(x1, y1, x2, y2, options) {
        const { profileId = this.activeSurfaceProfileId, wallHeight = null, cacheObj = null, atlasFaceId = "side" } = options;
        const seed = this.worldSurfaceSeed;
        const wallHeightKey = resolveWallCapHeightPx(wallHeight, this.settings);
        const atlas = this.cacheKeys.wallAtlasKeyScalars(x1, y1, x2, y2, seed, profileId, wallHeightKey);
        if (cacheObj) {
            const stash = cacheObj._wallAtlasStashes?.[atlasFaceId];
            if (stash && stash.profileId === profileId && stash.rev === atlas.rev && stash.seed === seed && stash.wallHeightKey === wallHeightKey && this.surfaceCache.get(stash.key) === stash.canvases) return stash;
        }
        const { key, wrappedP1, wrappedP2, rev } = atlas;
        let canvases = this.surfaceCache.get(key);
        if (!canvases) {
            const columns = wallFaceColumns(wrappedP1, wrappedP2, this.settings.cellSize);
            if (columns.length === 0) return null;
            canvases = this.ensureWallAtlas(key, wrappedP1, wrappedP2, columns, wallHeight, profileId);
            if (!canvases || canvases.length === 0) return null;
        }
        const resolved = { key, wrappedP1, wrappedP2, canvases, profileId, rev, seed, wallHeightKey };
        if (cacheObj) {
            if (!cacheObj._wallAtlasStashes) cacheObj._wallAtlasStashes = {};
            cacheObj._wallAtlasStashes[atlasFaceId] = resolved;
        }
        return resolved;
    }
    getOrEnsureWallAtlas(p1, p2, options) {
        return this.getOrEnsureWallAtlasScalars(p1.x, p1.y, p2.x, p2.y, options);
    }
    fillHorizontalCapDrawSampleIntoFlat(worldCorners8, zLevel, state, outSrc8) {
        const surfaceBakeScale = this.settings.surfaceBakeScale;
        const obstacleGrid = state.obstacleGrid;
        const sample = this.surfaceSpace.flatHorizontalSample(worldCorners8, obstacleGrid);
        const profileId = resolveChunkSurfaceProfileIdAtKey(obstacleGrid, sample.chunkKey, this.activeSurfaceProfileId);
        const canvases = this.getGroundChunkCanvas(sample.chunkKey, state, zLevel, null, profileId);
        const canvas = canvases ? canvases[0] : null;
        for (let i = 0; i < 4; i++) {
            outSrc8[i * 2] = (worldCorners8[i * 2] - sample.minX) * surfaceBakeScale;
            outSrc8[i * 2 + 1] = (worldCorners8[i * 2 + 1] - sample.minY) * surfaceBakeScale;
        }
        return isDrawableBakedSurface(canvas) ? canvas : null;
    }
    bindGroundChunkDraw(ctx, state, viewport, beforeDraw = null) {
        const d = this._chunkDraw;
        d.ctx = ctx;
        d.obstacleGrid = state.obstacleGrid;
        d.viewport = viewport;
        d.state = state;
        d.beforeDraw = beforeDraw;
    }
    drawGround(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state, viewport);
        this.drawGroundPlaneChunks();
    }
    drawRoofs(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state, viewport);
        this.drawStaticRoofChunksForLevels(state.obstacleGrid.collectStaticFillZLevels());
    }
    drawFlatWallRails(ctx, state, viewport) {
        this.bindGroundChunkDraw(ctx, state, viewport);
        const zLevels = state.obstacleGrid.collectStaticStructureZLevels();
        const levels = zLevels.length ? zLevels : [defaultWallCapPx(this.settings)];
        this.drawFlatRailFloorChunksForLevels(levels);
    }
    _beginVisibleChunkDraw() {
        const d = this._chunkDraw;
        const { ctx, obstacleGrid, viewport, zLevel, beforeDraw } = d;
        const chunkSizePx = this.surfaceSpace.chunkSizePx(obstacleGrid);
        const viewportBounds = viewport.boundsBuf;
        let buf = viewportBounds;
        let o = VIEW_TIER.CHUNKS;
        if (obstacleGrid?.cols) {
            minCornerAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cols * obstacleGrid.cellSize, obstacleGrid.rows * obstacleGrid.cellSize);
            if (!intersectAabbOptionalF32(this._engineBounds, this.chunkDrawBoundsO, viewportBounds, VIEW_TIER.CHUNKS, ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP)) return null;
            buf = this._engineBounds;
            o = this.chunkDrawBoundsO;
        }
        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);
        if (beforeDraw) beforeDraw(ctx, buf, o);
        const frame = this._visibleChunkFrame;
        frame.obstacleGrid = obstacleGrid;
        frame.viewport = viewport;
        frame.state = d.state;
        frame.zLevel = zLevel;
        const range = this.surfaceSpace.viewportChunkKeyRangeF32(buf, o, obstacleGrid, chunkSizePx);
        frame.chunkKeyRange = range;
        return frame;
    }
    _fillDrawableGroundChunkCanvas(chunkKey, zLevel) {
        const state = this._chunkDraw.state;
        const profileId = resolveChunkSurfaceProfileIdAtKey(state.obstacleGrid, chunkKey, this.activeSurfaceProfileId);
        const canvases = this.getGroundChunkCanvas(chunkKey, state, zLevel, null, profileId);
        const canvas = canvases ? canvases[0] : null;
        if (!canvas || canvas.isPlaceholder) return false;
        this._resolvedChunkCanvas = canvas;
        return true;
    }
    drawGroundPlaneChunks() {
        const d = this._chunkDraw;
        d.zLevel = 0;
        const frame = this._beginVisibleChunkDraw();
        if (!frame) return;
        const ctx = d.ctx;
        const { obstacleGrid, chunkKeyRange } = frame;
        const b = this._engineBounds;
        const o = this._chunkBoundsO;
        forEachChunkKeyInRange(chunkKeyRange.startKey, chunkKeyRange.endKey, (chunkKey) => {
            this.surfaceSpace.chunkBoundsF32(b, o, obstacleGrid, chunkKey);
            if (!this._fillDrawableGroundChunkCanvas(chunkKey, 0)) return;
            ctx.drawImage(this._resolvedChunkCanvas, b[o], b[o + 1], b[o + 2] - b[o], b[o + 3] - b[o + 1]);
        });
    }
    getStaticRoofDrawCanvas(chunkKey, zLevel, obstacleGrid, buf, o, roofCanvas, profileId) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const drawKey = this.cacheKeys.staticRoofDrawKey(chunkKey, profileId, zLevel);
        const maskKey = this.cacheKeys.staticRoofMaskKey(chunkKey, zLevel);
        let maskEntry = this.surfaceCache.get(maskKey);
        if (!maskEntry) {
            const maskCanvas = buildStaticRoofMaskCanvasF32(obstacleGrid, buf, o, zLevel, this.settings);
            if (!maskCanvas) {
                this.surfaceCache.delete(drawKey);
                return null;
            }
            maskEntry = [maskCanvas];
            this.surfaceCache.set(maskKey, maskEntry);
            this.surfaceCache.delete(drawKey);
        }
        const cached = this.surfaceCache.get(drawKey);
        if (cached?.[0] && !cached[0].isPlaceholder) return cached[0];
        const masked = composeDestinationIn(roofCanvas, maskEntry[0]);
        if (!isDrawableBakedSurface(masked)) return null;
        this.surfaceCache.set(drawKey, [masked]);
        return masked;
    }
    drawStaticRoofChunksForLevels(levels) {
        const d = this._chunkDraw;
        for (let i = 0; i < levels.length; i++) {
            d.zLevel = levels[i];
            this._drawElevatedChunks(ELEVATED_CHUNK_ROOF);
        }
    }
    drawFlatRailFloorChunksForLevels(levels) {
        const d = this._chunkDraw;
        for (let i = 0; i < levels.length; i++) {
            d.zLevel = levels[i];
            this._drawElevatedChunks(ELEVATED_CHUNK_FLAT_RAIL);
        }
    }
    _drawElevatedChunks(mode) {
        const d = this._chunkDraw;
        const zLevel = d.zLevel;
        if (zLevel <= 0) return;
        const frame = this._beginVisibleChunkDraw();
        if (!frame) return;
        const ctx = d.ctx;
        const { obstacleGrid, chunkKeyRange, viewport } = frame;
        const b = this._engineBounds;
        const o = this._chunkBoundsO;
        forEachChunkKeyInRange(chunkKeyRange.startKey, chunkKeyRange.endKey, (chunkKey) => {
            this.surfaceSpace.chunkBoundsF32(b, o, obstacleGrid, chunkKey);
            if (mode === ELEVATED_CHUNK_ROOF) {
                if (!chunkHasBlockedCellsF32(obstacleGrid, b, o) && !chunkHasStaticRoofAtLevel(obstacleGrid, b, o, zLevel)) return;
            } else if (!chunkHasStaticStructureAtLevel(obstacleGrid, b, o, zLevel)) return;
            if (!this._fillDrawableGroundChunkCanvas(chunkKey, zLevel)) return;
            ctx.save();
            if (mode === ELEVATED_CHUNK_ROOF) {
                const profileId = resolveChunkSurfaceProfileIdAtKey(obstacleGrid, chunkKey, this.activeSurfaceProfileId);
                const drawCanvas = this.getStaticRoofDrawCanvas(chunkKey, zLevel, obstacleGrid, b, o, this._resolvedChunkCanvas, profileId);
                if (!drawCanvas || drawCanvas.isPlaceholder) {
                    ctx.restore();
                    return;
                }
                drawProjectedHorizontalChunkAtF32(ctx, drawCanvas, b, o, zLevel, viewport);
            } else {
                if (!clipChunkToFlatWallFootprintsF32(ctx, obstacleGrid, b, o, zLevel)) {
                    ctx.restore();
                    return;
                }
                ctx.drawImage(this._resolvedChunkCanvas, b[o], b[o + 1], b[o + 2] - b[o], b[o + 3] - b[o + 1]);
            }
            ctx.restore();
        });
    }
    ensureWallChunkProfileTextures(state, profileId, wallHeightPx) {
        const cellSize = this.settings.cellSize;
        const sideAtlas = this.getOrEnsureWallAtlas({ x: 0, y: 0 }, { x: cellSize, y: 0 }, { profileId, wallHeight: wallHeightPx });
        const sideCanvas = sideAtlas?.canvases?.[0] ?? null;
        const sample = this.surfaceSpace.wallChunkTextureSample(cellSize);
        const capCanvasEntry = this.getGroundChunkCanvas(sample.chunkKey, state, 1, sample, profileId);
        const capCanvas = capCanvasEntry?.[0] ?? null;
        const sideReady = sideCanvas && !sideCanvas.isPlaceholder;
        const capReady = capCanvas && !capCanvas.isPlaceholder;
        const ready = sideReady && capReady;
        return { sideCanvas, capCanvas, ready, scale: this.settings.surfaceBakeScale, chunkSizePx: sample.chunkSizePx };
    }
}
