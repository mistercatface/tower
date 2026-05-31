import { colRowToIndex } from "../Grid/GridUtils.js";
import { pointToSegmentPaddingDistanceSq } from "../Geometry/WallGeometry.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsToWorldBounds } from "../Geometry/GridCoords.js";

export function getWallReach(wall, padding = wall.padding) {
    return wall.size / 2 * Math.SQRT2 + padding;
}

export function getWallCellBounds(wall, worldToGrid, cols, rows, padding = wall.padding) {
    const reach = getWallReach(wall, padding);
    const minGrid = worldToGrid(wall.x - reach, wall.y - reach);
    const maxGrid = worldToGrid(wall.x + reach, wall.y + reach);

    return {
        startCol: Math.max(0, minGrid.col),
        endCol: Math.min(cols - 1, maxGrid.col),
        startRow: Math.max(0, minGrid.row),
        endRow: Math.min(rows - 1, maxGrid.row),
    };
}

export function markWallOnGrid(wall, grid, cols, rows, { worldToGrid, cellCenter, padding = wall.padding, onBlockedCell }) {
    if (wall.isDead) return;

    const bounds = getWallCellBounds(wall, worldToGrid, cols, rows, padding);
    const paddingSq = padding * padding + 0.01;

    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
            const { x: cx, y: cy } = cellCenter(col, row);

            if (pointToSegmentPaddingDistanceSq(wall, cx, cy) <= paddingSq) {
                const idx = colRowToIndex(col, row, cols);
                grid[idx] = 1;
                if (onBlockedCell) {
                    onBlockedCell(col, row, idx);
                }
            }
        }
    }
}

export function clearWallCells(grid, cols, bounds, segmentGrid = null) {
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        for (let col = bounds.startCol; col <= bounds.endCol; col++) {
            const idx = colRowToIndex(col, row, cols);
            grid[idx] = 0;
            if (segmentGrid && segmentGrid[idx]) {
                segmentGrid[idx].length = 0;
            }
        }
    }
}

function computeBoundsFromWalls(walls, cellSize) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const wall of walls) {
        const reach = wall.size / 2 + wall.padding;
        minX = Math.min(minX, wall.x - reach);
        maxX = Math.max(maxX, wall.x + reach);
        minY = Math.min(minY, wall.y - reach);
        maxY = Math.max(maxY, wall.y + reach);
    }

    if (minX === Infinity) {
        minX = -2000;
        maxX = 2000;
        minY = -12000;
        maxY = 2000;
    } else {
        minX -= 1500;
        maxX += 1500;
        minY -= 1500;
        maxY += 1500;
    }

    minX = Math.floor(minX / cellSize) * cellSize;
    minY = Math.floor(minY / cellSize) * cellSize;
    maxX = Math.ceil(maxX / cellSize) * cellSize;
    maxY = Math.ceil(maxY / cellSize) * cellSize;

    return { minX, maxX, minY, maxY };
}

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
        });
    }

    addWall(wall) {
        markWallOnGrid(wall, this.grid, this.cols, this.rows, {
            worldToGrid: (x, y) => this.worldToGrid(x, y),
            cellCenter: (col, row) => this.gridToWorld(col, row),
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

    patchAfterWallRemoved(wall, wallSpatialHash) {
        const bounds = getWallCellBounds(wall, (x, y) => this.worldToGrid(x, y), this.cols, this.rows);
        clearWallCells(this.grid, this.cols, bounds, this.segmentGrid);

        const worldBounds = cellBoundsToWorldBounds(bounds, this.minX, this.minY, this.cellSize);
        const localWalls = wallSpatialHash
            ? wallSpatialHash.queryBounds(worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY)
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
}
