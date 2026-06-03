import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import {
    buildFloorChunkBakePayload,
    floorChunkCacheKey,
    floorChunkCachePrefix,
    getFloorTextureProfileId,
} from "./floorTextureProfile.js";
import { drawBakedTexture } from "./floorTextureResolution.js";
import { getAnimationFrameIndex, getAnimationFrames } from "./ProfileBakeResolver.js";
import { nextAnimationBatchRange } from "./AnimationFrameBake.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new FloorChunkCache();
        this.proceduralProfileId = null;
        /** @type {Map<string, number>} */
        this._chunkBakeGeneration = new Map();
        /** @type {Set<string>} */
        this._animationBatchInFlight = new Set();
        this._globalGeneration = 0;
    }

    clear() {
        this.cache.clear();
        this._chunkBakeGeneration.clear();
        this._animationBatchInFlight.clear();
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

    bakeWallFace(width, height, p1, p2, pixelsPerUnit, state, { firstFrameOnly = false, frameStart, frameCount, priority = Infinity } = {}) {
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
            firstFrameOnly,
            frameStart,
            frameCount,
            centerX,
            centerY,
        }, priority);
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

    _scheduleAnimationBatch(key, payload, priority, canvases, totalFrames) {
        if (!canvases || canvases[0]?.isPlaceholder || canvases.length >= totalFrames) {
            return;
        }

        const generation = this._chunkBakeGeneration.get(key);
        if (generation == null) return;

        const batch = nextAnimationBatchRange(canvases.length, totalFrames);
        if (!batch) return;

        const flightKey = `${key}${batch.frameStart}`;
        if (this._animationBatchInFlight.has(flightKey)) return;
        this._animationBatchInFlight.add(flightKey);

        const batchPayload = {
            ...payload,
            firstFrameOnly: false,
            frameStart: batch.frameStart,
            frameCount: batch.frameCount,
        };

        TileWorkerCoordinator.requestFloorChunkBake(batchPayload, priority).then((bitmaps) => {
            this._animationBatchInFlight.delete(flightKey);
            if (this._chunkBakeGeneration.get(key) !== generation) {
                bitmaps.forEach((b) => b.close());
                return;
            }
            const existing = this.cache.get(key);
            if (!existing || existing[0]?.isPlaceholder) {
                bitmaps.forEach((b) => b.close());
                return;
            }
            this.cache.mergeFrames(key, batch.frameStart, bitmaps);
        });
    }

    getChunkCanvas(chunkCol, chunkRow, state, priority = Infinity) {
        const payload = this._buildChunkPayload(state, chunkCol, chunkRow);

        const key = floorChunkCacheKey(chunkCol, chunkRow, payload.profileId);
        let canvases = this.cache.get(key);
        if (canvases) return canvases;

        const placeholder = [{ isPlaceholder: true }];
        this.cache.set(key, placeholder);

        const generation = ++this._globalGeneration;
        this._chunkBakeGeneration.set(key, generation);

        const profile = getFloorProceduralProfile(payload.profileId);
        const isAnimated = Boolean(profile.animation);

        if (isAnimated) {
            const firstFramePayload = { ...payload, firstFrameOnly: true };
            TileWorkerCoordinator.requestFloorChunkBake(firstFramePayload, priority).then((firstFrameBitmaps) => {
                if (this._chunkBakeGeneration.get(key) !== generation) {
                    firstFrameBitmaps.forEach((b) => b.close());
                    return;
                }
                const existing = this.cache.get(key);
                if (existing?.[0]?.isPlaceholder === true) {
                    this.cache.set(key, firstFrameBitmaps);
                } else if (existing !== firstFrameBitmaps) {
                    firstFrameBitmaps.forEach((b) => b.close());
                }
            });
        } else {
            TileWorkerCoordinator.requestFloorChunkBake(payload, priority).then((bitmaps) => {
                if (this._chunkBakeGeneration.get(key) !== generation) {
                    bitmaps.forEach((b) => b.close());
                    return;
                }
                const existing = this.cache.get(key);
                if (existing?.[0]?.isPlaceholder === true) {
                    this.cache.set(key, bitmaps);
                }
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
            const canvases = this.getChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, chunk.distSq);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            if (profile.animation) {
                const key = floorChunkCacheKey(chunk.chunkCol, chunk.chunkRow, profileId);
                const payload = this._buildChunkPayload(state, chunk.chunkCol, chunk.chunkRow);
                this._scheduleAnimationBatch(key, payload, chunk.distSq, canvases, totalFrames);
            }

            if (profile.animation && canvases.length >= totalFrames) {
                const currentFrame = getAnimationFrameIndex(profile.animation, state.gameTime ?? 0);
                canvas = canvases[Math.min(canvases.length - 1, Math.max(0, currentFrame))];
            }

            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}
