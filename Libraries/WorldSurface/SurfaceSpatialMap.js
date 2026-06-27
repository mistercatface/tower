import { createAabb, expandPointsAabbInto } from "../Math/Aabb2D.js";
import { getChunkSizePx, worldBoundsToChunkRange, worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { cellBoundsToWorldBoundsInto, chunkWorldAabbInto } from "../Spatial/grid/GridCoords.js";
const WALL_CHUNK_TEXTURE_SAMPLE_CHUNK = -9999;
export class SurfaceSpatialMap {
    constructor(settings) {
        this.settings = settings;
        this._cellBoundsAabb = createAabb();
        this._pointsAabb = createAabb();
        this._chunkAabb = createAabb();
    }
    chunkSizePx(obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        return getChunkSizePx(obstacleGrid.cellSize, cellsPerChunk);
    }
    cellBoundsToChunkRange(bounds, obstacleGrid, cellsPerChunk = this.settings.cellsPerChunk) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const worldBounds = cellBoundsToWorldBoundsInto(this._cellBoundsAabb, bounds, obstacleGrid.minX, obstacleGrid.minY, obstacleGrid.cellSize);
        return worldBoundsToChunkRange(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    viewportChunkRange(bounds, obstacleGrid, chunkSizePx) {
        return worldBoundsToChunkRange(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, obstacleGrid.minX, obstacleGrid.minY, chunkSizePx);
    }
    groundChunk(obstacleGrid, chunkCol, chunkRow, cellsPerChunk = this.settings.cellsPerChunk) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid, cellsPerChunk);
        const aabb = chunkWorldAabbInto(this._chunkAabb, obstacleGrid.minX + chunkCol * chunkSizePx, obstacleGrid.minY + chunkRow * chunkSizePx, chunkSizePx);
        return {
            chunkCol,
            chunkRow,
            chunkSizePx,
            minX: obstacleGrid.minX,
            minY: obstacleGrid.minY,
            chunkMinX: aabb.minX,
            chunkMinY: aabb.minY,
            chunkMaxX: aabb.maxX,
            chunkMaxY: aabb.maxY,
            centerX: (aabb.minX + aabb.maxX) / 2,
            centerY: (aabb.minY + aabb.maxY) / 2,
        };
    }
    wallAtlas(p1, p2) {
        const chunkWorldSize = this.settings.chunkWorldSize;
        const wx1 = ((p1.x % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const wy1 = ((p1.y % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        return { wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, keyX1: wx1.toFixed(1), keyY1: wy1.toFixed(1), keyX2: wx2.toFixed(1), keyY2: wy2.toFixed(1) };
    }
    wallCenter(p1, p2) {
        return { centerX: (p1.x + p2.x) / 2, centerY: (p1.y + p2.y) / 2 };
    }
    horizontalSample(worldCorners, obstacleGrid) {
        const chunkSizePx = this.chunkSizePx(obstacleGrid);
        const bounds = expandPointsAabbInto(this._pointsAabb, worldCorners);
        const chunkCol = worldToChunkCol(bounds.minX, obstacleGrid.minX, chunkSizePx);
        const chunkRow = worldToChunkRow(bounds.minY, obstacleGrid.minY, chunkSizePx);
        const aabb = chunkWorldAabbInto(this._chunkAabb, obstacleGrid.minX + chunkCol * chunkSizePx, obstacleGrid.minY + chunkRow * chunkSizePx, chunkSizePx);
        return { chunkCol, chunkRow, chunkSizePx, minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.maxY };
    }
    wallChunkTextureSample(cellSize) {
        const chunkSizePx = cellSize * this.settings.cellsPerChunk;
        const chunkCol = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const chunkRow = WALL_CHUNK_TEXTURE_SAMPLE_CHUNK;
        const minX = -chunkCol * chunkSizePx;
        const minY = -chunkRow * chunkSizePx;
        const aabb = chunkWorldAabbInto(this._chunkAabb, minX + chunkCol * chunkSizePx, minY + chunkRow * chunkSizePx, chunkSizePx);
        return { chunkCol, chunkRow, chunkSizePx, minX, minY, chunkMinX: aabb.minX, chunkMinY: aabb.minY, chunkMaxX: aabb.maxX, chunkMaxY: aabb.maxY, centerX: (aabb.minX + aabb.maxX) / 2, centerY: (aabb.minY + aabb.maxY) / 2 };
    }
}
