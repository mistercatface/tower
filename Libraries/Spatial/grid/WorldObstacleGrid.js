import { colRowToIndex } from "./GridUtils.js";
import { centeredAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsAtOriginInto, cellBoundsToWorldBoundsInto } from "./GridCoords.js";
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
        this.cellBoundsScratch = createAabb();
        this.patchBoundsScratch = createAabb();
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
    }
    _borrowStaticWallProxy(x, y) {
        const size = this.cellSize;
        let proxy = this._staticWallProxies[this._staticWallProxyCount];
        if (!proxy) {
            proxy = { x: 0, y: 0, angle: 0, size, padding: 0, isDead: false, isStaticGridProxy: true, handleHit: () => false };
            this._staticWallProxies[this._staticWallProxyCount] = proxy;
        }
        this._staticWallProxyCount++;
        proxy.x = x;
        proxy.y = y;
        proxy.size = size;
        return proxy;
    }
    /** @param {object} entity @param {object[]} out */
    appendStaticWallProxiesNear(entity, out) {
        if (!this.cols) return out;
        this._staticWallProxyCount = 0;
        const radius = entity.radius ?? 0;
        const { col: ec, row: er } = this.worldToGrid(entity.x, entity.y);
        const pad = 1 + Math.ceil(radius / this.cellSize);
        for (let row = er - pad; row <= er + pad; row++)
            for (let col = ec - pad; col <= ec + pad; col++) {
                if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
                if (!this.isBlocked(col, row)) continue;
                const idx = colRowToIndex(col, row, this.cols);
                if (this.segmentGrid?.[idx]?.length) continue;
                const { x, y } = this.gridToWorld(col, row);
                out.push(this._borrowStaticWallProxy(x, y));
            }
        return out;
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
        centeredAabbInto(this.patchBoundsScratch, centerX, centerY, width, height);
        this.minX = this.patchBoundsScratch.minX;
        this.minY = this.patchBoundsScratch.minY;
        this.maxX = this.patchBoundsScratch.maxX;
        this.maxY = this.patchBoundsScratch.maxY;
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
        const worldBounds = cellBoundsToWorldBoundsInto(this.patchBoundsScratch, bounds, this.minX, this.minY, this.cellSize);
        const localWalls = wallSpatialIndex ? wallSpatialIndex.collectInBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY) : [];
        for (const localWall of localWalls) this.addWall(localWall);
        return bounds;
    }
    /**
     * Write static blocked cells from a cell-origin-aligned bitmap. Clears the target region first,
     * then stamps occupancy (no segment entities). Entity walls overlapping the region are re-indexed.
     * @param {number} originCol Global cell column (region minX = originCol * cellSize).
     * @param {number} originRow
     * @param {number} cols
     * @param {number} rows
     * @param {ArrayLike<number>} cells Row-major; value 1 = blocked.
     * @param {import("../indexes/WallSpatialIndex.js").WallSpatialIndex | null} [wallSpatialIndex]
     * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number }}
     */
    stampStaticOccupancy(originCol, originRow, cols, rows, cells, wallSpatialIndex = null) {
        const { col: baseCol, row: baseRow } = this.worldToGrid(originCol * this.cellSize, originRow * this.cellSize);
        const gridBounds = { startCol: Math.max(0, baseCol), endCol: Math.min(this.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(this.rows - 1, baseRow + rows - 1) };
        clearWallCells(this.grid, this.cols, gridBounds, this.segmentGrid);
        for (let lr = 0; lr < rows; lr++)
            for (let lc = 0; lc < cols; lc++) {
                if (cells[lr * cols + lc] !== 1) continue;
                const col = baseCol + lc;
                const row = baseRow + lr;
                if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
                this.grid[colRowToIndex(col, row, this.cols)] = 1;
            }
        if (wallSpatialIndex && this.segmentGrid) {
            const worldBounds = cellBoundsToWorldBoundsInto(this.patchBoundsScratch, gridBounds, this.minX, this.minY, this.cellSize);
            const localWalls = wallSpatialIndex.collectInBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY);
            for (let i = 0; i < localWalls.length; i++) this.addWall(localWalls[i]);
        }
        return gridBounds;
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
        return cellBoundsAtOriginInto(this.cellBoundsScratch, this.minX, this.minY, col, row, this.cellSize);
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
