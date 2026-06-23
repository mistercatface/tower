/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
import { createAabb, intersectAabbOptionalInto } from "../Math/Aabb2D.js";
import { getChunkSizePx, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { groundChunkCachePrefix, staticRoofDrawCachePrefix, staticRoofMaskCachePrefix } from "./bake/SurfaceBakeHelpers.js";
import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { chunkHasBlockedCells, buildStaticRoofMaskCanvas } from "./HorizontalSurfaceDraw.js";
import { clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { buildWallAtlasCacheKey } from "./WallSurfaceCache.js";
import { createWallFaceAxes } from "./SurfaceCoordinateMapper.js";
import { wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, drawProjectedHorizontalChunkAt, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";
const ELEVATED_CHUNK_ROOF = 0;
const ELEVATED_CHUNK_FLAT_RAIL = 1;
/**
 * @typedef {Object} WorldSurfaceEngineHooks
 * @property {(state: object, chunkCol: number, chunkRow: number, zLevel?: number, profileId?: string | null) => object} buildChunkPayload
 */
export class WorldSurfaceEngine {
    constructor(settings, hooks = {}) {
        this.settings = settings;
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this._buildChunkPayload = hooks.buildChunkPayload ?? null;
        this.chunkDrawBounds = createAabb();
        this._chunkDraw = { ctx: null, obstacleGrid: null, viewport: null, state: null, playBounds: null, zLevel: 0, beforeDraw: null };
        this._visibleChunkFrame = { obstacleGrid: null, viewport: null, state: null, zLevel: 0, chunkSizePx: 0, minChunkCol: 0, maxChunkCol: 0, minChunkRow: 0, maxChunkRow: 0 };
        this._resolvedChunkCanvas = { canvas: null, payload: null };
    }
    clear() {
        this.surfaceCache.clear();
    }
    invalidateGridBounds(bounds, obstacleGrid, resolveProfileAt, cellsPerChunk = this.settings.cellsPerChunk, roofZLevels = null) {
        if (!bounds || !obstacleGrid) return;
        const cellSize = obstacleGrid.cellSize;
        const chunkSizePx = cellSize * cellsPerChunk;
        const minX = obstacleGrid.minX + bounds.startCol * cellSize;
        const minY = obstacleGrid.minY + bounds.startRow * cellSize;
        const maxX = obstacleGrid.minX + (bounds.endCol + 1) * cellSize;
        const maxY = obstacleGrid.minY + (bounds.endRow + 1) * cellSize;
        const range = worldBoundsToChunkRange(minX, minY, maxX, maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
        const zLevels = [0, ...(roofZLevels ?? this.settings.roofZLevels ?? []).filter((z) => z > 0)];
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++)
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
                const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
                const profileId = resolveProfileAt(chunkCenterX, chunkCenterY);
                const rev = getSurfaceProfileRevision(profileId);
                for (const zLevel of zLevels) {
                    this.surfaceCache.delete(groundChunkCachePrefix(chunkCol, chunkRow, profileId, rev, zLevel));
                    if (zLevel <= 0) continue;
                    this.surfaceCache.delete(staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel));
                    this.surfaceCache.delete(staticRoofDrawCachePrefix(chunkCol, chunkRow, profileId, rev, zLevel));
                }
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
        const wallCenterX = (p1.x + p2.x) / 2;
        const wallCenterY = (p1.y + p2.y) / 2;
        const bakeProfileId = profileId;
        return this._scheduleBake(key, () =>
            TileWorkerCoordinator.requestWallAtlasBake({
                width: canvasWidth,
                height: canvasHeight,
                p1,
                p2,
                seed: surfaceSeed,
                profileId: bakeProfileId,
                ...bakeFrameRange.first(),
                centerX: wallCenterX,
                centerY: wallCenterY,
                wallHeight: hVal,
            }),
        );
    }
    _resolveChunkPayload(state, chunkCol, chunkRow, zLevel = 0, profileId = null) {
        if (!this._buildChunkPayload) throw new Error("WorldSurfaceEngine requires buildChunkPayload hook");
        return this._buildChunkPayload(state, chunkCol, chunkRow, zLevel, profileId);
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
        const key = groundChunkCachePrefix(chunkCol, chunkRow, payload.profileId, getSurfaceProfileRevision(payload.profileId), resolvedZ);
        let canvases = this.surfaceCache.get(key);
        if (canvases) {
            const canvas = canvases[0];
            if (canvas?.isPlaceholder) return canvases;
            if (isDrawableBakedSurface(canvas)) return canvases;
            this.surfaceCache.delete(key);
        }
        const workerPayload = {
            chunkCol: payload.chunkCol,
            chunkRow: payload.chunkRow,
            minX: payload.minX,
            minY: payload.minY,
            seed: payload.seed,
            profileId: payload.profileId,
            centerX: payload.centerX,
            centerY: payload.centerY,
            zLevel: payload.zLevel ?? zLevel,
            frameStart: 0,
            frameCount: 1,
        };
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(workerPayload));
    }
    getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, originX, originY, sizePx, roofCanvas, payload) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const rev = getSurfaceProfileRevision(payload.profileId);
        const drawKey = staticRoofDrawCachePrefix(chunkCol, chunkRow, payload.profileId, rev, zLevel);
        const maskKey = staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel);
        let maskEntry = this.surfaceCache.get(maskKey);
        if (!maskEntry) {
            const maskCanvas = buildStaticRoofMaskCanvas(obstacleGrid, originX, originY, sizePx, zLevel, this.settings);
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
        const rev = getSurfaceProfileRevision(profileId);
        const wallHeightKey = resolveWallCapHeightPx(wallHeight, this.settings);
        if (cacheObj) {
            const stash = cacheObj._wallAtlasStashes?.[atlasFaceId];
            if (stash && stash.profileId === profileId && stash.rev === rev && stash.seed === seed && stash.wallHeightKey === wallHeightKey && this.surfaceCache.get(stash.key) === stash.canvases)
                return stash;
        }
        const { key, wrappedP1, wrappedP2 } = buildWallAtlasCacheKey(p1, p2, seed, profileId, wallHeightKey, this.settings);
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
        const cellsPerChunk = this.settings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        let minX = worldCorners[0].x;
        let minY = worldCorners[0].y;
        for (let i = 1; i < worldCorners.length; i++) {
            if (worldCorners[i].x < minX) minX = worldCorners[i].x;
            if (worldCorners[i].y < minY) minY = worldCorners[i].y;
        }
        const chunkCol = worldToChunkCol(minX, obstacleGrid.minX, chunkSizePx);
        const chunkRow = worldToChunkRow(minY, obstacleGrid.minY, chunkSizePx);
        const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
        const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
        const payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel, profileId);
        const canvas = this.getGroundChunkCanvas(chunkCol, chunkRow, state, payload, zLevel)[0];
        if (!canvas || canvas.isPlaceholder) return null;
        for (let i = 0; i < 4; i++) {
            outSrc4[i].x = (worldCorners[i].x - originX) * surfaceBakeScale;
            outSrc4[i].y = (worldCorners[i].y - originY) * surfaceBakeScale;
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
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, this.settings.cellsPerChunk);
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
        frame.chunkSizePx = chunkSizePx;
        frame.minChunkCol = worldToChunkCol(bounds.minX, obstacleGrid.minX, chunkSizePx);
        frame.maxChunkCol = worldToChunkCol(bounds.maxX - 1, obstacleGrid.minX, chunkSizePx);
        frame.minChunkRow = worldToChunkRow(bounds.minY, obstacleGrid.minY, chunkSizePx);
        frame.maxChunkRow = worldToChunkRow(bounds.maxY - 1, obstacleGrid.minY, chunkSizePx);
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
        const { obstacleGrid, state, chunkSizePx, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow } = frame;
        const resolved = this._resolvedChunkCanvas;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
                const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, 0)) continue;
                drawBakedTexture(ctx, resolved.canvas, originX, originY, chunkSizePx, chunkSizePx);
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
        const { obstacleGrid, chunkSizePx, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow, viewport } = frame;
        const resolved = this._resolvedChunkCanvas;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
                const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
                if (mode === ELEVATED_CHUNK_ROOF) {
                    if (!chunkHasBlockedCells(obstacleGrid, originX, originY, chunkSizePx) && !chunkHasStaticRoofAtLevel(obstacleGrid, originX, originY, chunkSizePx, zLevel)) continue;
                } else if (!chunkHasStaticStructureAtLevel(obstacleGrid, originX, originY, chunkSizePx, zLevel)) continue;
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel)) continue;
                ctx.save();
                if (mode === ELEVATED_CHUNK_ROOF) {
                    const drawCanvas = this.getStaticRoofDrawCanvas(chunkCol, chunkRow, zLevel, obstacleGrid, originX, originY, chunkSizePx, resolved.canvas, resolved.payload);
                    if (!drawCanvas || drawCanvas.isPlaceholder) {
                        ctx.restore();
                        continue;
                    }
                    drawProjectedHorizontalChunkAt(ctx, drawCanvas, originX, originY, chunkSizePx, zLevel, viewport);
                } else {
                    if (!clipChunkToFlatWallFootprints(ctx, obstacleGrid, originX, originY, chunkSizePx, zLevel)) {
                        ctx.restore();
                        continue;
                    }
                    drawBakedTexture(ctx, resolved.canvas, originX, originY, chunkSizePx, chunkSizePx);
                }
                ctx.restore();
            }
    }
}
