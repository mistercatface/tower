import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { ProgressiveFrameCache } from "./ProgressiveFrameCache.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { buildFloorChunkBakePayload, floorChunkCachePrefix, getFloorTextureProfileId } from "./floorTextureProfile.js";
import { drawBakedTexture } from "./floorTextureResolution.js";
import { animationFrameIndex, getAnimationFrames } from "./ProfileBakeResolver.js";
import { bakeFrameRange, nextAnimationBatchRange } from "./AnimationFrameBake.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new ProgressiveFrameCache(floorTileSettings.maxCachedChunks);
        this.proceduralProfileId = null;
        this._chunkBakeGeneration = new Map();
        this._animationBatchInFlight = new Set();
        this._globalGeneration = 0;
    }

    clear() {
        this.cache.clear();
    }

    invalidateGridBounds(bounds, state, cellsPerChunk = floorTileSettings.cellsPerChunk) {
        if (!bounds) return;
        const profileId = getFloorTextureProfileId(state);
        const range = gridBoundsToChunkRange(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cellsPerChunk);
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                this.cache.deleteByPrefix(floorChunkCachePrefix(chunkCol, chunkRow, profileId));
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
        this.cache.updateFills();
    }

    getChunkCanvas(chunkCol, chunkRow, state, payload = null) {
        if (!payload) payload = this._buildChunkPayload(state, chunkCol, chunkRow);

        const key = floorChunkCachePrefix(chunkCol, chunkRow, payload.profileId);
        let canvases = this.cache.get(key);
        if (canvases) return canvases;

        const placeholder = this.cache.getOrStart(key);
        const generation = this.cache.getCurrentGeneration(key);

        const profile = getFloorProceduralProfile(payload.profileId);
        const isAnimated = Boolean(profile.animation);

        if (isAnimated) {
            const firstFramePayload = { ...payload, ...bakeFrameRange.first() };
            TileWorkerCoordinator.requestFloorChunkBake(firstFramePayload).then((firstFrameBitmaps) => {
                this.cache.commitFirstFrame(key, generation, firstFrameBitmaps);
            });
        } else {
            const staticPayload = { ...payload, ...bakeFrameRange.all(getAnimationFrames(profile.animation)) };
            TileWorkerCoordinator.requestFloorChunkBake(staticPayload).then((bitmaps) => {
                this.cache.commitFirstFrame(key, generation, bitmaps);
            });
        }

        return placeholder;
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

            if (profile.animation) {
                const key = floorChunkCachePrefix(chunk.chunkCol, chunk.chunkRow, profileId);
                this.cache.requestFill(key, (batch) => {
                    const batchPayload = { ...payload, ...batch };
                    return TileWorkerCoordinator.requestFloorChunkBake(batchPayload);
                }, totalFrames);
            }

            if (profile.animation && canvases.length > 1) {
                const currentFrame = animationFrameIndex(profile.animation, { gameTime: state.gameTime ?? 0 });
                canvas = canvases[Math.min(canvases.length - 1, Math.max(0, currentFrame))];
            }

            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}
