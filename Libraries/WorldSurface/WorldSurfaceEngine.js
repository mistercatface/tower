/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 */
import { createAabb, intersectAabbOptionalInto } from "../Math/Aabb2D.js";
import { getChunkSizePx, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { groundChunkCachePrefix, staticRoofDrawCachePrefix, staticRoofMaskCachePrefix } from "./bake/SurfaceBakeHelpers.js";
import { composeDestinationIn } from "../Canvas/maskCompositor.js";
import { chunkHasBlockedCells, buildStaticRoofMaskCanvas } from "./HorizontalSurfaceDraw.js";
import { projectHorizontalSurfaceCornersInto, clipChunkToFlatWallFootprints } from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel, chunkHasStaticStructureAtLevel, resolveWallCapHeightPx } from "../World/wallGridBake.js";
import { chunkWorldAabbInto } from "../Spatial/grid/GridCoords.js";
import { elevationCameraFromViewportInto } from "../Spatial/iso/ElevationCamera.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { buildWallAtlasCacheKey } from "./WallSurfaceCache.js";
import { createWallFaceAxes } from "./SurfaceCoordinateMapper.js";
import { wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, drawProjectedHorizontalChunk, getSurfaceBakeScale, isDrawableBakedSurface } from "./WorldSurfaceResolution.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";
const sRoofChunkCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
const ELEVATED_CHUNK_ROOF = 0;
const ELEVATED_CHUNK_FLAT_RAIL = 1;
/**
 * @typedef {Object} WorldSurfaceEngineHooks
 * @property {(state: object, chunkCol: number, chunkRow: number, zLevel?: number) => object} buildChunkPayload
 */
