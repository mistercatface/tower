import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import {
    chunkKey,
    chunkToWorldOrigin,
    getChunkSizePx,
    gridBoundsToChunkRange,
    worldBoundsToChunkRange,
} from "../../Spatial/Grid/ChunkGrid.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import { bakeFloorChunkCanvas } from "./FloorTilePainter.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new FloorChunkCache();
    }

    clear() {
        this.cache.clear();
    }

    invalidateGridBounds(bounds, cellsPerChunk = floorTileSettings.cellsPerChunk) {
        if (!bounds) return;
        const range = gridBoundsToChunkRange(
            bounds.startCol,
            bounds.endCol,
            bounds.startRow,
            bounds.endRow,
            cellsPerChunk,
        );
        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                this.cache.delete(chunkKey(chunkCol, chunkRow));
            }
        }
    }

    getChunkCanvas(chunkCol, chunkRow, state) {
        const key = chunkKey(chunkCol, chunkRow);
        let canvas = this.cache.get(key);
        if (canvas) return canvas;

        canvas = bakeFloorChunkCanvas({
            chunkCol,
            chunkRow,
            obstacleGrid: state.obstacleGrid,
            seed: state.floorTileSeed ?? 0,
        });
        this.cache.set(key, canvas);
        return canvas;
    }

    draw(ctx, state, viewport) {
        if (!floorTileSettings.enabled || !viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
            return;
        }

        const obstacleGrid = state.obstacleGrid;
        const cellsPerChunk = floorTileSettings.cellsPerChunk;
        const chunkSizePx = getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
        const bounds = viewport.getWorldBounds(
            ctx.canvas?.width ?? viewport.cx * 2,
            ctx.canvas?.height ?? viewport.cy * 2,
            floorTileSettings.viewPaddingPx,
        );

        ctx.fillStyle = combatVisualSettings.floorShadow;
        ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

        const range = worldBoundsToChunkRange(
            bounds.minX,
            bounds.minY,
            bounds.maxX,
            bounds.maxY,
            obstacleGrid.minX,
            obstacleGrid.minY,
            chunkSizePx,
        );

        for (let chunkRow = range.minChunkRow; chunkRow <= range.maxChunkRow; chunkRow++) {
            for (let chunkCol = range.minChunkCol; chunkCol <= range.maxChunkCol; chunkCol++) {
                const canvas = this.getChunkCanvas(chunkCol, chunkRow, state);
                const origin = chunkToWorldOrigin(
                    chunkCol,
                    chunkRow,
                    obstacleGrid.minX,
                    obstacleGrid.minY,
                    chunkSizePx,
                );
                ctx.drawImage(canvas, origin.x, origin.y);
            }
        }
    }
}
