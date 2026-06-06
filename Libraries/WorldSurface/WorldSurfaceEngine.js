/**
 * Procedural world-surface bake cache: ground chunks + wall atlases.
 * Game-agnostic — no phase checks, shadow fill, or GameState profile resolution.
 * See Render/game/WorldSurfaceSystem.js for the game wrapper; Libraries/Render/Structure3D for wall projection.
 */
import { resolveWallVisualHeight } from "./WorldSurfaceSettings.js";
import { getSurfaceProfileProvider } from "../Procedural/SurfaceProfileProvider.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../Spatial/grid/ChunkGrid.js";
import { ProgressiveFrameCache } from "./ProgressiveFrameCache.js";
import {
    getHorizontalSurfaceZLevels,
    groundChunkCachePrefix,
    getGroundChunkAnimationInfo,
    getWallAtlasAnimationInfo,
    isWallAtlasAnimationEnabled,
} from "./bake/SurfaceBakeHelpers.js";
import {
    clipToHorizontalSurfaceRegions,
    horizontalChunkIntersectsAnyRegion,
    projectHorizontalSurfaceCorners,
} from "./HorizontalSurfaceDraw.js";
import { drawImageQuad } from "../Canvas/AffineTexture.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
import { getWallAtlasCacheInfo } from "./WallSurfaceCache.js";
import { wallFaceColumns } from "./WallFaceColumns.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { drawBakedTexture, getPixelsPerWorldUnit, shouldSmoothTextureDownsample } from "./WorldSurfaceResolution.js";
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
        this.proceduralProfileId = null;
        this._globalGeneration = 0;
        this._buildChunkPayload = hooks.buildChunkPayload ?? null;
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
    invalidateGridBounds(bounds, obstacleGrid, resolveProfileAt, cellsPerChunk = this.settings.cellsPerChunk) {
        if (!bounds || !obstacleGrid) return;
        const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
                const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
                const profileId = resolveProfileAt(chunkCenterX, chunkCenterY);
                const ppwu = getPixelsPerWorldUnit(this.settings);
                const rev = getSurfaceProfileRevision(profileId);
                for (const zLevel of getHorizontalSurfaceZLevels(this.settings)) {
                    this.surfaceCache.deleteByPrefix(
                        groundChunkCachePrefix(chunkCol, chunkRow, profileId, rev, ppwu, zLevel).substring(6),
                    );
                }
            }
        }
    }

    requestWallAtlasBake(width, height, p1, p2, pixelsPerUnit, surfaceBake, frameRange, profileId, wallHeight = null, wallWidth = null) {
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        return TileWorkerCoordinator.requestWallAtlasBake({
            width, height, p1, p2, pixelsPerUnit,
            seed: surfaceBake.surfaceSeed,
            profileId,
            ...frameRange,
            centerX, centerY, wallHeight, wallWidth, cellSize: wallWidth,
            animationBakeFrames: surfaceBake.animationBakeFrames,
            animationSourceFrames: surfaceBake.animationSourceFrames,
        });
    }

    _resolveChunkPayload(state, chunkCol, chunkRow, zLevel = 0) {
        if (!this._buildChunkPayload) {
            throw new Error("WorldSurfaceEngine requires buildChunkPayload hook");
        }
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

        if (isAnimated) {
            this.surfaceCache.requestFill(key, bakeBatchFn, meta.totalFrames);
        }

        bakeFirstFn().then((firstFrameBitmaps) => {
            this.surfaceCache.commitFirstFrame(key, generation, firstFrameBitmaps);
        });

        return placeholder;
    }

    getGroundChunkCanvas(chunkCol, chunkRow, state, payload = null, zLevel = 0) {
        if (!payload) payload = this._resolveChunkPayload(state, chunkCol, chunkRow, zLevel);
        const resolvedZ = payload.zLevel ?? zLevel;

        const key = groundChunkCachePrefix(
            chunkCol,
            chunkRow,
            payload.profileId,
            getSurfaceProfileRevision(payload.profileId),
            getPixelsPerWorldUnit(this.settings),
            resolvedZ,
        );
        let canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;

        const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
        const { enabled: isAnimated, totalFrames, sourceTotal } = getGroundChunkAnimationInfo(profile, this.settings);
        const animationFrameBatchSize = this.settings.animationFrameBatchSize ?? 8;
        const bakePayload = {
            ...payload,
            animationBakeFrames: totalFrames,
            animationSourceFrames: sourceTotal,
        };

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

    /** Ensure a baked wall atlas exists in the cache (faces + roof strip). */
    ensureWallAtlas(key, p1, p2, columns, storyCount, surfaceBake, tileWorldSize, wallHeight = null) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;

        const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (edgeLen < 0.001 || columns.length === 0) return null;

        const cellSize = surfaceBake.obstacleCellSize ?? 32;
        const ppwu = getPixelsPerWorldUnit(this.settings);
        const pixelsPerUnit = (cellSize / tileWorldSize) * ppwu;

        const canvasWidth = Math.max(1, Math.ceil(edgeLen * pixelsPerUnit));
        const hVal = wallHeight ?? resolveWallVisualHeight(this.settings.cameraHeight, this.settings);
        const unrolledHeight = 2 * hVal + cellSize;
        const canvasHeight = Math.max(1, Math.ceil(unrolledHeight * pixelsPerUnit));

        const wallCenterX = (p1.x + p2.x) / 2;
        const wallCenterY = (p1.y + p2.y) / 2;
        const profileId = surfaceBake.resolveProfileAt(wallCenterX, wallCenterY);
        const profile = getSurfaceProfileProvider().getProfile(profileId);
        const { enabled: isAnimated, totalFrames, sourceTotal } = getWallAtlasAnimationInfo(profile, this.settings);
        const animationFrameBatchSize = this.settings.animationFrameBatchSize ?? 8;
        const bakeSurfaceBake = {
            ...surfaceBake,
            animationBakeFrames: totalFrames,
            animationSourceFrames: sourceTotal,
        };

        const meta = {
            kind: "wall",
            width: canvasWidth,
            height: canvasHeight,
            p1,
            p2,
            pixelsPerUnit,
            totalFrames,
            animationFrameBatchSize,
        };

        const bakeFirstFn = () => {
            const frameRange = bakeFrameRange.first();
            return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, bakeSurfaceBake, frameRange, profileId, hVal, cellSize);
        };

        const bakeBatchFn = isAnimated
            ? (batch) => {
                  return this.requestWallAtlasBake(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, bakeSurfaceBake, batch, profileId, hVal, cellSize);
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
     *   surfaceBake: import("../../Render/adapters/WorldRenderAdapter.js").SurfaceBakeContext,
     *   ppwu: number,
     *   tileWorldSize: number,
     *   storyCount: number,
     *   wallHeight?: number | null,
     *   cacheObj?: object | null,
     * }} options
     * @returns {{ key: string, wrappedP1: { x: number, y: number }, wrappedP2: { x: number, y: number }, canvases: object[] } | null}
     */
    getOrEnsureWallAtlas(p1, p2, options) {
        const { profileId, surfaceBake, ppwu, tileWorldSize, storyCount, wallHeight = null, cacheObj = null } = options;

        const { key, wrappedP1, wrappedP2 } = getWallAtlasCacheInfo(p1, p2, surfaceBake, profileId, ppwu, cacheObj, this.settings);

        let canvases = this.surfaceCache.get(key);
        if (!canvases) {
            const columns = wallFaceColumns(wrappedP1, wrappedP2, tileWorldSize);
            if (columns.length === 0) return null;
            canvases = this.ensureWallAtlas(key, wrappedP1, wrappedP2, columns, storyCount, surfaceBake, tileWorldSize, wallHeight);
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
     *   canvasWidth: number,
     *   canvasHeight: number,
     *   state: object,
     *   gameTime?: number,
     *   zLevel?: number,
     *   clipRegions?: { minX: number, minY: number, maxX: number, maxY: number }[] | null,
     *   beforeDraw?: (ctx: CanvasRenderingContext2D, bounds: { minX: number, minY: number, maxX: number, maxY: number }) => void,
     * }} options
     */
    drawGroundChunks(ctx, options) {
        const {
            obstacleGrid,
            viewport,
            canvasWidth,
            canvasHeight,
            state,
            gameTime = 0,
            zLevel = 0,
            clipRegions = null,
            beforeDraw,
        } = options;
        const viewerX = viewport.x;
        const viewerY = viewport.y;
        const cellsPerChunk = this.settings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(canvasWidth, canvasHeight, this.settings.viewPaddingPx);

        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);

        if (beforeDraw) {
            beforeDraw(ctx, bounds);
        }

        const range = worldBoundsToChunkRange(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);

        const chunksToDraw = [];
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const origin = chunkToWorldOrigin(chunkCol, chunkRow, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
                const centerX = origin.x + chunkSizePx / 2;
                const centerY = origin.y + chunkSizePx / 2;
                const distSq = (centerX - viewport.x) ** 2 + (centerY - viewport.y) ** 2;
                chunksToDraw.push({ chunkCol, chunkRow, origin, distSq });
            }
        }

        chunksToDraw.sort((a, b) => a.distSq - b.distSq);

        for (const chunk of chunksToDraw) {
            if (!horizontalChunkIntersectsAnyRegion(clipRegions, chunk.origin.x, chunk.origin.y, chunkSizePx)) {
                continue;
            }

            const payload = this._resolveChunkPayload(state, chunk.chunkCol, chunk.chunkRow, zLevel);
            const canvases = this.getGroundChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, payload, zLevel);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            const profile = getSurfaceProfileProvider().getProfile(payload.profileId);
            const { enabled: chunkAnimationEnabled, totalFrames: bakeTotal, sourceTotal } =
                getGroundChunkAnimationInfo(profile, this.settings);

            if (zLevel === 0 && chunkAnimationEnabled && canvases.length > 1) {
                const sourceFrame = animationFrameIndex(profile.animation, { gameTime });
                const bakedSlot = bakeSlotForSourceFrame(sourceFrame, bakeTotal, sourceTotal);
                canvas = canvases[Math.min(canvases.length - 1, Math.max(0, bakedSlot))];
            }

            if (zLevel > 0) {
                const corners = projectHorizontalSurfaceCorners(
                    chunk.origin.x,
                    chunk.origin.y,
                    chunkSizePx,
                    zLevel,
                    viewerX,
                    viewerY,
                    this.settings.cameraHeight,
                );
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample(this.settings);
                drawImageQuad(
                    ctx,
                    canvas,
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                    corners[0],
                    corners[1],
                    corners[2],
                    corners[3],
                    { bleedPx: this.settings.wallTextureBleedPx ?? 1 },
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            } else {
                drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx, this.settings);
            }
        }
    }

    /** Elevated horizontal layers (z > 0) — draw after walls. Wall atlas unchanged. */
    drawRoofLayers(ctx, baseOptions) {
        const levels = this.settings.roofZLevels ?? [];
        const clipRegions = baseOptions.clipRegions;
        const useClip = clipRegions?.length > 0;

        if (useClip) {
            ctx.save();
            clipToHorizontalSurfaceRegions(ctx, clipRegions);
        }

        for (let i = 0; i < levels.length; i++) {
            const z = levels[i];
            if (z <= 0) continue;
            this.drawGroundChunks(ctx, { ...baseOptions, zLevel: z, beforeDraw: undefined });
        }

        if (useClip) {
            ctx.restore();
        }
    }
}
