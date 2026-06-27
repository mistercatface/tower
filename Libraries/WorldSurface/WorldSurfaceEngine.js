/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
import { aabbCenterX, aabbCenterY, createAabb, intersectAabbOptionalInto } from "../Math/Aabb2D.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { chunkHasBlockedCells, buildStaticRoofMaskCanvas } from "./HorizontalSurfaceDraw.js";
import { clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { surfaceProfileDefaults } from "../Procedural/SurfaceProfileProvider.js";
import { staticRoofMaskCacheKey, SurfaceBakeCacheKeys } from "./SurfaceBakeCacheKeys.js";
import { SurfaceSpatialMap } from "./SurfaceSpatialMap.js";
import { createWallFaceAxes, wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, drawProjectedHorizontalChunkAt, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
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
        this._resolvedChunkCanvas = { canvas: null, payload: null };
        this._chunkBounds = createAabb();
    }
    clear() {
        this.surfaceCache.clear();
    }
    resolveSurfaceProfileId() {
        if (this.surfaceProfileOverride) return this.surfaceProfileOverride;
        return surfaceProfileDefaults.defaultId;
    }
    buildGroundChunkPayload(state, chunkCol, chunkRow, zLevel = 0, profileId = null) {
        const bounds = this.surfaceSpace.chunkBoundsInto(this._chunkBounds, state.obstacleGrid, chunkCol, chunkRow);
        const resolvedProfileId = profileId ?? this.resolveSurfaceProfileId();
        return {
            chunkCol,
            chunkRow,
            minX: bounds.minX,
            minY: bounds.minY,
            seed: this.worldSurfaceSeed ?? 0,
            profileId: resolvedProfileId,
            centerX: aabbCenterX(bounds),
            centerY: aabbCenterY(bounds),
            zLevel: zLevel ?? 0,
        };
    }
    invalidateGridBounds(bounds, state, cellsPerChunk = this.settings.cellsPerChunk) {
        if (!bounds || !state?.obstacleGrid) return;
        const obstacleGrid = state.obstacleGrid;
        const range = this.surfaceSpace.cellBoundsToChunkRange(bounds, obstacleGrid, cellsPerChunk);
        const zLevels = obstacleGrid.collectStaticStructureZLevels();
        const profileId = this.resolveSurfaceProfileId();
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++)
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++)
                for (const zLevel of zLevels) {
                    this.surfaceCache.delete(staticRoofMaskCacheKey(chunkCol, chunkRow, zLevel));
                    this.surfaceCache.delete(this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, profileId, zLevel));
                }
    }
    ensureWallAtlas(key, p1, p2, columns, surfaceSeed, wallHeight, profileId) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const edgeLen = createWallFaceAxes(p1, p2).edgeLen;
        if (edgeLen < 0.001 || columns.length === 0) return null;
        const cellSize = this.settings.cellSize;
        const surfaceBakeScale = this.settings.surfaceBakeScale;
        const canvasWidth = Math.max(1, Math.ceil(edgeLen * surfaceBakeScale));
        const hVal = resolveWallCapHeightPx(wallHeight, this.settings);
        const canvasHeight = Math.max(1, Math.ceil((hVal + cellSize) * surfaceBakeScale));
        const bakeProfileId = profileId;
        return this._scheduleBake(key, () =>
            TileWorkerCoordinator.requestWallAtlasBake({
                width: canvasWidth,
                height: canvasHeight,
                p1,
                p2,
                seed: surfaceSeed,
                profileId: bakeProfileId,
                centerX: (p1.x + p2.x) / 2,
                centerY: (p1.y + p2.y) / 2,
                wallHeight: hVal,
            }),
        );
    }
    _resolveChunkPayload(state, chunkCol, chunkRow, zLevel = 0, profileId = null) {
        return this.buildGroundChunkPayload(state, chunkCol, chunkRow, zLevel, profileId);
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
    getGroundChunkCanvas(chunkCol, chunkRow, state, payload = null, zLevel = 0) {
        if (!payload) payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
        const resolvedZ = payload.zLevel ?? zLevel;
        payload.zLevel = resolvedZ;
        const key = this.cacheKeys.groundChunkKey(chunkCol, chunkRow, payload.profileId, resolvedZ);
        let canvases = this.surfaceCache.get(key);
        if (canvases) {
            const canvas = canvases[0];
            if (canvas?.isPlaceholder) return canvases;
            if (isDrawableBakedSurface(canvas)) return canvases;
            this.surfaceCache.delete(key);
        }
        return this._scheduleGroundChunkBake(key, payload, resolvedZ);
    }
    _scheduleGroundChunkBake(key, payload, zLevel = 0) {
        payload.zLevel = payload.zLevel ?? zLevel;
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(payload));
    }
    getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, bounds, roofCanvas, payload) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const drawKey = this.cacheKeys.staticRoofDrawKey(chunkCol, chunkRow, payload.profileId, zLevel);
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
        let cached = this.surfaceCache.get(drawKey);
        if (cached?.[0] && !cached[0].isPlaceholder) {
            if (isDrawableBakedSurface(cached[0])) return cached[0];
            this.surfaceCache.delete(drawKey);
        }
        const masked = composeDestinationIn(roofCanvas, maskEntry[0]);
        if (!isDrawableBakedSurface(masked)) return null;
        this.surfaceCache.set(drawKey, [masked]);
        return masked;
    }
    /**
     * @param {{ x: number, y: number }} p1
     * @param {{ x: number, y: number }} p2
     * @param {object} state
     * @param {{
     *   profileId: string,
     *   wallHeight?: number | null,
     *   cacheObj?: object | null,
     *   atlasFaceId?: string,
     * }} options
     */
    getOrEnsureWallAtlas(p1, p2, state, options) {
        const { profileId, wallHeight = null, cacheObj = null, atlasFaceId = "side" } = options;
        const seed = state.worldSurfaces.worldSurfaceSeed ?? 0;
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
            canvases = this.ensureWallAtlas(key, wrappedP1, wrappedP2, columns, seed, wallHeight, profileId);
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
    fillHorizontalCapDrawSampleInto(worldCorners, zLevel, state, profileId, outSrc4) {
        const surfaceBakeScale = this.settings.surfaceBakeScale;
        const obstacleGrid = state.obstacleGrid;
        const sample = this.surfaceSpace.horizontalSample(worldCorners, obstacleGrid);
        const payload = this._resolveChunkPayload(state, sample.chunkCol, sample.chunkRow, zLevel, profileId);
        const canvas = this.getGroundChunkCanvas(sample.chunkCol, sample.chunkRow, state, payload, zLevel)[0];
        if (!canvas || canvas.isPlaceholder) return null;
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
        const payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
        const canvas = this.getGroundChunkCanvas(chunkCol, chunkRow, state, payload, zLevel)[0];
        if (canvas?.isPlaceholder || !isDrawableBakedSurface(canvas)) return false;
        const resolved = this._resolvedChunkCanvas;
        resolved.canvas = canvas;
        resolved.payload = payload;
        return true;
    }
    drawGroundPlaneChunks() {
        const d = this._chunkDraw;
        d.zLevel = 0;
        const frame = this._beginVisibleChunkDraw();
        if (!frame) return;
        const ctx = d.ctx;
        const { obstacleGrid, state, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow } = frame;
        const resolved = this._resolvedChunkCanvas;
        const chunkBounds = this._chunkBounds;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                this.surfaceSpace.chunkBoundsInto(chunkBounds, obstacleGrid, chunkCol, chunkRow);
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, 0)) continue;
                drawBakedTexture(ctx, resolved.canvas, chunkBounds);
            }
    }
    drawStaticRoofChunks() {
        this._drawElevatedChunks(ELEVATED_CHUNK_ROOF);
    }
    drawFlatRailFloorChunks() {
        this._drawElevatedChunks(ELEVATED_CHUNK_FLAT_RAIL);
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
        const resolved = this._resolvedChunkCanvas;
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
                    const drawCanvas = this.getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, chunkBounds, resolved.canvas, resolved.payload);
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
                    drawBakedTexture(ctx, resolved.canvas, chunkBounds);
                }
                ctx.restore();
            }
    }
    ensureWallChunkProfileTextures(state, profileId, wallHeightPx) {
        const cellSize = this.settings.cellSize;
        const sideAtlas = this.getOrEnsureWallAtlas({ x: 0, y: 0 }, { x: cellSize, y: 0 }, state, { profileId, wallHeight: wallHeightPx });
        const sideCanvas = sideAtlas?.canvases?.[0] ?? null;
        const sample = this.surfaceSpace.wallChunkTextureSample(cellSize);
        const payload = {
            chunkCol: sample.chunkCol,
            chunkRow: sample.chunkRow,
            minX: sample.minX,
            minY: sample.minY,
            seed: state.worldSurfaces.worldSurfaceSeed ?? 0,
            profileId,
            centerX: sample.centerX,
            centerY: sample.centerY,
            zLevel: 1,
        };
        const capCanvasEntry = this.getGroundChunkCanvas(sample.chunkCol, sample.chunkRow, state, payload, 1);
        const capCanvas = capCanvasEntry?.[0] ?? null;
        const sideReady = sideCanvas && !sideCanvas.isPlaceholder;
        const capReady = capCanvas && !capCanvas.isPlaceholder;
        const ready = sideReady && capReady;
        return { sideCanvas, capCanvas, ready, scale: this.settings.surfaceBakeScale, chunkSizePx: sample.chunkSizePx };
    }
}
