import { floorTileSettings, combatVisualSettings } from "../../Config/Config.js";
import { isWorldScene } from "../../GameState/GamePhase.js";
import {
    chunkKey,
    chunkToWorldOrigin,
    getChunkSizePx,
    gridBoundsToChunkRange,
    worldBoundsToChunkRange,
} from "../../Spatial/Grid/ChunkGrid.js";
import { snapWorldToCellOrigin } from "../../Spatial/Geometry/GridCoords.js";
import { FloorChunkCache } from "./FloorChunkCache.js";
import { bakeFloorChunkCanvas, bakeFloorCellCanvas, bakeFloorTileTextureCanvas, bakeWallCellCanvas } from "./FloorTilePainter.js";

export class FloorTileSystem {
    constructor() {
        this.cache = new FloorChunkCache();
        this.cellCache = new FloorChunkCache(floorTileSettings.maxCachedWallCells ?? 512);
        this._tileTexture = null;
        this._tileTextureSeed = null;
    }

    clear() {
        this.cache.clear();
        this.cellCache.clear();
        this._tileTexture = null;
        this._tileTextureSeed = null;
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
        const wallStories = floorTileSettings.wallTextureStories ?? 16;
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
            for (let col = bounds.startCol; col <= bounds.endCol; col++) {
                this.cellCache.delete(`c:v2:${col},${row}`);
                for (let s = 0; s < wallStories; s++) {
                    this.cellCache.delete(`c:wall:v1:${col},${row}:${s}`);
                }
            }
        }
    }

    getTileTextureCanvas(state) {
        const seed = state.floorTileSeed ?? 0;
        if (this._tileTexture && this._tileTextureSeed === seed) {
            return this._tileTexture;
        }
        this._tileTextureSeed = seed;
        this._tileTexture = bakeFloorTileTextureCanvas(seed, state.obstacleGrid?.cellSize);
        return this._tileTexture;
    }

    getCellCanvas(worldX, worldY, state) {
        const obstacleGrid = state.obstacleGrid;
        const { col, row, x, y } = snapWorldToCellOrigin(
            worldX,
            worldY,
            obstacleGrid.minX,
            obstacleGrid.minY,
            obstacleGrid.cellSize,
        );
        const key = `c:v2:${col},${row}`;
        let canvas = this.cellCache.get(key);
        if (canvas) return canvas;

        canvas = bakeFloorCellCanvas(x, y, obstacleGrid, state.floorTileSeed ?? 0);
        this.cellCache.set(key, canvas);
        return canvas;
    }

    /** Stable cache key from world grid + story row (not camera-projected coords). */
    getWallCellCanvas(worldX, worldY, storyRow, state) {
        const obstacleGrid = state.obstacleGrid;
        const { col, row, x, y } = snapWorldToCellOrigin(
            worldX,
            worldY,
            obstacleGrid.minX,
            obstacleGrid.minY,
            obstacleGrid.cellSize,
        );
        const key = `c:wall:v1:${col},${row}:${storyRow}`;
        let canvas = this.cellCache.get(key);
        if (canvas) return canvas;

        canvas = bakeWallCellCanvas(x, y, storyRow, obstacleGrid, state.floorTileSeed ?? 0);
        this.cellCache.set(key, canvas);
        return canvas;
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
        if (!viewport || !isWorldScene(state.phase) || !state.obstacleGrid?.cols) {
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