export class WorldSurfaceEngine {
    constructor(settings, hooks = {}) {
        this.settings = settings;
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this._buildChunkPayload = hooks.buildChunkPayload ?? null;
        this.chunkDrawBounds = createAabb();
        this.groundChunkPassAabb = createAabb();
        this.groundChunkPassCamera = {};
        this.groundChunkDrawPass = {
            chunkCol: 0,
            chunkRow: 0,
            originX: 0,
            originY: 0,
            sizePx: 0,
            zLevel: 0,
            viewport: null,
            obstacleGrid: null,
            settings: null,
            state: null,
            chunkAabb: this.groundChunkPassAabb,
            camera: this.groundChunkPassCamera,
        };
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
    ensureWallAtlas(key, p1, p2, columns, proceduralSurfaceDraw, wallHeight = null, profileId = null) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const edgeLen = createWallFaceAxes(p1, p2).edgeLen;
        if (edgeLen < 0.001 || columns.length === 0) return null;
        const cellSize = this.settings.cellSize;
        const surfaceBakeScale = getSurfaceBakeScale(this.settings);
        const canvasWidth = Math.max(1, Math.ceil(edgeLen * surfaceBakeScale));
        const hVal = resolveWallCapHeightPx(wallHeight, this.settings);
        const canvasHeight = Math.max(1, Math.ceil((hVal + cellSize) * surfaceBakeScale));
        const wallCenterX = (p1.x + p2.x) / 2;
        const wallCenterY = (p1.y + p2.y) / 2;
        const bakeProfileId = profileId ?? proceduralSurfaceDraw.resolveProfileAt(wallCenterX, wallCenterY);
        return this._scheduleBake(key, () =>
            TileWorkerCoordinator.requestWallAtlasBake({
                width: canvasWidth,
                height: canvasHeight,
                p1,
                p2,
                seed: proceduralSurfaceDraw.surfaceSeed,
                profileId: bakeProfileId,
                ...bakeFrameRange.first(),
                centerX: wallCenterX,
                centerY: wallCenterY,
                wallHeight: hVal,
            }),
        );
    }
    _resolveChunkPayload(state, chunkCol, chunkRow, zLevel = 0) {
        if (!this._buildChunkPayload) throw new Error("WorldSurfaceEngine requires buildChunkPayload hook");
        const payload = this._buildChunkPayload(state, chunkCol, chunkRow, zLevel);
        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = this.settings.cellsPerChunk;
        if (obstacleGrid && payload.centerX == null) {
            const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
            payload.centerX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
            payload.centerY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
        }
        return payload;
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
        const bakePayload = { ...payload, ...bakeFrameRange.first() };
        return this._scheduleBake(key, () => TileWorkerCoordinator.requestGroundChunkBake(bakePayload));
    }
    /**
     * @param {import("./ChunkDrawPass.js").ChunkDrawPass} pass
     * @param {CanvasImageSource} roofCanvas
     * @param {object} payload
     */
    getStaticRoofDrawCanvas(pass, roofCanvas, payload) {
        if (roofCanvas.isPlaceholder) return roofCanvas;
        const { chunkCol, chunkRow, zLevel, obstacleGrid, originX, originY, sizePx, settings } = pass;
        const rev = getSurfaceProfileRevision(payload.profileId);
        const drawKey = staticRoofDrawCachePrefix(chunkCol, chunkRow, payload.profileId, rev, zLevel);
        const maskKey = staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel);
        let maskEntry = this.surfaceCache.get(maskKey);
        if (!maskEntry) {
            const maskCanvas = buildStaticRoofMaskCanvas(obstacleGrid, originX, originY, sizePx, zLevel, settings);
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
     * @param {{
     *   profileId: string,
     *   proceduralSurfaceDraw: import("../../Libraries/Render/WorldSceneTypes.js").ProceduralSurfaceDrawContext,
     *   wallHeight?: number | null,
     *   cacheObj?: object | null,
     *   atlasFaceId?: string,
     * }} options
     */
    getOrEnsureWallAtlas(p1, p2, options) {
        const { profileId, proceduralSurfaceDraw, wallHeight = null, cacheObj = null, atlasFaceId = "side" } = options;
        const seed = proceduralSurfaceDraw.surfaceSeed;
        const rev = getSurfaceProfileRevision(profileId);
        const wallHeightKey = resolveWallCapHeightPx(wallHeight, this.settings);
        if (cacheObj) {
            const stash = cacheObj._wallAtlasStashes?.[atlasFaceId];
            if (stash && stash.profileId === profileId && stash.rev === rev && stash.seed === seed && stash.wallHeightKey === wallHeightKey && this.surfaceCache.get(stash.key) === stash.canvases)
                return stash;
        }
        const { key, wrappedP1, wrappedP2 } = buildWallAtlasCacheKey(p1, p2, proceduralSurfaceDraw, profileId, wallHeightKey, this.settings);
        let canvases = this.surfaceCache.get(key);
        if (!canvases) {
            const columns = wallFaceColumns(wrappedP1, wrappedP2, this.settings.cellSize);
            if (columns.length === 0) return null;
            canvases = this.ensureWallAtlas(key, wrappedP1, wrappedP2, columns, proceduralSurfaceDraw, wallHeight, profileId);
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
     * Per-corner chunk UV for a horizontal cap quad (world corners in draw order).
     * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} worldCorners
     * @param {number} zLevel
     * @param {object} state
     * @param {string} profileId
     * @returns {{ canvas: CanvasImageSource & { width: number, height: number }, src: [{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }] } | null}
     */
    getHorizontalCapDrawSample(worldCorners, zLevel, state, profileId) {
        const surfaceBakeScale = getSurfaceBakeScale(this.settings);
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
        const payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
        payload.profileId = profileId;
        const canvases = this.getGroundChunkCanvas(chunkCol, chunkRow, state, payload, zLevel);
        const canvas = canvases[0];
        if (!canvas || canvas.isPlaceholder) return null;
        const src = worldCorners.map((c) => ({ x: (c.x - originX) * surfaceBakeScale, y: (c.y - originY) * surfaceBakeScale }));
        return { canvas, src };
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
    _bindElevatedChunkPass(frame) {
        elevationCameraFromViewportInto(this.groundChunkPassCamera, frame.viewport);
        const pass = this.groundChunkDrawPass;
        pass.viewport = frame.viewport;
        pass.obstacleGrid = frame.obstacleGrid;
        pass.settings = this.settings;
        pass.state = frame.state;
        pass.zLevel = frame.zLevel;
        pass.sizePx = frame.chunkSizePx;
        pass.camera = this.groundChunkPassCamera;
        return pass;
    }
    _assignElevatedChunkPass(pass, chunkCol, chunkRow, originX, originY, chunkSizePx) {
        pass.chunkCol = chunkCol;
        pass.chunkRow = chunkRow;
        pass.originX = originX;
        pass.originY = originY;
        chunkWorldAabbInto(this.groundChunkPassAabb, originX, originY, chunkSizePx);
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
                drawBakedTexture(ctx, resolved.canvas, originX, originY, chunkSizePx, chunkSizePx, this.settings);
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
        const pass = this._bindElevatedChunkPass(frame);
        const { obstacleGrid, state, chunkSizePx, minChunkCol, maxChunkCol, minChunkRow, maxChunkRow } = frame;
        const resolved = this._resolvedChunkCanvas;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
                const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
                if (!chunkHasBlockedCells(obstacleGrid, originX, originY, chunkSizePx)) continue;
                if (mode === ELEVATED_CHUNK_ROOF) {
                    if (!chunkHasStaticRoofAtLevel(obstacleGrid, originX, originY, chunkSizePx, zLevel)) continue;
                } else if (!chunkHasStaticStructureAtLevel(obstacleGrid, originX, originY, chunkSizePx, zLevel)) continue;
                if (!this._fillDrawableGroundChunkCanvas(chunkCol, chunkRow, zLevel)) continue;
                this._assignElevatedChunkPass(pass, chunkCol, chunkRow, originX, originY, chunkSizePx);
                ctx.save();
                if (mode === ELEVATED_CHUNK_ROOF) {
                    const drawCanvas = this.getStaticRoofDrawCanvas(pass, resolved.canvas, resolved.payload);
                    if (!drawCanvas || drawCanvas.isPlaceholder) {
                        ctx.restore();
                        continue;
                    }
                    const corners = projectHorizontalSurfaceCornersInto(sRoofChunkCorners, pass);
                    drawProjectedHorizontalChunk(ctx, drawCanvas, corners, this.settings);
                } else {
                    if (!clipChunkToFlatWallFootprints(ctx, pass)) {
                        ctx.restore();
                        continue;
                    }
                    drawBakedTexture(ctx, resolved.canvas, originX, originY, chunkSizePx, chunkSizePx, this.settings);
                }
                ctx.restore();
            }
    }
}
