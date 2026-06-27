/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
import { aabbCenterX, aabbCenterY, aabbHeight, aabbWidth, createAabb, intersectAabbOptionalInto } from "../Math/Aabb2D.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { chunkHasBlockedCells, buildStaticRoofMaskCanvas } from "./HorizontalSurfaceDraw.js";
import { clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { staticRoofMaskCacheKey, SurfaceBakeCacheKeys } from "./SurfaceBakeCacheKeys.js";
import { SurfaceSpatialMap } from "./SurfaceSpatialMap.js";
import { createWallFaceAxes, wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawProjectedHorizontalChunkAt, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
const ELEVATED_CHUNK_ROOF = 0;
const ELEVATED_CHUNK_FLAT_RAIL = 1;
export class WorldSurfaceEngine {
    constructor(settings) {
        this.settings = settings;
        this.surfaceSpace = new SurfaceSpatialMap(settings);
        this.cacheKeys = new SurfaceBakeCacheKeys(this.surfaceSpace);
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this.chunkDrawBounds = createAabb();
        this._chunkDraw = { ctx: null, obstacleGrid: null, viewport: null, state: null, playBounds: null, zLevel: 0, beforeDraw: null };
        this._visibleChunkFrame = { obstacleGrid: null, viewport: null, state: null, zLevel: 0, minChunkCol: 0, maxChunkCol: 0, minChunkRow: 0, maxChunkRow: 0 };
        this._resolvedChunkCanvas = null;
        this._chunkBounds = createAabb();
        this.activeSurfaceProfileId = SURFACE_PROFILE_ID.tomatoGarden;
        this.worldSurfaceSeed = (Math.random() * 0x100000000) >>> 0;
    }
    clearBakeCache() {
        this.surfaceCache.clear();
    }
    buildGroundChunkPayload(state, chunkCol, chunkRow, profileId, zLevel = 0, boundsSample = null) {
        let minX, minY, centerX, centerY;
        if (boundsSample) {
            minX = boundsSample.minX;
            minY = boundsSample.minY;
            centerX = boundsSample.centerX;
            centerY = boundsSample.centerY;
        } else {
            const bounds = this.surfaceSpace.chunkBoundsInto(this._chunkBounds, state.obstacleGrid, chunkCol, chunkRow);
            minX = bounds.minX;
            minY = bounds.minY;
            centerX = aabbCenterX(bounds);
            centerY = aabbCenterY(bounds);
        }
        return { chunkCol, chunkRow, minX, minY, seed: this.worldSurfaceSeed, profileId, centerX, centerY, zLevel: zLevel ?? 0 };
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        if (!bounds || !state?.obstacleGrid) return;
        const obstacleGrid = state.obstacleGrid;
        const range = this.surfaceSpace.cellBoundsToChunkRange(bounds, obstacleGrid, cellsPerChunk);
        const zLevels = obstacleGrid.collectStaticStructureZLevels();
        const profileId = this.activeSurfaceProfileId;
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++)
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++)
                for (const zLevel of zLevels) {
                    this.surfaceCache.delete(staticRoofMaskCacheKey(chunkCol, chunkRow, zLevel));
                    this.surfaceCache.delete(this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, profileId, zLevel));
                }
    }
    ensureWallAtlas(key, p1, p2, columns, wallHeight, profileId) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
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
        bakeFn().then((bitmaps) => {
            this.surfaceCache.commitBake(key, generation, bitmaps);
        });
        return placeholder;
    }
    getGroundChunkCanvas(chunkCol, chunkRow, state, zLevel = 0, boundsSample = null, profileIdOverride = null) {
        const profileId = profileIdOverride ?? this.activeSurfaceProfileId;
        const key = this.cacheKeys.groundChunkKey(chunkCol, chunkRow, profileId, zLevel);
        const canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;
        const payload = this.buildGroundChunkPayload(state, chunkCol, chunkRow, profileId, zLevel, boundsSample);
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(payload));
    }
    getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, bounds, roofCanvas) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const drawKey = this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, this.activeSurfaceProfileId, zLevel);
        const maskKey = staticRoofMaskCacheKey(chunkCol, chunkRow, zLevel);
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
    /**
     * @param {{ x: number, y: number }} p1
     * @param {{ x: number, y: number }} p2
     * @param {{
     *   profileId?: string,
     *   wallHeight?: number | null,
     *   cacheObj?: object | null,
     *   atlasFaceId?: string,
     * }} options
     */
    getOrEnsureWallAtlas(p1, p2, options) {
        const { profileId = this.activeSurfaceProfileId, wallHeight = null, cacheObj = null, atlasFaceId = "side" } = options;
        const seed = this.worldSurfaceSeed;
        const wallHeightKey = resolveWallCapHeightPx(wallHeight, this.settings);
        const atlas = this.cacheKeys.wallAtlasKey(p1, p2, seed, profileId, wallHeightKey);
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
    /**
     * Chunk UV for a horizontal cap quad — writes bake-space src corners into outSrc4, returns canvas or null.
     * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} worldCorners
     * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} outSrc4
     */
    fillHorizontalCapDrawSampleInto(worldCorners, zLevel, state, outSrc4) {
        const surfaceBakeScale = this.settings.surfaceBakeScale;
        const obstacleGrid = state.obstacleGrid;
        const sample = this.surfaceSpace.horizontalSample(worldCorners, obstacleGrid);
        const canvas = this.getGroundChunkCanvas(sample.chunkCol, sample.chunkRow, state, zLevel)[0];
        for (let i = 0; i < 4; i++) {
            outSrc4[i].x = (worldCorners[i].x - sample.minX) * surfaceBakeScale;
            outSrc4[i].y = (worldCorners[i].y - sample.minY) * surfaceBakeScale;
        }
        return canvas;
    }
    bindGroundChunkDraw(ctx, obstacleGrid, viewport, state, playBounds, beforeDraw = null) {
        const d = this._chunkDraw;
        d.ctx = ctx;
        d.obstacleGrid = obstacleGrid;
        d.viewport = viewport;
        d.state = state;
        d.playBounds = playBounds;
        d.beforeDraw = beforeDraw;
    }
    _beginVisibleChunkDraw() {
        const d = this._chunkDraw;
        const { ctx, obstacleGrid, viewport, zLevel, playBounds, beforeDraw } = d;
        const chunkSizePx = this.surfaceSpace.chunkSizePx(obstacleGrid);
        const viewportBounds = viewport.bounds("chunks");
        let bounds = viewportBounds;
        if (playBounds) {
            if (!intersectAabbOptionalInto(this.chunkDrawBounds, viewportBounds, playBounds)) return null;
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
        frame.minChunkCol = range.minChunkCol;
        frame.maxChunkCol = range.maxChunkCol;
        frame.minChunkRow = range.minChunkRow;
        frame.maxChunkRow = range.maxChunkRow;
        return frame;
    }
    _fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel) {
        const state = this._chunkDraw.state;
        const canvas = this.getGroundChunkCanvas(chunkCol, chunkRow, state, zLevel)[0];
        if (canvas?.isPlaceholder) return false;
        this._resolvedChunkCanvas = canvas;
        return true;
    }
    drawGroundPlaneChunks() {
        const d = this._chunkDraw;
        d.zLevel = 0;
        const frame = this._beginVisibleChunkDraw();
        if (!frame) return;
        const ctx = d.ctx;
        const { obstacleGrid, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow } = frame;
        const chunkBounds = this._chunkBounds;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                this.surfaceSpace.chunkBoundsInto(chunkBounds, obstacleGrid, chunkCol, chunkRow);
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, 0)) continue;
                ctx.drawImage(this._resolvedChunkCanvas, chunkBounds.minX, chunkBounds.minY, aabbWidth(chunkBounds), aabbHeight(chunkBounds));
            }
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
        const { obstacleGrid, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow, viewport } = frame;
        const chunkBounds = this._chunkBounds;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                this.surfaceSpace.chunkBoundsInto(chunkBounds, obstacleGrid, chunkCol, chunkRow);
                if (mode === ELEVATED_CHUNK_ROOF) {
                    if (!chunkHasBlockedCells(obstacleGrid, chunkBounds) && !chunkHasStaticRoofAtLevel(obstacleGrid, chunkBounds, zLevel)) continue;
                } else if (!chunkHasStaticStructureAtLevel(obstacleGrid, chunkBounds, zLevel)) continue;
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel)) continue;
                ctx.save();
                if (mode === ELEVATED_CHUNK_ROOF) {
                    const drawCanvas = this.getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, chunkBounds, this._resolvedChunkCanvas);
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
