import { colRowToIndex } from "./GridUtils.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsToWorldBounds } from "./GridCoords.js";
import { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls } from "./wallGridBake.js";
import { collectSegmentsAlongLine, collectSegmentsInWorldBounds, collectSegmentsNearPose, segmentGridLayoutFromObstacleGrid } from "./segmentGridWalk.js";
export { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls } from "./wallGridBake.js";
/**
 * Occupancy + per-cell wall segment index. Implements NavGraph for pathfinding.
 */
export class WorldObstacleGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.cols = 0;
        this.rows = 0;
        this.grid = new Uint8Array(0);
        this.segmentGrid = [];
    }
    rebuild(walls) {
        const bounds = computeBoundsFromWalls(walls, this.cellSize);
        this.minX = bounds.minX;
        this.maxX = bounds.maxX;
        this.minY = bounds.minY;
        this.maxY = bounds.maxY;
        this.cols = Math.ceil((this.maxX - this.minX) / this.cellSize);
        this.rows = Math.ceil((this.maxY - this.minY) / this.cellSize);
        const size = this.cols * this.rows;
        this.grid = new Uint8Array(size);
        this.segmentGrid = new Array(size);
        for (const wall of walls) this.addWall(wall);
    }
    rebuildFixed(centerX, centerY, width, height) {
        this.minX = centerX - width / 2;
        this.minY = centerY - height / 2;
        this.maxX = centerX + width / 2;
        this.maxY = centerY + height / 2;
        this.cols = Math.ceil(width / this.cellSize);
        this.rows = Math.ceil(height / this.cellSize);
        const size = this.cols * this.rows;
        this.grid = new Uint8Array(size);
        this.segmentGrid = null;
    }
    markWall(wall) {
        markWallOnGrid(wall, this.grid, this.cols, this.rows, { worldToGrid: (x, y) => this.worldToGrid(x, y), cellCenter: (col, row) => this.gridToWorld(col, row), cellSize: this.cellSize });
    }
    addWall(wall) {
        markWallOnGrid(wall, this.grid, this.cols, this.rows, {
            worldToGrid: (x, y) => this.worldToGrid(x, y),
            cellCenter: (col, row) => this.gridToWorld(col, row),
            cellSize: this.cellSize,
            onBlockedCell: (_col, _row, idx) => {
                if (!this.segmentGrid[idx]) this.segmentGrid[idx] = [];
                if (!this.segmentGrid[idx].includes(wall)) this.segmentGrid[idx].push(wall);
            },
        });
    }
    patchAfterWallRemoved(wall, wallSpatialIndex) {
        const bounds = getWallCellBounds(wall, (x, y) => this.worldToGrid(x, y), this.cols, this.rows);
        clearWallCells(this.grid, this.cols, bounds, this.segmentGrid);
        const worldBounds = cellBoundsToWorldBounds(bounds, this.minX, this.minY, this.cellSize);
        const localWalls = wallSpatialIndex ? wallSpatialIndex.collectInBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY) : [];
        for (const localWall of localWalls) this.addWall(localWall);
        return bounds;
    }
    worldToGrid(x, y) {
        return worldToGridAtOrigin(x, y, this.minX, this.minY, this.cellSize);
    }
    gridToWorld(col, row) {
        return gridToWorldAtOrigin(col, row, this.minX, this.minY, this.cellSize);
    }
    isBlocked(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
        return this.grid[colRowToIndex(col, row, this.cols)] === 1;
    }
    isBlockedWorld(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return this.isBlocked(col, row);
    }
    getCellBounds(col, row) {
        return { minX: this.minX + col * this.cellSize, minY: this.minY + row * this.cellSize, maxX: this.minX + (col + 1) * this.cellSize, maxY: this.minY + (row + 1) * this.cellSize };
    }
    _segmentLayout() {
        return segmentGridLayoutFromObstacleGrid(this);
    }
    getNearbySegments(entity) {
        return collectSegmentsNearPose(this._segmentLayout(), entity);
    }
    getSegmentsAlongLine(x1, y1, x2, y2) {
        return collectSegmentsAlongLine(this._segmentLayout(), x1, y1, x2, y2);
    }
    getSegmentsInBounds(minX, minY, maxX, maxY) {
        return collectSegmentsInWorldBounds(this._segmentLayout(), minX, minY, maxX, maxY);
    }
}
