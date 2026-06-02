import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import { getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { chunkToWorldOrigin, getChunkSizePx, gridBoundsToChunkRange, worldBoundsToChunkRange } from "../../Spatial/Grid/ChunkGrid.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import { TileWorkerCoordinator } from "./TileWorkerCoordinator.js";
import { buildFloorChunkBakePayload, floorChunkCacheKey, getFloorTextureProfileId } from "./floorTextureProfile.js";
import { drawBakedTexture } from "./floorTextureResolution.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new FloorChunkCache();
        this.proceduralProfileId = null;
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
                this.cache.delete(floorChunkCacheKey(chunkCol, chunkRow, profileId));
            }
        }
    }

    bakeWallFace(width, height, p1, p2, pixelsPerUnit, state) {
        const profileId = getFloorTextureProfileId(state);
        return TileWorkerCoordinator.requestWallFaceBake({ width, height, p1, p2, pixelsPerUnit, seed: state.floorTileSeed ?? 0, profileId });
    }

    getChunkCanvas(chunkCol, chunkRow, state, priority = Infinity) {
        const payload = buildFloorChunkBakePayload(state, chunkCol, chunkRow);
        const key = floorChunkCacheKey(chunkCol, chunkRow, payload.profileId, payload.player ?? null);
        let canvases = this.cache.get(key);
        if (canvases) return canvases;

        const placeholder = [{ isPlaceholder: true }];
        this.cache.set(key, placeholder);

        TileWorkerCoordinator.requestFloorChunkBake(payload, priority).then((bitmaps) => {
            const existing = this.cache.get(key);
            if (existing === placeholder) {
                this.cache.set(key, bitmaps);
            } else {
                bitmaps.forEach((b) => b.close());
            }
        });

        return placeholder;
    }

    draw(ctx, state, viewport) {
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = floorTileSettings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(ctx.canvas?.width ?? viewport.cx * 2, ctx.canvas?.height ?? viewport.cy * 2, floorTileSettings.viewPaddingPx);

        ctx.fillStyle = combatVisualSettings.floorShadow;
        ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

        const range = worldBoundsToChunkRange(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);

        const profileId = getFloorTextureProfileId(state);
        const profile = getFloorProceduralProfile(profileId);

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
            const canvases = this.getChunkCanvas(chunk.chunkCol, chunk.chunkRow, state, chunk.distSq);
            let canvas = canvases[0];
            if (canvas.isPlaceholder) continue;

            if (profile.animation && canvases.length > 1) {
                const frames = canvases.length;
                const duration = profile.animation.durationMs ?? 1000;
                const clock = state.gameTime ?? 0;
                const currentFrame = Math.floor(((clock % duration) / duration) * frames);
                canvas = canvases[Math.min(frames - 1, Math.max(0, currentFrame))];
            }
            drawBakedTexture(ctx, canvas, chunk.origin.x, chunk.origin.y, chunkSizePx, chunkSizePx);
        }
    }
}
