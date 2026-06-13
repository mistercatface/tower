import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { colRowToIndex } from "./GridUtils.js";
import { damageStaticGridCell } from "../../World/staticCellDamage.js";
import { gridWallEdgeRailShouldEmit, gridWallEdgeRailToCollisionSegment, gridWallFaceToCollisionSegment } from "../../World/wallGridCells.js";
import { centeredAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsAtOriginInto, cellBoundsToWorldBoundsInto } from "./GridCoords.js";
import { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls } from "./wallGridBake.js";
import { collectSegmentsAlongLine, collectSegmentsInWorldBounds, collectSegmentsNearPose, segmentGridLayoutFromObstacleGrid } from "./segmentGridWalk.js";
export { getWallCellBounds, markWallOnGrid, clearWallCells, computeBoundsFromWalls } from "./wallGridBake.js";
/**
 * Occupancy + per-cell wall segment index. Implements NavGraph for pathfinding.
 * grid[]: 0 = open, 1 … maxWallHeightLevel = static wall height level.
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
        this.edgeGrid = new Uint8Array(0);
        this.edgeThicknessGrid = new Uint8Array(0);
        this.segmentGrid = [];
        this.wallGridRevision = 0;
        this.cellBoundsScratch = createAabb();
        this.patchBoundsScratch = createAabb();
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
    }
    bumpWallGridRevision() {
        this.wallGridRevision = (this.wallGridRevision + 1) | 0;
    }
    _borrowStaticWallProxy(x, y, col, row) {
        const size = this.cellSize;
        let proxy = this._staticWallProxies[this._staticWallProxyCount];
        if (!proxy) {
            proxy = {
                x: 0,
                y: 0,
                angle: 0,
                size,
                padding: 0,
                isDead: false,
                isStaticGridProxy: true,
                gridCol: 0,
                gridRow: 0,
                handleHit(damage, state) {
                    damageStaticGridCell(state, this._obstacleGrid, this.gridCol, this.gridRow, damage);
                },
            };
            this._staticWallProxies[this._staticWallProxyCount] = proxy;
        }
        this._staticWallProxyCount++;
        proxy._obstacleGrid = this;
        proxy.x = x;
        proxy.y = y;
        proxy.size = size;
        proxy.width = size;
        proxy.height = size;
        proxy.shape = undefined;
        proxy.gridCol = col;
        proxy.gridRow = row;
        return proxy;
    }
    _borrowStaticGridFaceSegment(faceOrSegment) {
        const built = faceOrSegment.width != null ? faceOrSegment : gridWallFaceToCollisionSegment(faceOrSegment);
        let proxy = this._staticWallProxies[this._staticWallProxyCount];
        if (!proxy) {
            proxy = { ...built, handleHit: built.handleHit };
            this._staticWallProxies[this._staticWallProxyCount] = proxy;
        } else {
            Object.assign(proxy, built);
            proxy.handleHit = built.handleHit;
            proxy.shape = undefined;
        }
        this._staticWallProxyCount++;
        proxy._obstacleGrid = this;
        return proxy;
    }
    /** @param {object} entity @param {object[]} out */
    appendStaticWallProxiesNear(entity, out) {
        this._staticWallProxyCount = 0;
        const radius = entity.radius ?? 0;
        const { col: ec, row: er } = this.worldToGrid(entity.x, entity.y);
        const pad = 1 + Math.ceil(radius / this.cellSize);
        const minCol = Math.max(0, ec - pad);
        const maxCol = Math.min(this.cols - 1, ec + pad);
        const minRow = Math.max(0, er - pad);
        const maxRow = Math.min(this.rows - 1, er + pad);
        forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, this.cols, (col, row, idx) => {
            if (this.grid[idx] !== 0 && !this.segmentGrid?.[idx]?.length) {
                const { x, y } = this.gridToWorld(col, row);
                out.push(this._borrowStaticWallProxy(x, y, col, row));
            }
            for (let side = 0; side < 4; side++) {
                if (!gridWallEdgeRailShouldEmit(this, col, row, side)) continue;
                const segment = gridWallEdgeRailToCollisionSegment(this, col, row, side);
                if (segment) out.push(this._borrowStaticGridFaceSegment(segment));
            }
        });
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
        this.edgeGrid = new Uint8Array(size * 4);
        this.edgeThicknessGrid = new Uint8Array(size * 4);
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
        this.edgeGrid = new Uint8Array(size * 4);
        this.edgeThicknessGrid = new Uint8Array(size * 4);
        this.segmentGrid = null;
    }
    /**
     * Grow world coverage to include aabb. Preserves existing blocked cells; never shrinks or recenters inward.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} aabb
     * @returns {boolean} true when grid origin or dimensions changed
     */
    expandToCoverAabb(aabb) {
        if (this.cols <= 0) {
            const width = aabb.maxX - aabb.minX;
            const height = aabb.maxY - aabb.minY;
            this.rebuildFixed((aabb.minX + aabb.maxX) / 2, (aabb.minY + aabb.maxY) / 2, width, height);
            return true;
        }
        const newMinX = Math.min(this.minX, aabb.minX);
        const newMinY = Math.min(this.minY, aabb.minY);
        const newMaxX = Math.max(this.maxX, aabb.maxX);
        const newMaxY = Math.max(this.maxY, aabb.maxY);
        if (newMinX === this.minX && newMinY === this.minY && newMaxX === this.maxX && newMaxY === this.maxY) return false;
        const oldMinX = this.minX;
        const oldMinY = this.minY;
        const oldCols = this.cols;
        const oldRows = this.rows;
        const oldGrid = this.grid;
        const colOffset = Math.round((oldMinX - newMinX) / this.cellSize);
        const rowOffset = Math.round((oldMinY - newMinY) / this.cellSize);
        this.minX = newMinX;
        this.minY = newMinY;
        this.maxX = newMaxX;
        this.maxY = newMaxY;
        this.cols = Math.ceil((newMaxX - newMinX) / this.cellSize);
        this.rows = Math.ceil((newMaxY - newMinY) / this.cellSize);
        const newGrid = new Uint8Array(this.cols * this.rows);
        const newEdgeGrid = new Uint8Array(this.cols * this.rows * 4);
        const newEdgeThicknessGrid = new Uint8Array(this.cols * this.rows * 4);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const level = oldGrid[idx];
            if (level === 0 && this.edgeGrid[idx * 4] === 0 && this.edgeGrid[idx * 4 + 1] === 0 && this.edgeGrid[idx * 4 + 2] === 0 && this.edgeGrid[idx * 4 + 3] === 0) continue;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
            const newIdx = nc + nr * this.cols;
            newGrid[newIdx] = level;
            const oldEdgeBase = idx * 4;
            const newEdgeBase = newIdx * 4;
            for (let side = 0; side < 4; side++) {
                newEdgeGrid[newEdgeBase + side] = this.edgeGrid[oldEdgeBase + side];
                newEdgeThicknessGrid[newEdgeBase + side] = this.edgeThicknessGrid[oldEdgeBase + side];
            }
        }
        this.grid = newGrid;
        this.edgeGrid = newEdgeGrid;
        this.edgeThicknessGrid = newEdgeThicknessGrid;
        return true;
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
        const localWalls = wallSpatialIndex ? wallSpatialIndex.collectInBounds(worldBounds) : [];
        for (const localWall of localWalls) this.addWall(localWall);
        return bounds;
    }
    /**
     * Stamp static wall cells from a cell-origin-aligned bitmap (value 1 = wall).
     * Writes heightLevel into grid for each stamped cell.
     * @param {number} originCol Global cell column (region minX = originCol * cellSize).
     * @param {number} originRow
     * @param {number} cols
     * @param {number} rows
     * @param {ArrayLike<number>} cells Row-major; value 1 = blocked.
     * @param {import("../indexes/WallSpatialIndex.js").WallSpatialIndex | null} [wallSpatialIndex]
     * @param {{ additive?: boolean, heightLevel?: number }} [options]
     * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number }}
     */
    stampStaticWalls(originCol, originRow, cols, rows, cells, wallSpatialIndex = null, { additive = false, heightLevel }) {
        const level = heightLevel;
        const { col: baseCol, row: baseRow } = this.worldToGrid(originCol * this.cellSize, originRow * this.cellSize);
        const gridBounds = { startCol: Math.max(0, baseCol), endCol: Math.min(this.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(this.rows - 1, baseRow + rows - 1) };
        if (!additive) clearWallCells(this.grid, this.cols, gridBounds, this.segmentGrid);
        let changed = false;
        const stampSize = rows * cols;
        for (let i = 0; i < stampSize; i++) {
            if (cells[i] !== 1) continue;
            const lr = (i / cols) | 0;
            const lc = i % cols;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
            const idx = col + row * this.cols;
            if (this.grid[idx] !== level) {
                this.grid[idx] = level;
                changed = true;
            }
        }
        if (changed) this.bumpWallGridRevision();
        if (wallSpatialIndex && this.segmentGrid) {
            const worldBounds = cellBoundsToWorldBoundsInto(this.patchBoundsScratch, gridBounds, this.minX, this.minY, this.cellSize);
            const localWalls = wallSpatialIndex.collectInBounds(worldBounds);
            for (let i = 0; i < localWalls.length; i++) this.addWall(localWalls[i]);
        }
        return gridBounds;
    }
    /** Alias for stampStaticWalls for clarity when working alongside stampCellEdge. */
    stampCellFill(originCol, originRow, cols, rows, cells, wallSpatialIndex = null, options) {
        return this.stampStaticWalls(originCol, originRow, cols, rows, cells, wallSpatialIndex, options);
    }
    /**
     * @param {number} col
     * @param {number} row
     * @param {number} side 0=N, 1=E, 2=S, 3=W
     * @param {number} heightLevel
     * @param {number} thickness
     */
    writeCellEdge(col, row, side, heightLevel, thickness = 0) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
        const idx = col + row * this.cols;
        this.edgeGrid[idx * 4 + side] = heightLevel;
        this.edgeThicknessGrid[idx * 4 + side] = thickness;
        let nc = col;
        let nr = row;
        let nSide = 0;
        if (side === 0) {
            nr = row - 1;
            nSide = 2;
        } else if (side === 1) {
            nc = col + 1;
            nSide = 3;
        } else if (side === 2) {
            nr = row + 1;
            nSide = 0;
        } else {
            nc = col - 1;
            nSide = 1;
        }
        if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
            const nIdx = nc + nr * this.cols;
            this.edgeGrid[nIdx * 4 + nSide] = heightLevel;
            this.edgeThicknessGrid[nIdx * 4 + nSide] = thickness;
        }
    }
    stampCellEdge(col, row, side, heightLevel, thickness = 0) {
        this.writeCellEdge(col, row, side, heightLevel, thickness);
        this.bumpWallGridRevision();
    }
    clearCellEdge(col, row, side) {
        this.writeCellEdge(col, row, side, 0, 0);
        this.bumpWallGridRevision();
    }
    worldToGrid(x, y) {
        return worldToGridAtOrigin(x, y, this.minX, this.minY, this.cellSize);
    }
    gridToWorld(col, row) {
        return gridToWorldAtOrigin(col, row, this.minX, this.minY, this.cellSize);
    }
    isBlocked(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
        return this.grid[colRowToIndex(col, row, this.cols)] !== 0;
    }
    isBlockedWorld(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return this.isBlocked(col, row);
    }
    canStep(currCol, currRow, nextCol, nextRow) {
        if (this.isBlocked(nextCol, nextRow)) return false;
        if (!this.edgeGrid) return true;
        const dc = nextCol - currCol;
        const dr = nextRow - currRow;
        // Cardinal step
        if (dc !== 0 && dr === 0) {
            const side = dc > 0 ? 1 : 3; // East or West
            if (this.edgeGrid[(currCol + currRow * this.cols) * 4 + side] !== 0) return false;
        } else if (dc === 0 && dr !== 0) {
            const side = dr > 0 ? 2 : 0; // South or North
            if (this.edgeGrid[(currCol + currRow * this.cols) * 4 + side] !== 0) return false;
        } else if (dc !== 0 && dr !== 0) {
            // Diagonal step
            // Blocked if either cardinal neighbor is blocked by fill
            if (this.isBlocked(currCol + dc, currRow) || this.isBlocked(currCol, currRow + dr)) return false;
            // Blocked if edges along the cardinal paths are blocked
            const sideX = dc > 0 ? 1 : 3;
            const sideY = dr > 0 ? 2 : 0;
            // Edges leaving currCell
            if (this.edgeGrid[(currCol + currRow * this.cols) * 4 + sideX] !== 0) return false;
            if (this.edgeGrid[(currCol + currRow * this.cols) * 4 + sideY] !== 0) return false;
            // Edges entering nextCell
            const oppSideX = dc > 0 ? 3 : 1;
            const oppSideY = dr > 0 ? 0 : 2;
            if (this.edgeGrid[(nextCol + nextRow * this.cols) * 4 + oppSideX] !== 0) return false;
            if (this.edgeGrid[(nextCol + nextRow * this.cols) * 4 + oppSideY] !== 0) return false;
        }
        return true;
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
    getSegmentsInBounds(bounds) {
        return collectSegmentsInWorldBounds(this._segmentLayout(), bounds);
    }
}
