/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
import { aabbCenterX, aabbCenterY, aabbHeight, aabbWidth, createAabb, intersectAabbOptionalInto } from "../Math/math.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { chunkHasBlockedCells, buildStaticRoofMaskCanvas } from "./HorizontalSurfaceDraw.js";
import { clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, defaultWallCapPx, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { SurfaceBakeCacheKeys } from "./SurfaceBakeCacheKeys.js";
import { SurfaceSpatialMap } from "./SurfaceSpatialMap.js";
import { createWallFaceAxes, wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawProjectedHorizontalChunkAt, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
import {  resolveChunkSurfaceProfileId  } from "../Spatial/spatial.js";
const ELEVATED_CHUNK_ROOF = 0;
const ELEVATED_CHUNK_FLAT_RAIL = 1;
export class WorldSurfaceEngine {
    constructor(settings) {
        this.settings = settings;
        this.surfaceSpace = new SurfaceSpatialMap(settings);
        this.cacheKeys = new SurfaceBakeCacheKeys(this.surfaceSpace);
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this.chunkDrawBounds = createAabb();
        this._chunkDraw = { ctx: null, obstacleGrid: null, viewport: null, state: null, zLevel: 0, beforeDraw: null };
        this._visibleChunkFrame = { obstacleGrid: null, viewport: null, state: null, zLevel: 0, chunkRange: { startCol: 0, endCol: 0, startRow: 0, endRow: 0 } };
        this._resolvedChunkCanvas = null;
        this._chunkBounds = createAabb();
        this.activeSurfaceProfileId = SURFACE_PROFILE_ID.tomatoGarden;
        this.worldSurfaceSeed = (Math.random() * 0x100000000) >>> 0;
        this.bakeCooldowns = new Map();
        this.bakeFailCounts = new Map();
    }
    clearBakeCache() {
        this.surfaceCache.clear();
    }
    invalidateGridBounds(idx, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        const cols = obstacleGrid.cols;
        const range =
            idx === null || idx === undefined
                ? { startCol: 0, endCol: ((cols - 1) / cellsPerChunk) | 0, startRow: 0, endRow: ((obstacleGrid.rows - 1) / cellsPerChunk) | 0 }
                : {
                      startCol: ((idx % cols) / cellsPerChunk) | 0,
                      endCol: ((idx % cols) / cellsPerChunk) | 0,
                      startRow: (((idx / cols) | 0) / cellsPerChunk) | 0,
                      endRow: (((idx / cols) | 0) / cellsPerChunk) | 0,
                  };
        const zLevels = obstacleGrid.collectStaticStructureZLevels();
        for (let chunkRow = range.startRow; chunkRow <= range.endRow; chunkRow++)
            for (let chunkCol = range.startCol; chunkCol <= range.endCol; chunkCol++) {
                const profileId = resolveChunkSurfaceProfileId(obstacleGrid, chunkCol, chunkRow, this.activeSurfaceProfileId);
                for (const zLevel of zLevels) {
                    this.surfaceCache.delete(this.cacheKeys.staticRoofMaskKey(chunkCol, chunkRow, zLevel));
                    this.surfaceCache.delete(this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, profileId, zLevel));
                }
            }
    }
    buildGroundChunkPayload(state, chunkCol, chunkRow, profileId, zLevel = 0, boundsSample = null) {
        let minX, minY, centerX, centerY, tileChunkCol, tileChunkRow;
        if (boundsSample) {
            minX = boundsSample.minX;
            minY = boundsSample.minY;
            centerX = boundsSample.centerX;
            centerY = boundsSample.centerY;
            tileChunkCol = boundsSample.chunkCol;
            tileChunkRow = boundsSample.chunkRow;
        } else {
            const bounds = this.surfaceSpace.chunkBoundsInto(this._chunkBounds, state.obstacleGrid, chunkCol, chunkRow);
            centerX = aabbCenterX(bounds);
            centerY = aabbCenterY(bounds);
            const tileBounds = this.surfaceSpace.tileChunkBoundsInto(this._chunkBounds, state.obstacleGrid, chunkCol, chunkRow);
            minX = tileBounds.minX;
            minY = tileBounds.minY;
            tileChunkCol = this.surfaceSpace.wrapChunkCol(chunkCol);
            tileChunkRow = this.surfaceSpace.wrapChunkRow(chunkRow);
        }
        return { chunkCol, chunkRow, tileChunkCol, tileChunkRow, minX, minY, seed: this.worldSurfaceSeed, profileId, centerX, centerY, zLevel: zLevel ?? 0 };
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
        return this._scheduleBake(key, () =>
            TileWorkerCoordinator.requestWallAtlasBake({
                width: canvasWidth,
                height: canvasHeight,
                p1,
                p2,
                seed: this.worldSurfaceSeed,
                profileId,
                centerX: (p1.x + p2.x) / 2,
                centerY: (p1.y + p2.y) / 2,
                wallHeight: hVal,
            }),
        );
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
                    if (bitmaps) {
                        for (const b of bitmaps) {
                            if (b && typeof b.close === "function") b.close();
                        }
                    }
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
    getGroundChunkCanvas(chunkCol, chunkRow, state, zLevel = 0, boundsSample = null, profileIdOverride = null) {
        const profileId = profileIdOverride ?? this.activeSurfaceProfileId;
        const key = this.cacheKeys.groundChunkKey(chunkCol, chunkRow, profileId, zLevel);
        const canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;
        const cooldown = this.bakeCooldowns.get(key);
        if (cooldown && performance.now() < cooldown) return null;
        const payload = this.buildGroundChunkPayload(state, chunkCol, chunkRow, profileId, zLevel, boundsSample);
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(payload));
    }
    getOrEnsureWallAtlasScalars(x1, y1, x2, y2, options) {
        const { profileId = this.activeSurfaceProfileId, wallHeight = null, cacheObj = null, atlasFaceId = "side" } = options;
        const seed = this.worldSurfaceSeed;
        const wallHeightKey = resolveWallCapHeightPx(wallHeight, this.settings);
        const atlas = this.cacheKeys.wallAtlasKeyScalars(x1, y1, x2, y2, seed, profileId, wallHeightKey);
        if (cacheObj) {
            const stash = cacheObj._wallAtlasStashes?.[atlasFaceId];
            if (
                stash &&
                stash.profileId === profileId &&
                stash.rev === atlas.rev &&
                stash.seed === seed &&
                stash.wallHeightKey === wallHeightKey &&
                this.surfaceCache.get(stash.key) === stash.canvases
            )
                return stash;
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
        const profileId = resolveChunkSurfaceProfileId(obstacleGrid, sample.chunkCol, sample.chunkRow, this.activeSurfaceProfileId);
        const canvas = this.getGroundChunkCanvas(sample.chunkCol, sample.chunkRow, state, zLevel, null, profileId)[0];
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
        const viewportBounds = viewport.bounds("chunks");
        let bounds = viewportBounds;
        if (obstacleGrid?.cols) {
            if (!intersectAabbOptionalInto(this.chunkDrawBounds, viewportBounds, obstacleGrid)) return null;
            bounds = this.chunkDrawBounds;
        }
        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);
        if (beforeDraw) beforeDraw(ctx, bounds);
        const frame = this._visibleChunkFrame;
        frame.obstacleGrid = obstacleGrid;
        frame.viewport = viewport;
        frame.state = d.state;
        frame.zLevel = zLevel;
        const range = this.surfaceSpace.viewportChunkRange(bounds, obstacleGrid, chunkSizePx);
        frame.chunkRange = range;
        return frame;
    }
    _fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel) {
        const state = this._chunkDraw.state;
        const profileId = resolveChunkSurfaceProfileId(state.obstacleGrid, chunkCol, chunkRow, this.activeSurfaceProfileId);
        const canvases = this.getGroundChunkCanvas(chunkCol, chunkRow, state, zLevel, null, profileId);
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
        const { obstacleGrid, chunkRange } = frame;
        const chunkBounds = this._chunkBounds;
        for (let chunkRow = chunkRange.startRow; chunkRow <= chunkRange.endRow; chunkRow++)
            for (let chunkCol = chunkRange.startCol; chunkCol <= chunkRange.endCol; chunkCol++) {
                this.surfaceSpace.chunkBoundsInto(chunkBounds, obstacleGrid, chunkCol, chunkRow);
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, 0)) continue;
                ctx.drawImage(this._resolvedChunkCanvas, chunkBounds.minX, chunkBounds.minY, aabbWidth(chunkBounds), aabbHeight(chunkBounds));
            }
    }
    getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, bounds, roofCanvas, profileId) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const drawKey = this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, profileId, zLevel);
        const maskKey = this.cacheKeys.staticRoofMaskKey(chunkCol, chunkRow, zLevel);
        let maskEntry = this.surfaceCache.get(maskKey);
        if (!maskEntry) {
            const maskCanvas = buildStaticRoofMaskCanvas(obstacleGrid, bounds, zLevel, this.settings);
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
        const { obstacleGrid, chunkRange, viewport } = frame;
        const chunkBounds = this._chunkBounds;
        for (let chunkRow = chunkRange.startRow; chunkRow <= chunkRange.endRow; chunkRow++)
            for (let chunkCol = chunkRange.startCol; chunkCol <= chunkRange.endCol; chunkCol++) {
                this.surfaceSpace.chunkBoundsInto(chunkBounds, obstacleGrid, chunkCol, chunkRow);
                if (mode === ELEVATED_CHUNK_ROOF) {
                    if (!chunkHasBlockedCells(obstacleGrid, chunkBounds) && !chunkHasStaticRoofAtLevel(obstacleGrid, chunkBounds, zLevel)) continue;
                } else if (!chunkHasStaticStructureAtLevel(obstacleGrid, chunkBounds, zLevel)) continue;
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel)) continue;
                ctx.save();
                if (mode === ELEVATED_CHUNK_ROOF) {
                    const profileId = resolveChunkSurfaceProfileId(obstacleGrid, chunkCol, chunkRow, this.activeSurfaceProfileId);
                    const drawCanvas = this.getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, chunkBounds, this._resolvedChunkCanvas, profileId);
                    if (!drawCanvas || drawCanvas.isPlaceholder) {
                        ctx.restore();
                        continue;
                    }
                    drawProjectedHorizontalChunkAt(ctx, drawCanvas, chunkBounds, zLevel, viewport);
                } else {
                    if (!clipChunkToFlatWallFootprints(ctx, obstacleGrid, chunkBounds, zLevel)) {
                        ctx.restore();
                        continue;
                    }
                    ctx.drawImage(this._resolvedChunkCanvas, chunkBounds.minX, chunkBounds.minY, aabbWidth(chunkBounds), aabbHeight(chunkBounds));
                }
                ctx.restore();
            }
    }
    ensureWallChunkProfileTextures(state, profileId, wallHeightPx) {
        const cellSize = this.settings.cellSize;
        const sideAtlas = this.getOrEnsureWallAtlas({ x: 0, y: 0 }, { x: cellSize, y: 0 }, { profileId, wallHeight: wallHeightPx });
        const sideCanvas = sideAtlas?.canvases?.[0] ?? null;
        const sample = this.surfaceSpace.wallChunkTextureSample(cellSize);
        const capCanvasEntry = this.getGroundChunkCanvas(sample.chunkCol, sample.chunkRow, state, 1, sample, profileId);
        const capCanvas = capCanvasEntry?.[0] ?? null;
        const sideReady = sideCanvas && !sideCanvas.isPlaceholder;
        const capReady = capCanvas && !capCanvas.isPlaceholder;
        const ready = sideReady && capReady;
        return { sideCanvas, capCanvas, ready, scale: this.settings.surfaceBakeScale, chunkSizePx: sample.chunkSizePx };
    }
}
