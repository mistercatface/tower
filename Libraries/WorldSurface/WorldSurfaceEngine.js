/**
 * Procedural world-surface bake cache: ground chunks + wall atlases.
 * Game-agnostic — no phase checks, shadow fill, or GameState profile resolution.
 * See Render/game/WorldSurfaceSystem.js for the game wrapper; Libraries/Render/Structure3D for wall projection.
 */
import { getWallHeight } from "./WorldSurfaceSettings.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { intersectWorldBoundsInto } from "../WorldGen/playBounds.js";
import { getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { ProgressiveFrameCache } from "./ProgressiveFrameCache.js";
import {
    getHorizontalSurfaceZLevels,
    groundChunkCachePrefix,
    getGroundChunkAnimationInfo,
    getWallAtlasAnimationInfo,
    isWallAtlasAnimationEnabled,
    invalidateGroundChunkCacheEntry,
} from "./bake/SurfaceBakeHelpers.js";
import { chunkHasWallSegments, clipChunkToRoofFootprints, drawRoofSegmentDamageOverlays, projectHorizontalSurfaceCorners } from "./HorizontalSurfaceDraw.js";
import { drawImageQuad } from "../Canvas/AffineTexture.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { getWallAtlasCacheInfo } from "./WallSurfaceCache.js";
import { wallFaceAtlasUnrolledHeight } from "./SurfaceCoordinateMapper.js";
import { wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, getTexelResolution, shouldSmoothTextureDownsample } from "./WorldSurfaceResolution.js";
import { animationFrameIndex } from "./ProfileBakeResolver.js";
import { bakeSlotForSourceFrame } from "./AnimationFrameBake.js";
import { bakeFrameRange } from "./AnimationFrameBake.js";
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
        this.surfaceCache = new ProgressiveFrameCache(settings.maxCachedSurfaces);
        this._globalGeneration = 0;
        this._buildChunkPayload = hooks.buildChunkPayload ?? null;
        this.chunkDrawBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
        const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        const zLevels = [0, ...(roofZLevels ?? this.settings.roofZLevels ?? []).filter((z) => z > 0)];
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++)
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
                const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
                const profileId = resolveProfileAt(chunkCenterX, chunkCenterY);
                const ppwu = getTexelResolution(this.settings);
                const rev = getSurfaceProfileRevision(profileId);
                const profile = getSurfaceProfileProvider().getProfile(profileId);
                const { totalFrames } = getGroundChunkAnimationInfo(profile, this.settings, true);
                for (const zLevel of zLevels) invalidateGroundChunkCacheEntry(this.surfaceCache, chunkCol, chunkRow, profileId, rev, ppwu, zLevel, totalFrames);
            }
    }
    /**
     * Drop baked ground chunks for a profile inside world bounds (e.g. assembly playfield overlay).
     * @param {string} profileId
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} worldBounds
     * @param {number[]} [zLevels]
     */
    invalidateProfileGroundChunks(profileId, worldBounds, obstacleGrid, zLevels = [0]) {
        if (!worldBounds || !obstacleGrid || !profileId) return;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, this.settings.cellsPerChunk);
        const range = worldBoundsToChunkRange(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
        const ppwu = getTexelResolution(this.settings);
        const rev = getSurfaceProfileRevision(profileId);
        const profile = getSurfaceProfileProvider().getProfile(profileId);
        const { totalFrames } = getGroundChunkAnimationInfo(profile, this.settings, true);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++)
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++)
                for (let z = 0; z < zLevels.length; z++) invalidateGroundChunkCacheEntry(this.surfaceCache, chunkCol, chunkRow, profileId, rev, ppwu, zLevels[z], totalFrames);
    }
    requestWallAtlasBake(width, height, p1, p2, pixelsPerUnit, proceduralSurfaceDraw, frameRange, profileId, wallHeight = null, wallWidth = null) {
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        return TileWorkerCoordinator.requestWallAtlasBake({
            width,
            height,
            p1,
            p2,
            pixelsPerUnit,
            seed: proceduralSurfaceDraw.surfaceSeed,
            profileId,
            ...frameRange,
            centerX,
            centerY,
            wallHeight,
            wallWidth,
            cellSize: wallWidth,
            animationBakeFrames: proceduralSurfaceDraw.animationBakeFrames,
            animationSourceFrames: proceduralSurfaceDraw.animationSourceFrames,
        });
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
    updateFills() {
        this.surfaceCache.updateFills();
    }
    hasPendingSurfaceBakes() {
        return this.surfaceCache.hasPlaceholders();
    }
    _scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn) {
        const placeholder = this.surfaceCache.getOrStart(key, meta);
        const generation = this.surfaceCache.getCurrentGeneration(key);
        const isAnimated = meta.totalFrames > 1;
        if (isAnimated) this.surfaceCache.requestFill(key, bakeBatchFn, meta.totalFrames);
        bakeFirstFn().then((firstFrameBitmaps) => {
            this.surfaceCache.commitFirstFrame(key, generation, firstFrameBitmaps);
        });
        return placeholder;
    }
    _isChunkAnimationForced(state) {
        return state?.worldSurfaces?.forceChunkAnimation === true;
    }
    getGroundChunkCanvas(chunkCol, chunkRow, state, payload = null, zLevel = 0) {
        if (!payload) payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
        const resolvedZ = payload.zLevel ?? zLevel;
        const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
        const forceAnimation = this._isChunkAnimationForced(state);
        const { enabled: isAnimated, totalFrames, sourceTotal } = getGroundChunkAnimationInfo(profile, this.settings, forceAnimation);
        const bakeFrameCount = isAnimated ? totalFrames : 1;
        const key = groundChunkCachePrefix(chunkCol, chunkRow, payload.profileId, getSurfaceProfileRevision(payload.profileId), getTexelResolution(this.settings), resolvedZ, bakeFrameCount);
        let canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;
        const animationFrameBatchSize = this.settings.animationFrameBatchSize ?? 8;
        const bakePayload = { ...payload, animationBakeFrames: totalFrames, animationSourceFrames: sourceTotal };
        const meta = { kind: "chunk", payload: bakePayload, totalFrames, animationFrameBatchSize };
        const bakeFirstFn = () => {
            const framePayload = { ...bakePayload, ...bakeFrameRange.first() };
            return TileWorkerCoordinator.requestGroundChunkBake(framePayload);
        };
        const bakeBatchFn = isAnimated
            ? (batch) => {
                  return TileWorkerCoordinator.requestGroundChunkBake({ ...bakePayload, ...batch });
              }
            : null;
        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }
    /** Ensure a baked wall atlas exists in the cache (wall faces). */
    ensureWallAtlas(key, p1, p2, columns, proceduralSurfaceDraw, wallHeight = null, profileId = null) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;
        const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
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
        const profile = getSurfaceProfileProvider().getProfile(bakeProfileId);
        const { enabled: isAnimated, totalFrames, sourceTotal } = getWallAtlasAnimationInfo(profile, this.settings);
        const animationFrameBatchSize = this.settings.animationFrameBatchSize ?? 8;
        const animatedSurfaceDraw = { ...proceduralSurfaceDraw, animationBakeFrames: totalFrames, animationSourceFrames: sourceTotal };
        const meta = { kind: "wall", width: canvasWidth, height: canvasHeight, p1, p2, pixelsPerUnit, totalFrames, animationFrameBatchSize };
        const bakeFirstFn = () => {
            const frameRange = bakeFrameRange.first();
            return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, animatedSurfaceDraw, frameRange, bakeProfileId, hVal, cellSize);
        };
        const bakeBatchFn = isAnimated
            ? (batch) => {
                  return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, animatedSurfaceDraw, batch, bakeProfileId, hVal, cellSize);
              }
            : null;
        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }
    /**
     * Resolve cache key and return baked wall atlas frames, scheduling a bake if needed.
     * @param {{ x: number, y: number }} p1
     * @param {{ x: number, y: number }} p2
     * @param {{
     *   profileId: string,
     *   proceduralSurfaceDraw: import("../../Libraries/Render/WorldSceneTypes.js").ProceduralSurfaceDrawContext,
     *   wallHeight?: number | null,
     *   cacheObj?: object | null,
     * }} options
     * @returns {{ key: string, wrappedP1: { x: number, y: number }, wrappedP2: { x: number, y: number }, canvases: object[] } | null}
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
    /** Pick the animation frame (or first frame) from a wall atlas bake. */
    resolveWallAtlasCanvas(canvases, profileId, gameTime = 0) {
        if (!canvases?.length) return null;
        let canvas = canvases[0];
        const profile = getSurfaceProfileProvider().getProfile(profileId);
        if (isWallAtlasAnimationEnabled(profile, this.settings) && canvases.length > 1) {
            const { totalFrames: bakeTotal, sourceTotal } = getWallAtlasAnimationInfo(profile, this.settings);
            const sourceFrame = animationFrameIndex(profile.animation, { gameTime });
            const bakedSlot = bakeSlotForSourceFrame(sourceFrame, bakeTotal, sourceTotal);
            canvas = canvases[Math.min(canvases.length - 1, Math.max(0, bakedSlot))];
        }
        return canvas;
    }
    /**
     * Draw visible ground chunks (no backdrop — use beforeDraw for that).
     * @param {CanvasRenderingContext2D} ctx
     * @param {{
     *   obstacleGrid: { cols: number, cellSize: number, minX: number, minY: number },
     *   viewport: import("../../Libraries/Viewport/Viewport.js").Viewport,
     *   state: object,
     *   gameTime?: number,
     *   zLevel?: number,
     *   wallSpatialIndex?: import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null,
     *   playBounds?: { minX: number, minY: number, maxX: number, maxY: number } | null,
     *   beforeDraw?: (ctx: CanvasRenderingContext2D, bounds: { minX: number, minY: number, maxX: number, maxY: number }) => void,
     * }} options
     */
    drawGroundChunks(ctx, options) {
        const { obstacleGrid, viewport, state, gameTime = 0, zLevel = 0, wallSpatialIndex = null, playBounds = null, beforeDraw, requireWallSegments = true, skipRoofFootprintClip = false } = options;
        const viewerX = viewport.x;
        const viewerY = viewport.y;
        const cellsPerChunk = this.settings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const viewportBounds = viewport.boundsDraw;
        let bounds = viewportBounds;
        if (playBounds) {
            if (!intersectWorldBoundsInto(this.chunkDrawBounds, viewportBounds, playBounds)) return;
            bounds = this.chunkDrawBounds;
        }
        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);
        if (beforeDraw) beforeDraw(ctx, bounds);
        const minChunkCol = worldToChunkCol(bounds.minX, obstacleGrid.minX, chunkSizePx);
        const maxChunkCol = worldToChunkCol(bounds.maxX - 1, obstacleGrid.minX, chunkSizePx);
        const minChunkRow = worldToChunkRow(bounds.minY, obstacleGrid.minY, chunkSizePx);
        const maxChunkRow = worldToChunkRow(bounds.maxY - 1, obstacleGrid.minY, chunkSizePx);
        ctx.save();
        if (playBounds) {
            ctx.beginPath();
            ctx.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            ctx.clip();
        }
        ctx.imageSmoothingEnabled = false;
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++)
            for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) {
                const originX = obstacleGrid.minX + chunkCol * chunkSizePx;
                const originY = obstacleGrid.minY + chunkRow * chunkSizePx;
                if (zLevel > 0 && requireWallSegments && !chunkHasWallSegments(wallSpatialIndex, originX, originY, chunkSizePx)) continue;
                const payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
                const canvases = this.getGroundChunkCanvas(chunkCol, chunkRow, state, payload, zLevel);
                let canvas = canvases[0];
                if (canvas.isPlaceholder) continue;
                const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
                const forceAnimation = this._isChunkAnimationForced(state);
                const { enabled: chunkAnimationEnabled, totalFrames: bakeTotal, sourceTotal } = getGroundChunkAnimationInfo(profile, this.settings, forceAnimation);
                if ((zLevel === 0 || forceAnimation) && chunkAnimationEnabled && canvases.length > 1) {
                    const sourceFrame = animationFrameIndex(profile.animation, { gameTime });
                    const bakedSlot = bakeSlotForSourceFrame(sourceFrame, bakeTotal, sourceTotal);
                    canvas = canvases[Math.min(canvases.length - 1, Math.max(0, bakedSlot))];
                }
                if (zLevel > 0) {
                    ctx.save();
                    if (!skipRoofFootprintClip && !clipChunkToRoofFootprints(ctx, originX, originY, chunkSizePx, zLevel, viewerX, viewerY, this.settings.cameraHeight, options.renderScene)) {
                        ctx.restore();
                        continue;
                    }
                    const corners = projectHorizontalSurfaceCorners(originX, originY, chunkSizePx, zLevel, viewerX, viewerY, this.settings.cameraHeight);
                    const dstX = corners[0].x;
                    const dstY = corners[0].y;
                    const dstW = corners[2].x - corners[0].x;
                    const dstH = corners[2].y - corners[0].y;
                    const bleedPx = this.settings.wallTextureBleedPx ?? 1;
                    ctx.drawImage(canvas, dstX - bleedPx, dstY - bleedPx, dstW + bleedPx * 2, dstH + bleedPx * 2);
                    ctx.restore();
                    drawRoofSegmentDamageOverlays(ctx, originX, originY, chunkSizePx, zLevel, viewerX, viewerY, this.settings.cameraHeight, options.renderScene);
                } else drawBakedTexture(ctx, canvas, originX, originY, chunkSizePx, chunkSizePx, this.settings);
            }
        ctx.restore();
    }
    /** Elevated horizontal layers (z > 0) — chunk-cached, clipped to wall footprints. */
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
