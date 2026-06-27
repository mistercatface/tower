import { aabbCenterX, aabbCenterY, cellBoundsToWorldBoundsInto, createAabb, expandPointsAabbInto, minCornerAabbInto } from "../Spatial/bounds.js";
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
    cellBoundsToChunkRange(bounds, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const worldBounds = cellBoundsToWorldBoundsInto(this._cellBoundsAabb, bounds, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        return this.boundsToChunkRange(worldBounds, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    viewportChunkRange(bounds, obstacleGrid, chunkSizePx) {
        return this.boundsToChunkRange(bounds, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    boundsToChunkRange(bounds, gridMinX, gridMinY, chunkSizePx) {
        return {
            minChunkCol: this.worldToChunkCol(bounds.minX, gridMinX, chunkSizePx),
            maxChunkCol: this.worldToChunkCol(bounds.maxX - 1, gridMinX, chunkSizePx),
            minChunkRow: this.worldToChunkRow(bounds.minY, gridMinY, chunkSizePx),
            maxChunkRow: this.worldToChunkRow(bounds.maxY - 1, gridMinY, chunkSizePx),
        };
    }
    worldToChunkCol(worldX, gridMinX, chunkSizePx) {
        return Math.floor((worldX - gridMinX) / chunkSizePx);
    }
    worldToChunkRow(worldY, gridMinY, chunkSizePx) {
        return Math.floor((worldY - gridMinY) / chunkSizePx);
    }
    wallAtlas(p1, p2) {
        const surfaceTilePeriodPx = this.settings.surfaceTilePeriodPx;
        const wx1 = positiveModulo(p1.x, surfaceTilePeriodPx);
        const wy1 = positiveModulo(p1.y, surfaceTilePeriodPx);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        return { wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, keyX1: wx1.toFixed(1), keyY1: wy1.toFixed(1), keyX2: wx2.toFixed(1), keyY2: wy2.toFixed(1) };
    }
    horizontalSample(worldCorners, obstacleGrid) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid);
        const pointsBounds = expandPointsAabbInto(this._pointsAabb, worldCorners);
        const chunkCol = this.worldToChunkCol(pointsBounds.minX, obstacleGrid.minX, chunkSizePx);
        const chunkRow = this.worldToChunkRow(pointsBounds.minY, obstacleGrid.minY, chunkSizePx);
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
