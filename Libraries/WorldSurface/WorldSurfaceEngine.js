/**
 * Procedural world-surface bake cache: static ground chunks + wall atlases (frame 0 only).
 * Animated surfaces are baked at assembly spawn — see Libraries/Sandbox/assemblySurfaceBake.js.
 */
import { getWallHeight } from "./WorldSurfaceSettings.js";
import { createAabb, intersectAabbOptionalInto } from "../Math/Aabb2D.js";
import { clipToAabb } from "../Canvas/CanvasPath.js";
import { getChunkSizePx, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { SurfaceBitmapCache } from "./SurfaceBitmapCache.js";
import { groundChunkCachePrefix, staticRoofDrawCachePrefix, staticRoofMaskCachePrefix } from "./bake/SurfaceBakeHelpers.js";
import { chunkHasWallSegments, chunkHasBlockedCells, buildStaticRoofMaskCanvas, applyStaticRoofMaskToCanvas } from "./HorizontalSurfaceDraw.js";
import {
    createChunkDrawPass,
    projectHorizontalSurfaceCornersInto,
    clipChunkToRoofFootprints,
    clipChunkToWallFootprints,
    clipChunkToBlockedCells,
    drawRoofSegmentDamageOverlays,
    drawWallFootprintDamageOverlays,
    drawStaticRoofDamageOverlays,
    drawStaticWallFootprintDamageOverlays,
} from "./ChunkDrawPass.js";
import { chunkHasStaticRoofAtLevel } from "../World/staticOccupancyLayers.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { getWallAtlasCacheInfo } from "./WallSurfaceCache.js";
import { createWallFaceAxes, wallFaceAtlasUnrolledHeight } from "./SurfaceCoordinateMapper.js";
import { wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, drawProjectedHorizontalChunk, getTexelResolution } from "./WorldSurfaceResolution.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";
const sRoofChunkCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/**
 * @typedef {Object} WorldSurfaceEngineHooks
 * @property {(state: object, chunkCol: number, chunkRow: number, zLevel?: number) => object} buildChunkPayload
 */
export class WorldSurfaceEngine {
    /**
     * @param {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} settings
     * @param {WorldSurfaceEngineHooks} [hooks]
     */
    constructor(settings, hooks = {}) {
        this.settings = settings;
        this.surfaceCache = new SurfaceBitmapCache(settings.maxCachedSurfaces);
        this._buildChunkPayload = hooks.buildChunkPayload ?? null;
        this.chunkDrawBounds = createAabb();
    }
    clear() {
        this.surfaceCache.clear();
    }
    /**
     * @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} bounds
     * @param {{ cellSize: number, minX: number, minY: number }} obstacleGrid
     * @param {(x: number, y: number) => string} resolveProfileAt
     * @param {number} [cellsPerChunk]
     */
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
                const ppwu = getTexelResolution(this.settings);
                const rev = getSurfaceProfileRevision(profileId);
                for (const zLevel of zLevels) {
                    this.surfaceCache.delete(groundChunkCachePrefix(chunkCol, chunkRow, profileId, rev, ppwu, zLevel));
                    if (zLevel <= 0) continue;
                    this.surfaceCache.delete(staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel));
                    this.surfaceCache.delete(staticRoofDrawCachePrefix(chunkCol, chunkRow, profileId, rev, ppwu, zLevel));
                }
            }
    }
    ensureWallAtlas(key, p1, p2, columns, proceduralSurfaceDraw, wallHeight = null, profileId = null) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const edgeLen = createWallFaceAxes(p1, p2).edgeLen;
        if (edgeLen < 0.001 || columns.length === 0) return null;
        const cellSize = proceduralSurfaceDraw.obstacleCellSize ?? this.settings.cellSize;
        const pixelsPerUnit = getTexelResolution(this.settings);
        const canvasWidth = Math.max(1, Math.ceil(edgeLen * pixelsPerUnit));
        const hVal = wallHeight ?? getWallHeight(this.settings);
        const unrolledHeight = wallFaceAtlasUnrolledHeight(hVal, cellSize);
        const canvasHeight = Math.max(1, Math.ceil(unrolledHeight * pixelsPerUnit));
        const wallCenterX = (p1.x + p2.x) / 2;
        const wallCenterY = (p1.y + p2.y) / 2;
        const bakeProfileId = profileId ?? proceduralSurfaceDraw.resolveProfileAt(wallCenterX, wallCenterY);
        return this._scheduleBake(key, () =>
            TileWorkerCoordinator.requestWallAtlasBake({
                width: canvasWidth,
                height: canvasHeight,
                p1,
                p2,
                pixelsPerUnit,
                seed: proceduralSurfaceDraw.surfaceSeed,
                profileId: bakeProfileId,
                ...bakeFrameRange.first(),
                centerX: wallCenterX,
                centerY: wallCenterY,
                wallHeight: hVal,
                wallWidth: cellSize,
                cellSize,
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
        const key = groundChunkCachePrefix(chunkCol, chunkRow, payload.profileId, getSurfaceProfileRevision(payload.profileId), getTexelResolution(this.settings), resolvedZ);
        let canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;
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
        const { chunkCol, chunkRow, zLevel, obstacleGrid, staticOccupancyLayers, originX, originY, sizePx } = pass;
        const ppwu = getTexelResolution(this.settings);
        const rev = getSurfaceProfileRevision(payload.profileId);
        const drawKey = staticRoofDrawCachePrefix(chunkCol, chunkRow, payload.profileId, rev, ppwu, zLevel);
        const maskKey = staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel);
        let maskEntry = this.surfaceCache.get(maskKey);
        if (!maskEntry) {
            const maskCanvas = buildStaticRoofMaskCanvas(obstacleGrid, originX, originY, sizePx, zLevel, staticOccupancyLayers, ppwu);
            if (!maskCanvas) {
                this.surfaceCache.delete(drawKey);
                return null;
            }
            maskEntry = [maskCanvas];
            this.surfaceCache.set(maskKey, maskEntry);
            this.surfaceCache.delete(drawKey);
        }
        let cached = this.surfaceCache.get(drawKey);
        if (cached?.[0] && !cached[0].isPlaceholder) return cached[0];
        const masked = applyStaticRoofMaskToCanvas(roofCanvas, maskEntry[0]);
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
     * }} options
     */
    getOrEnsureWallAtlas(p1, p2, options) {
        const { profileId, proceduralSurfaceDraw, wallHeight = null, cacheObj = null } = options;
        const ppwu = getTexelResolution(this.settings);
        const { key, wrappedP1, wrappedP2 } = getWallAtlasCacheInfo(p1, p2, proceduralSurfaceDraw, profileId, ppwu, cacheObj, this.settings);
        let canvases = this.surfaceCache.get(key);
        if (!canvases) {
            const columns = wallFaceColumns(wrappedP1, wrappedP2, this.settings.cellSize);
            if (columns.length === 0) return null;
            canvases = this.ensureWallAtlas(key, wrappedP1, wrappedP2, columns, proceduralSurfaceDraw, wallHeight, profileId);
            if (!canvases || canvases.length === 0) return null;
        }
        return { key, wrappedP1, wrappedP2, canvases };
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {{
     *   obstacleGrid: { cols: number, cellSize: number, minX: number, minY: number },
     *   viewport: import("../../Libraries/Viewport/Viewport.js").Viewport,
     *   state: object,
     *   zLevel?: number,
     *   wallSpatialIndex?: import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null,
     *   playBounds?: import("../Math/Aabb2D.js").Aabb2D | null,
     *   beforeDraw?: (ctx: CanvasRenderingContext2D, bounds: import("../Math/Aabb2D.js").Aabb2D) => void,
     *   requireWallSegments?: boolean,
     *   skipRoofFootprintClip?: boolean,
     *   flatWallRails?: boolean,
     *   staticRoofDraw?: boolean,
     *   staticOccupancyLayers?: import("../World/staticOccupancyLayers.js").StaticOccupancyLayer[],
     *   renderScene?: import("../Render/Scene/RenderScene.js").RenderScene,
     * }} options
     */
    drawGroundChunks(ctx, options) {
        const {
            obstacleGrid,
            viewport,
            state,
            zLevel = 0,
            wallSpatialIndex = null,
            playBounds = null,
            beforeDraw,
            requireWallSegments = true,
            skipRoofFootprintClip = false,
            flatWallRails = false,
            staticRoofDraw = false,
            staticOccupancyLayers = null,
        } = options;
        const viewerX = viewport.x;
        const viewerY = viewport.y;
        const cellsPerChunk = this.settings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const viewportBounds = viewport.boundsDraw;
        let bounds = viewportBounds;
        if (playBounds) {
            if (!intersectAabbOptionalInto(this.chunkDrawBounds, viewportBounds, playBounds)) return;
            bounds = this.chunkDrawBounds;
        }
        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);
        if (beforeDraw) beforeDraw(ctx, bounds);
        const minChunkCol = worldToChunkCol(bounds.minX, obstacleGrid.minX, chunkSizePx);
        const maxChunkCol = worldToChunkCol(bounds.maxX - 1, obstacleGrid.minX, chunkSizePx);
        const minChunkRow = worldToChunkRow(bounds.minY, obstacleGrid.minY, chunkSizePx);
        const maxChunkRow = worldToChunkRow(bounds.maxY - 1, obstacleGrid.minY, chunkSizePx);
        ctx.save();
        if (playBounds) clipToAabb(ctx, bounds);
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
                const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
                if (
                    zLevel > 0 &&
                    requireWallSegments &&
                    !chunkHasWallSegments(wallSpatialIndex, originX, originY, chunkSizePx) &&
                    !chunkHasBlockedCells(obstacleGrid, originX, originY, chunkSizePx) &&
                    !(staticRoofDraw && chunkHasStaticRoofAtLevel(obstacleGrid, originX, originY, chunkSizePx, zLevel, staticOccupancyLayers))
                )
                    continue;
                const payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
                const canvases = this.getGroundChunkCanvas(chunkCol, chunkRow, state, payload, zLevel);
                const canvas = canvases[0];
                if (canvas.isPlaceholder) continue;
                const pass = createChunkDrawPass({
                    chunkCol,
                    chunkRow,
                    originX,
                    originY,
                    sizePx: chunkSizePx,
                    zLevel,
                    viewerX,
                    viewerY,
                    cameraHeight: this.settings.cameraHeight,
                    viewport,
                    obstacleGrid,
                    staticOccupancyLayers,
                    state,
                    renderScene: options.renderScene ?? null,
                    wallSpatialIndex: flatWallRails ? wallSpatialIndex : null,
                });
                if (zLevel > 0) {
                    ctx.save();
                    if (staticRoofDraw) {
                        const drawCanvas = this.getStaticRoofDrawCanvas(pass, canvas, payload);
                        if (!drawCanvas || drawCanvas.isPlaceholder) {
                            ctx.restore();
                            continue;
                        }
                        const corners = projectHorizontalSurfaceCornersInto(sRoofChunkCorners, pass);
                        drawProjectedHorizontalChunk(ctx, drawCanvas, corners, this.settings);
                        drawStaticRoofDamageOverlays(ctx, pass, sRoofChunkCorners);
                    } else {
                        const clipped = flatWallRails ? clipChunkToWallFootprints(ctx, pass) || clipChunkToBlockedCells(ctx, pass) : !skipRoofFootprintClip && clipChunkToRoofFootprints(ctx, pass);
                        if (!clipped) {
                            ctx.restore();
                            continue;
                        }
                        if (flatWallRails) {
                            drawBakedTexture(ctx, canvas, originX, originY, chunkSizePx, chunkSizePx, this.settings);
                            drawWallFootprintDamageOverlays(ctx, pass);
                            drawStaticWallFootprintDamageOverlays(ctx, pass);
                        } else {
                            const corners = projectHorizontalSurfaceCornersInto(sRoofChunkCorners, pass);
                            drawProjectedHorizontalChunk(ctx, canvas, corners, this.settings);
                            drawRoofSegmentDamageOverlays(ctx, pass);
                        }
                    }
                    ctx.restore();
                } else drawBakedTexture(ctx, canvas, originX, originY, chunkSizePx, chunkSizePx, this.settings);
            }
        ctx.restore();
    }
    drawRoofLayers(ctx, baseOptions) {
        const levels = baseOptions.roofZLevels ?? this.settings.roofZLevels ?? [];
        for (let i = 0; i < levels.length; i++) {
            const z = levels[i];
            if (z <= 0) continue;
            const roofSpatialIndex = baseOptions.roofSpatialIndices?.get(z) ?? baseOptions.wallSpatialIndex;
            this.drawGroundChunks(ctx, { ...baseOptions, wallSpatialIndex: roofSpatialIndex, zLevel: z, beforeDraw: undefined });
        }
    }
}
