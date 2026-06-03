import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { ProgressiveFrameCache } from "./ProgressiveFrameCache.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { buildFloorChunkBakePayload, floorChunkCachePrefix, getFloorTextureProfileId } from "./floorTextureProfile.js";
import { drawBakedTexture, bakePixelsForWorldSpan, getPixelsPerWorldUnit } from "./floorTextureResolution.js";
import { animationFrameIndex, getAnimationFrames } from "./ProfileBakeResolver.js";
import { bakeFrameRange, nextAnimationBatchRange } from "./AnimationFrameBake.js";

export class FloorTileSystem {
    constructor() {
        this.surfaceCache = new ProgressiveFrameCache(floorTileSettings.maxCachedSurfaces ?? 5000);
        this.proceduralProfileId = null;
        this._globalGeneration = 0;
    }

    clear() {
        this.surfaceCache.clear();
    }

    invalidateGridBounds(bounds, state, cellsPerChunk = floorTileSettings.cellsPerChunk) {
        if (!bounds) return;
        const profileId = getFloorTextureProfileId(state);
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                this.surfaceCache.deleteByPrefix("chunk:" + floorChunkCachePrefix(chunkCol, chunkRow, profileId).substring(6));
            }
        }
    }

    bakeWallFace(width, height, p1, p2, pixelsPerUnit, state, frameRange) {
        const profileId = getFloorTextureProfileId(state);
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        return TileWorkerCoordinator.requestWallFaceBake({
            width,
            height,
            p1,
            p2,
            pixelsPerUnit,
            seed: state.floorTileSeed ?? 0,
            profileId,
            ...frameRange,
            centerX,
            centerY,
        });
    }

    _buildChunkPayload(state, chunkCol, chunkRow) {
        const payload = buildFloorChunkBakePayload(state, chunkCol, chunkRow);
        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = floorTileSettings.cellsPerChunk;
        if (obstacleGrid) {
            const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
            payload.centerX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
            payload.centerY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;
        }
        return payload;
    }

    updateFills() {
        this.surfaceCache.updateFills();
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

    getChunkCanvas(chunkCol, chunkRow, state, payload = null) {
        if (!payload) payload = this._buildChunkPayload(state, chunkCol, chunkRow);

        const key = floorChunkCachePrefix(chunkCol, chunkRow, payload.profileId);
        let canvases = this.surfaceCache.get(key);
        if (canvases) return canvases;

        const profile = getFloorProceduralProfile(payload.profileId);
        const isAnimated = Boolean(profile.animation);
        const totalFrames = getAnimationFrames(profile.animation);

        const meta = { kind: 'chunk', payload, totalFrames };

        const bakeFirstFn = () => {
            const framePayload = { ...payload, ...(isAnimated ? bakeFrameRange.first() : bakeFrameRange.all(totalFrames)) };
            return TileWorkerCoordinator.requestFloorChunkBake(framePayload);
        };

        const bakeBatchFn = isAnimated ? (batch) => {
            return TileWorkerCoordinator.requestFloorChunkBake({ ...payload, ...batch });
        } : null;

        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }

    ensureWallFace(key, p1, p2, columns, storyCount, state, tileWorldSize) {
        let cached = this.surfaceCache.get(key);
        if (cached) return cached;

        const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (edgeLen < 0.001 || columns.length === 0) return null;

        const cellSize = state.obstacleGrid?.cellSize ?? 32;
        const ppwu = getPixelsPerWorldUnit();
        const pixelsPerUnit = (cellSize / tileWorldSize) * ppwu;

        const canvasWidth = Math.max(1, Math.ceil(edgeLen * pixelsPerUnit));
        const canvasHeight = bakePixelsForWorldSpan(storyCount * cellSize);

        const profileId = getFloorTextureProfileId(state);
        const profile = getFloorProceduralProfile(profileId);
        const isAnimated = Boolean(profile.animation);
        const totalFrames = getAnimationFrames(profile.animation);

        const meta = { kind: 'wall', width: canvasWidth, height: canvasHeight, p1, p2, pixelsPerUnit, totalFrames };

        const bakeFirstFn = () => {
            const frameRange = isAnimated ? bakeFrameRange.first() : bakeFrameRange.all(totalFrames);
            return this.bakeWallFace(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, state, frameRange);
        };

        const bakeBatchFn = isAnimated ? (batch) => {
            return this.bakeWallFace(canvasWidth, canvasHeight, p1, p2, pixelsPerUnit, state, batch);
        } : null;

        return this._scheduleAnimatedEntry(key, meta, bakeFirstFn, bakeBatchFn);
    }

    draw(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        const profileId = getFloorTextureProfileId(state);
        const profile = getFloorProceduralProfile(profileId);

        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = floorTileSettings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(ctx.canvas?.width ?? viewport.cx * 2, ctx.canvas?.height ?? viewport.cy * 2, floorTileSettings.viewPaddingPx);

        TileWorkerCoordinator.updateFocus(viewport.x, viewport.y);

        ctx.fillStyle = combatVisualSettings.floorShadow;
        ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

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

        const totalFrames = getAnimationFrames(profile.animation);

        for (const chunk of chunksToDraw) {
            const payload = this._buildChunkPayload(state, chunk.chunkCol, chunk.chunkRow);
            const canvases = this.getChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, payload);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            if (profile.animation && canvases.length > 1) {
                const currentFrame = animationFrameIndex(profile.animation, { gameTime: state.gameTime ?? 0 });
                canvas = canvases[Math.min(canvases.length - 1, Math.max(0, currentFrame))];
            }

            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}

export function buildWallCacheKey(p1, p2, state, profileId, ppwu) {
    const chunkWorldSize = floorTileSettings.chunkWorldSize || 128 * 16;
    const wx1 = ((p1.x % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
    const wy1 = ((p1.y % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wx2 = wx1 + dx;
    const wy2 = wy1 + dy;

    const kx1 = wx1.toFixed(1);
    const ky1 = wy1.toFixed(1);
    const kx2 = wx2.toFixed(1);
    const ky2 = wy2.toFixed(1);
    const seed = state.floorTileSeed ?? 0;
    const rev = TileWorkerCoordinator.getProfileRevision(profileId);
    const key = `wall:${rev}:${ppwu}:${profileId}:${seed}:${kx1},${ky1}-${kx2},${ky2}`;

    return { key, wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 } };
}

/** Drop per-edge wall cache key memo after profile revision / surface cache clear. */
export function invalidateWallSurfaceKeyMemos(state) {
    if (!state?.walls) return;
    for (const seg of state.walls) {
        const edges = seg._cachedEdges;
        if (!edges) continue;
        for (const edge of edges) {
            delete edge._wkInfo;
            delete edge._wkProfileId;
            delete edge._wkPpwu;
            delete edge._wkRev;
            delete edge._wkSeed;
        }
    }
}

export function getWallCacheInfo(p1, p2, state, profileId, ppwu, cacheObj) {
    const seed = state.floorTileSeed ?? 0;
    const rev = TileWorkerCoordinator.getProfileRevision(profileId);
    if (cacheObj && cacheObj._wkInfo && cacheObj._wkProfileId === profileId && cacheObj._wkPpwu === ppwu && cacheObj._wkRev === rev && cacheObj._wkSeed === seed) {
        return cacheObj._wkInfo;
    }
    const info = buildWallCacheKey(p1, p2, state, profileId, ppwu);
    if (cacheObj) {
        cacheObj._wkInfo = info;
        cacheObj._wkProfileId = profileId;
        cacheObj._wkPpwu = ppwu;
        cacheObj._wkRev = rev;
        cacheObj._wkSeed = seed;
    }
    return info;
}
