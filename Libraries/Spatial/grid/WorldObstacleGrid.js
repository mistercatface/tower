import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { colRowToIndex } from "./GridUtils.js";
import { damageStaticGridCell, damageStaticGridEdge } from "../../World/staticCellDamage.js";
import { gridWallEdgeRailShouldEmit, gridBeltRailEdgeShouldEmit, gridRailWallEdge, gridNeighborFillLevel, scanStaticStructureZLevelsFromGrid } from "../../World/wallGridCells.js";
import { CellEdgeStore, railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { FloorCellStore } from "./FloorCellStore.js";
import { floorBeltFacingToIndex, floorBeltRailEdgeSides, floorBeltEntryExitSides, floorBeltEntryNeighborCell, isFloorBeltRailsKind, FLOOR_CELL_KIND } from "./FloorCell.js";
import { createBeltRailEdge, edgeBlocksCrossing, isBeltRailEdge, railWallThicknessPx } from "./CellEdge.js";
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
        this.edgeStore = new CellEdgeStore();
        this.floorStore = new FloorCellStore();
        this.segmentGrid = [];
        this.wallGridRevision = 0;
        this._structureZLevelsRevision = -1;
        /** @type {number[]} */
        this._structureZLevels = [];
        this.cellBoundsScratch = createAabb();
        this.patchBoundsScratch = createAabb();
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
    }
    /** @param {number} damage @param {object} state */
    _staticGridProxyHandleHit(damage, state) {
        if (this.isEdgeRail) damageStaticGridEdge(state, this._obstacleGrid, this.gridCol, this.gridRow, this.gridSide, damage);
        else damageStaticGridCell(state, this._obstacleGrid, this.gridCol, this.gridRow, damage);
    }
    bumpWallGridRevision() {
        this.wallGridRevision = (this.wallGridRevision + 1) | 0;
        this.invalidateStructureZLevelsCache();
    }
    invalidateStructureZLevelsCache() {
        this._structureZLevelsRevision = -1;
    }
    /** voxelBlock + railWall top heights (px), cached on `wallGridRevision`. */
    collectStaticStructureZLevels() {
        if (this._structureZLevelsRevision === this.wallGridRevision) return this._structureZLevels;
        this._structureZLevels = scanStaticStructureZLevelsFromGrid(this);
        this._structureZLevelsRevision = this.wallGridRevision;
        return this._structureZLevels;
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
                isStaticGridFace: false,
                isEdgeRail: false,
                gridCol: 0,
                gridRow: 0,
                handleHit: this._staticGridProxyHandleHit,
            };
            this._staticWallProxies[this._staticWallProxyCount] = proxy;
        }
        this._staticWallProxyCount++;
        proxy._obstacleGrid = this;
        proxy.x = x;
        proxy.y = y;
        proxy.angle = 0;
        proxy.size = size;
        proxy.width = size;
        proxy.height = size;
        proxy.shape = undefined;
        proxy.gridCol = col;
        proxy.gridRow = row;
        proxy.isStaticGridProxy = true;
        proxy.isStaticGridFace = false;
        proxy.isEdgeRail = false;
        if ("gridSide" in proxy) delete proxy.gridSide;
        return proxy;
    }
    /** @param {object} entity @param {object[]} out */
    appendStaticWallProxiesNear(entity, out) {
        // Edge-rail collision: inline boundary segment + rail thickness (verified working).
        // Draw uses resolveGridWallEdgeRailBox; do not swap proxy math without ball regression tests.
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
                const beltRail = gridBeltRailEdgeShouldEmit(this, col, row, side);
                const railWall = gridWallEdgeRailShouldEmit(this, col, row, side);
                if (!beltRail && !railWall) continue;
                const edge = gridRailWallEdge(this, col, row, side);
                const thickness = beltRail ? 1 : railWallThicknessPx(edge);
                const bounds = this.getCellBounds(col, row);
                const minX = bounds.minX;
                const minY = bounds.minY;
                const maxX = bounds.maxX;
                const maxY = bounds.maxY;
                let p1x, p1y, p2x, p2y;
                if (side === 0) {
                    p1x = minX;
                    p1y = minY;
                    p2x = maxX;
                    p2y = minY;
                } else if (side === 1) {
                    p1x = maxX;
                    p1y = minY;
                    p2x = maxX;
                    p2y = maxY;
                } else if (side === 2) {
                    p1x = maxX;
                    p1y = maxY;
                    p2x = minX;
                    p2y = maxY;
                } else {
                    p1x = minX;
                    p1y = maxY;
                    p2x = minX;
                    p2y = minY;
                }
                const dx = p2x - p1x;
                const dy = p2y - p1y;
                const len = Math.hypot(dx, dy);
                let proxy = this._staticWallProxies[this._staticWallProxyCount];
                if (!proxy) {
                    proxy = {
                        x: 0,
                        y: 0,
                        angle: 0,
                        width: 0,
                        height: 0,
                        size: 0,
                        padding: 0,
                        isDead: false,
                        isStaticGridFace: true,
                        isEdgeRail: true,
                        gridCol: col,
                        gridRow: row,
                        gridSide: side,
                        shape: undefined,
                        handleHit: this._staticGridProxyHandleHit,
                    };
                    this._staticWallProxies[this._staticWallProxyCount] = proxy;
                } else {
                    proxy.x = 0;
                    proxy.y = 0;
                    proxy.angle = 0;
                    proxy.width = 0;
                    proxy.height = 0;
                    proxy.size = 0;
                    proxy.padding = 0;
                    proxy.isDead = false;
                    proxy.isStaticGridFace = true;
                    proxy.isStaticGridProxy = false;
                    proxy.isEdgeRail = true;
                    proxy.gridCol = col;
                    proxy.gridRow = row;
                    proxy.gridSide = side;
                    proxy.shape = undefined;
                }
                this._staticWallProxyCount++;
                proxy._obstacleGrid = this;
                proxy.x = (p1x + p2x) * 0.5;
                proxy.y = (p1y + p2y) * 0.5;
                proxy.angle = Math.atan2(dy, dx);
                proxy.width = len;
                proxy.height = thickness;
                proxy.size = Math.max(len, thickness);
                out.push(proxy);
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
        this.edgeStore.reset(size);
        this.floorStore.reset(size);
        this.invalidateStructureZLevelsCache();
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
        this.edgeStore.reset(size);
        this.floorStore.reset(size);
        this.invalidateStructureZLevelsCache();
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
        const oldSlots = this.edgeStore.slots;
        const oldFloorKind = this.floorStore.kind;
        const oldFloorFacing = this.floorStore.facing;
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const level = oldGrid[idx];
            if (level === 0 && !this.edgeStore.hasAnyAtIdx(idx) && !this.floorStore.hasAnyAtIdx(idx)) continue;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
            const newIdx = nc + nr * this.cols;
            newGrid[newIdx] = level;
        }
        this.edgeStore.remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows);
        this.floorStore.remap(oldFloorKind, oldFloorFacing, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows);
        this.grid = newGrid;
        this.invalidateStructureZLevelsCache();
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
    /**
     * @param {number} col
     * @param {number} row
     * @param {number} side 0=N, 1=E, 2=S, 3=W
     * @param {number} capHeightLevel absolute cap height level (0 clears)
     * @param {number} thicknessLevel
     */
    writeCellEdge(col, row, side, capHeightLevel, thicknessLevel = 1) {
        // Does not bump wallGridRevision — batch callers bump once after all edge writes.
        if (capHeightLevel === 0) this.edgeStore.clearMirrored(col, row, side, this.cols, this.rows);
        else this.edgeStore.writeMirrored(col, row, side, this.cols, this.rows, railWallEdgeFromStamp(capHeightLevel, thicknessLevel, gridNeighborFillLevel(this, col, row, side)));
    }
    stampCellEdge(col, row, side, capHeightLevel, thicknessLevel = 1) {
        this.writeCellEdge(col, row, side, capHeightLevel, thicknessLevel);
        this.bumpWallGridRevision();
    }
    clearCellEdge(col, row, side) {
        this.edgeStore.clearMirrored(col, row, side, this.cols, this.rows);
        this.bumpWallGridRevision();
    }
    /** Clear all edge slots on one cell (does not bump revision). */
    clearCellEdges(col, row) {
        for (let side = 0; side < 4; side++) this.edgeStore.clearMirrored(col, row, side, this.cols, this.rows);
    }
    /** @param {number} col @param {number} row @param {number} side */
    edgeBlocksStep(col, row, side) {
        return edgeBlocksCrossing(this.edgeStore.get(col, row, side, this.cols));
    }
    /** @param {number} col @param {number} row @param {number} side */
    writeBeltRailEdge(col, row, side) {
        this.edgeStore.writeMirrored(col, row, side, this.cols, this.rows, createBeltRailEdge());
    }
    /** @param {number} col @param {number} row @param {number} side */
    clearBeltRailEdge(col, row, side) {
        const edge = this.edgeStore.get(col, row, side, this.cols);
        if (!isBeltRailEdge(edge)) return;
        this.edgeStore.clearMirrored(col, row, side, this.cols, this.rows);
    }
    /** @param {number} col @param {number} row @param {number} kind @param {number} facingIndex */
    syncFloorBeltRailEdges(col, row, kind, facingIndex) {
        const sides = floorBeltRailEdgeSides(kind, facingIndex);
        for (let i = 0; i < sides.length; i++) this.writeBeltRailEdge(col, row, sides[i]);
    }
    /** @param {number} col @param {number} row @param {number} kind @param {number} facingIndex */
    clearFloorBeltRailEdges(col, row, kind, facingIndex) {
        const sides = floorBeltRailEdgeSides(kind, facingIndex);
        for (let i = 0; i < sides.length; i++) this.clearBeltRailEdge(col, row, sides[i]);
    }
    /** @param {number} col @param {number} row @param {number} kind @param {number} facingRadians */
    writeFloorCell(col, row, kind, facingRadians) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        if (this.isBlocked(col, row)) return false;
        const idx = colRowToIndex(col, row, this.cols);
        const prevKind = this.floorStore.kind[idx];
        const prevFacing = this.floorStore.facing[idx];
        if (isFloorBeltRailsKind(prevKind)) this.clearFloorBeltRailEdges(col, row, prevKind, prevFacing);
        const facingIndex = floorBeltFacingToIndex(facingRadians);
        this.floorStore.setAtIdx(idx, kind, facingIndex);
        let edgeChanged = false;
        if (isFloorBeltRailsKind(prevKind) || isFloorBeltRailsKind(kind)) edgeChanged = true;
        if (isFloorBeltRailsKind(kind)) this.syncFloorBeltRailEdges(col, row, kind, facingIndex);
        if (edgeChanged) this.bumpWallGridRevision();
        return true;
    }
    /** @param {number} col @param {number} row @param {number} facingRadians */
    writeFloorBelt(col, row, facingRadians) {
        return this.writeFloorCell(col, row, FLOOR_CELL_KIND.Belt, facingRadians);
    }
    /** @param {number} col @param {number} row */
    hasFloorOccupancy(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        return this.floorStore.isBeltKindAtIdx(colRowToIndex(col, row, this.cols));
    }
    /** @param {number} col @param {number} row */
    hasFloorBelt(col, row) {
        return this.hasFloorOccupancy(col, row);
    }
    /** @param {number} col @param {number} row */
    clearFloorCell(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
        const idx = colRowToIndex(col, row, this.cols);
        if (!this.floorStore.hasAnyAtIdx(idx)) return false;
        const kind = this.floorStore.kind[idx];
        const facingIndex = this.floorStore.facing[idx];
        if (isFloorBeltRailsKind(kind)) {
            this.clearFloorBeltRailEdges(col, row, kind, facingIndex);
            this.bumpWallGridRevision();
        }
        this.floorStore.clearAtIdx(idx);
        return true;
    }
    clearAllFloorCells() {
        const size = this.cols * this.rows;
        for (let idx = 0; idx < size; idx++) {
            const kind = this.floorStore.kind[idx];
            if (!isFloorBeltRailsKind(kind)) continue;
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            this.clearFloorBeltRailEdges(col, row, kind, this.floorStore.facing[idx]);
        }
        this.floorStore.reset(size);
        this.bumpWallGridRevision();
    }
    /**
     * When path goal is on a belt cell, plan to the upstream neighbor so HPA approaches from entry.
     * @param {number} fromCol @param {number} fromRow @param {number} targetCol @param {number} targetRow
     */
    snapPathTargetCell(fromCol, fromRow, targetCol, targetRow) {
        const idx = colRowToIndex(targetCol, targetRow, this.cols);
        if (!this.floorStore.isBeltKindAtIdx(idx)) return { col: targetCol, row: targetRow };
        const kind = this.floorStore.kind[idx];
        const facingIndex = this.floorStore.facing[idx];
        const { entrySide } = floorBeltEntryExitSides(kind, facingIndex);
        const neighbor = floorBeltEntryNeighborCell(targetCol, targetRow, entrySide);
        if (neighbor.col < 0 || neighbor.col >= this.cols || neighbor.row < 0 || neighbor.row >= this.rows) return { col: targetCol, row: targetRow };
        if (this.isBlocked(neighbor.col, neighbor.row)) return { col: targetCol, row: targetRow };
        if (fromCol === neighbor.col && fromRow === neighbor.row) return { col: targetCol, row: targetRow };
        return neighbor;
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
    /** @param {number} toCol @param {number} toRow @param {number} fromCol @param {number} fromRow */
    _beltCrossedSideFrom(fromCol, fromRow, toCol, toRow) {
        const dc = fromCol - toCol;
        const dr = fromRow - toRow;
        if (dc === -1) return 3;
        if (dc === 1) return 1;
        if (dr === -1) return 0;
        if (dr === 1) return 2;
        return -1;
    }
    /** @param {number} toCol @param {number} toRow @param {number} fromCol @param {number} fromRow */
    _beltBlocksEntryFrom(fromCol, fromRow, toCol, toRow) {
        const idx = colRowToIndex(toCol, toRow, this.cols);
        if (!this.floorStore.isBeltKindAtIdx(idx)) return false;
        const kind = this.floorStore.kind[idx];
        const { exitSide } = floorBeltEntryExitSides(kind, this.floorStore.facing[idx]);
        const dc = fromCol - toCol;
        const dr = fromRow - toRow;
        if (dc === 0 && dr === 0) return false;
        const crossed = this._beltCrossedSideFrom(fromCol, fromRow, toCol, toRow);
        if (crossed >= 0) return crossed === exitSide;
        const sideX = dc > 0 ? 1 : 3;
        const sideY = dr > 0 ? 2 : 0;
        return sideX === exitSide || sideY === exitSide;
    }
    canStep(currCol, currRow, nextCol, nextRow) {
        if (this.isBlocked(nextCol, nextRow)) return false;
        if (this._beltBlocksEntryFrom(currCol, currRow, nextCol, nextRow)) return false;
        const dc = nextCol - currCol;
        const dr = nextRow - currRow;
        // Cardinal step
        if (dc !== 0 && dr === 0) {
            const side = dc > 0 ? 1 : 3;
            if (this.edgeBlocksStep(currCol, currRow, side)) return false;
        } else if (dc === 0 && dr !== 0) {
            const side = dr > 0 ? 2 : 0;
            if (this.edgeBlocksStep(currCol, currRow, side)) return false;
        } else if (dc !== 0 && dr !== 0) {
            if (this.isBlocked(currCol + dc, currRow) || this.isBlocked(currCol, currRow + dr)) return false;
            const sideX = dc > 0 ? 1 : 3;
            const sideY = dr > 0 ? 2 : 0;
            if (this.edgeBlocksStep(currCol, currRow, sideX)) return false;
            if (this.edgeBlocksStep(currCol, currRow, sideY)) return false;
            const oppSideX = dc > 0 ? 3 : 1;
            const oppSideY = dr > 0 ? 0 : 2;
            if (this.edgeBlocksStep(nextCol, nextRow, oppSideX)) return false;
            if (this.edgeBlocksStep(nextCol, nextRow, oppSideY)) return false;
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
