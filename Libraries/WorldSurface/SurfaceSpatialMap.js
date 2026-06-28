import { aabbCenterX, aabbCenterY, createAabb, expandPointsAabbInto, minCornerAabbInto } from "../Math/Aabb2D.js";
import { cellBoundsToWorldBoundsInto } from "../Spatial/grid/GridCoords.js";
const WALL_CHUNK_TEXTURE_SAMPLE_CHUNK = 0;
function positiveModulo(value, period) {
    return ((value % period) + period) % period;
}
export class SurfaceSpatialMap {
    constructor(settings) {
        this.settings = settings;
        this._cellBoundsAabb = createAabb();
        this._pointsAabb = createAabb();
        this._chunkBounds = createAabb();
    }
    chunkSizePx(obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        return obstacleGrid.cellSize * cellsPerChunk;
    }
    chunkBoundsInto(out, obstacleGrid, chunkCol, chunkRow, cellsPerChunk = this.settings.cellsPerChunk) {
        const sizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        return minCornerAabbInto(out, obstacleGrid.minX + chunkCol * sizePx, obstacleGrid.minY + chunkRow * sizePx, sizePx, sizePx);
    }
    surfaceTileChunks(cellsPerChunk = this.settings.cellsPerChunk) {
        return this.settings.surfaceTilePeriodCells / cellsPerChunk;
    }
    wrapChunkCol(chunkCol, cellsPerChunk = this.settings.cellsPerChunk) {
        return positiveModulo(chunkCol, this.surfaceTileChunks(cellsPerChunk));
    }
    wrapChunkRow(chunkRow, cellsPerChunk = this.settings.cellsPerChunk) {
        return positiveModulo(chunkRow, this.surfaceTileChunks(cellsPerChunk));
    }
    tileChunkBoundsInto(out, obstacleGrid, chunkCol, chunkRow, cellsPerChunk = this.settings.cellsPerChunk) {
        return this.chunkBoundsInto(out, obstacleGrid, this.wrapChunkCol(chunkCol, cellsPerChunk), this.wrapChunkRow(chunkRow, cellsPerChunk), cellsPerChunk);
    }
    cellBoundsToChunkRange(boundsOrIdx, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        if (typeof boundsOrIdx === "number") {
            const chunkCol = ((boundsOrIdx % obstacleGrid.cols) / cellsPerChunk) | 0;
            const chunkRow = (((boundsOrIdx / obstacleGrid.cols) | 0) / cellsPerChunk) | 0;
            return { startCol: chunkCol, endCol: chunkCol, startRow: chunkRow, endRow: chunkRow };
        }
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const worldBounds = cellBoundsToWorldBoundsInto(this._cellBoundsAabb, boundsOrIdx, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        return this.boundsToChunkRange(worldBounds, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    viewportChunkRange(bounds, obstacleGrid, chunkSizePx) {
        return this.boundsToChunkRange(bounds, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    boundsToChunkRange(bounds, gridMinX, gridMinY, chunkSizePx) {
        return {
            startCol: this.worldToChunkCol(bounds.minX, gridMinX, chunkSizePx),
            endCol: this.worldToChunkCol(bounds.maxX - 1, gridMinX, chunkSizePx),
            startRow: this.worldToChunkRow(bounds.minY, gridMinY, chunkSizePx),
            endRow: this.worldToChunkRow(bounds.maxY - 1, gridMinY, chunkSizePx),
        };
    }
    worldToChunkCol(worldX, gridMinX, chunkSizePx) {
        return Math.floor((worldX - gridMinX) / chunkSizePx);
    }
    worldToChunkRow(worldY, gridMinY, chunkSizePx) {
        return Math.floor((worldY - gridMinY) / chunkSizePx);
    }
    wallAtlasScalars(x1, y1, x2, y2) {
        const surfaceTilePeriodPx = this.settings.surfaceTilePeriodPx;
        const wx1 = positiveModulo(x1, surfaceTilePeriodPx);
        const wy1 = positiveModulo(y1, surfaceTilePeriodPx);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        return { wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, keyX1: wx1.toFixed(1), keyY1: wy1.toFixed(1), keyX2: wx2.toFixed(1), keyY2: wy2.toFixed(1) };
    }
    wallAtlas(p1, p2) {
        return this.wallAtlasScalars(p1.x, p1.y, p2.x, p2.y);
    }
    flatHorizontalSample(worldCorners8, obstacleGrid) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < 4; i++) {
            const px = worldCorners8[i * 2];
            const py = worldCorners8[i * 2 + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }
        const chunkCol = this.worldToChunkCol(minX, obstacleGrid.minX, chunkSizePx);
        const chunkRow = this.worldToChunkRow(minY, obstacleGrid.minY, chunkSizePx);
        const bounds = this.chunkBoundsInto(this._chunkBounds, obstacleGrid, chunkCol, chunkRow);
        return { chunkCol, chunkRow, chunkSizePx, minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
    }
    wallChunkTextureSample(cellSize) {
        const chunkSizePx = cellSize * this.settings.cellsPerChunk;
        const chunkCol = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const chunkRow = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const bounds = minCornerAabbInto(this._chunkBounds, 0, 0, chunkSizePx, chunkSizePx);
        return { chunkCol, chunkRow, chunkSizePx, minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY, centerX: aabbCenterX(bounds), centerY: aabbCenterY(bounds) };
    }
}
