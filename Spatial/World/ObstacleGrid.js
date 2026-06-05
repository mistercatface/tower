import { colRowToIndex } from "../../Libraries/Spatial/grid/GridUtils.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsToWorldBounds } from "../../Libraries/Spatial/grid/GridCoords.js";
import {
    getWallCellBounds,
    markWallOnGrid,
    clearWallCells,
    computeBoundsFromWalls,
} from "../../Libraries/Spatial/grid/wallGridBake.js";

export { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls };

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

        for (const wall of walls) {
            this.addWall(wall);
        }
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
        markWallOnGrid(wall, this.grid, this.cols, this.rows, {
            worldToGrid: (x, y) => this.worldToGrid(x, y),
            cellCenter: (col, row) => this.gridToWorld(col, row),
            cellSize: this.cellSize,
        });
    }

    addWall(wall) {
        markWallOnGrid(wall, this.grid, this.cols, this.rows, {
            worldToGrid: (x, y) => this.worldToGrid(x, y),
            cellCenter: (col, row) => this.gridToWorld(col, row),
            cellSize: this.cellSize,
            onBlockedCell: (_col, _row, idx) => {
                if (!this.segmentGrid[idx]) {
                    this.segmentGrid[idx] = [];
                }
                if (!this.segmentGrid[idx].includes(wall)) {
                    this.segmentGrid[idx].push(wall);
                }
            },
        });
    }

    patchAfterWallRemoved(wall, wallSpatialIndex) {
        const bounds = getWallCellBounds(wall, (x, y) => this.worldToGrid(x, y), this.cols, this.rows);
        clearWallCells(this.grid, this.cols, bounds, this.segmentGrid);

        const worldBounds = cellBoundsToWorldBounds(bounds, this.minX, this.minY, this.cellSize);
        const localWalls = wallSpatialIndex
            ? wallSpatialIndex.collectInBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY)
            : [];
        for (const localWall of localWalls) {
            this.addWall(localWall);
        }

        return bounds;
    }

    worldToGrid(x, y) {
        return worldToGridAtOrigin(x, y, this.minX, this.minY, this.cellSize);
    }

    gridToWorld(col, row) {
        return gridToWorldAtOrigin(col, row, this.minX, this.minY, this.cellSize);
    }

    isBlocked(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return true;
        }
        return this.grid[colRowToIndex(col, row, this.cols)] === 1;
    }

    isBlockedWorld(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return this.isBlocked(col, row);
    }

    getCellBounds(col, row) {
        return {
            minX: this.minX + col * this.cellSize,
            minY: this.minY + row * this.cellSize,
            maxX: this.minX + (col + 1) * this.cellSize,
            maxY: this.minY + (row + 1) * this.cellSize,
        };
    }

    getNearbySegments(entity) {
        const reach = entity.radius;
        const minGrid = this.worldToGrid(entity.x - reach, entity.y - reach);
        const maxGrid = this.worldToGrid(entity.x + reach, entity.y + reach);
        const startCol = Math.max(0, minGrid.col);
        const endCol = Math.min(this.cols - 1, maxGrid.col);
        const startRow = Math.max(0, minGrid.row);
        const endRow = Math.min(this.rows - 1, maxGrid.row);
        const nearby = [];

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const cellSegs = this.segmentGrid[colRowToIndex(col, row, this.cols)];
                if (!cellSegs) continue;
                for (const segment of cellSegs) {
                    if (!nearby.includes(segment)) {
                        nearby.push(segment);
                    }
                }
            }
        }

        return nearby;
    }

    getSegmentsAlongLine(x1, y1, x2, y2) {
        const p1 = this.worldToGrid(x1, y1);
        const p2 = this.worldToGrid(x2, y2);

        const col0 = Math.max(0, Math.min(this.cols - 1, p1.col));
        const row0 = Math.max(0, Math.min(this.rows - 1, p1.row));
        const col1 = Math.max(0, Math.min(this.cols - 1, p2.col));
        const row1 = Math.max(0, Math.min(this.rows - 1, p2.row));

        const dcol = Math.abs(col1 - col0);
        const drow = Math.abs(row1 - row0);
        const scol = col0 < col1 ? 1 : -1;
        const srow = row0 < row1 ? 1 : -1;
        let err = dcol - drow;

        let c = col0;
        let r = row0;
        const result = [];
        const checked = new Set();

        while (true) {
            const idx = colRowToIndex(c, r, this.cols);
            const cellSegs = this.segmentGrid[idx];
            if (cellSegs) {
                for (const segment of cellSegs) {
                    if (!checked.has(segment)) {
                        checked.add(segment);
                        result.push(segment);
                    }
                }
            }

            if (c === col1 && r === row1) break;
            const e2 = 2 * err;
            if (e2 > -drow) {
                err -= drow;
                c += scol;
            }
            if (e2 < dcol) {
                err += dcol;
                r += srow;
            }
        }

        return result;
    }

    getSegmentsInBounds(minX, minY, maxX, maxY) {
        if (!this.segmentGrid) return [];

        const minGrid = this.worldToGrid(minX, minY);
        const maxGrid = this.worldToGrid(maxX, maxY);
        const startCol = Math.max(0, minGrid.col);
        const endCol = Math.min(this.cols - 1, maxGrid.col);
        const startRow = Math.max(0, minGrid.row);
        const endRow = Math.min(this.rows - 1, maxGrid.row);
        const result = [];
        const checked = new Set();

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const cellSegs = this.segmentGrid[colRowToIndex(col, row, this.cols)];
                if (!cellSegs) continue;
                for (const segment of cellSegs) {
                    if (!checked.has(segment)) {
                        checked.add(segment);
                        result.push(segment);
                    }
                }
            }
        }

        return result;
    }
}
