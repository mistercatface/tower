import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { colRowToIndex, cellInRect } from "./GridUtils.js";
import { cellEdgeEndpoints, blockingPassageEdgeAt, edgeRailCollisionShouldEmit, edgeRailCollisionThicknessPx, resolveCellWallHeightAtIdx } from "./gridCellTopology.js";
import { CellEdgeStore } from "./CellEdgeStore.js";
import { FloorCellStore } from "./FloorCellStore.js";
import { floorBeltFacingToIndex, isFloorBeltKind, isFloorBeltRailsKind, FLOOR_CELL_KIND } from "./FloorCell.js";
import { boundaryBlocksStep, clearAllBoundariesAtCell, clearBoundaryPrimary, setBoundary, boundaryBlocksStepFrom } from "./boundaryOccupancy.js";
import { syncBeltCellToEdges, clearBeltCellEdges } from "./navGridMutations.js";
import { centeredAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { worldToGridAtOrigin, gridToWorldAtOrigin, cellBoundsAtOriginInto, cellBoundsToWorldBoundsInto } from "./GridCoords.js";
import { invalidateGridLocalNavBake } from "../../Navigation/NavTopology.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "./gridNavEpoch.js";
import { clearWallCells } from "./wallGridBake.js";
import { entityBroadphaseExtent } from "../collision/entityBroadphase.js";
const EDGE_PROXY_P1 = { x: 0, y: 0 };
const EDGE_PROXY_P2 = { x: 0, y: 0 };
export class WorldObstacleGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cellHalfSize = cellSize * 0.5;
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
        this.cols = 0;
        this.rows = 0;
        this.grid = new Uint8Array(0);
        this.edgeStore = new CellEdgeStore();
        this.floorStore = new FloorCellStore();
        this.wallGridRevision = 0;
        this._structureZLevelsRevision = -1;
        this._structureZLevels = [];
        this._fillZLevels = [];
        this.cellBoundsScratch = createAabb();
        this.patchBoundsScratch = createAabb();
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
        this.floorNavEpoch = 0;
        this.gridTopologyEpoch = 0;
        this._passagePowerNavKey = "";
        this._navTopologyRef = null;
    }
    invalidateNavTopology() {
        invalidateGridLocalNavBake(this);
    }
    invalidateStructureZLevelsCache() {
        this._structureZLevelsRevision = -1;
    }
    _rebuildStaticZLevelCaches() {
        const fillSeen = new Set();
        const fillOut = [];
        const structSeen = new Set();
        const structOut = [];
        const size = this.cols * this.rows;
        for (let idx = 0; idx < size; idx++) {
            const px = resolveCellWallHeightAtIdx(this, idx);
            if (px > 0 && !fillSeen.has(px)) {
                fillSeen.add(px);
                fillOut.push(px);
                structSeen.add(px);
                structOut.push(px);
            }
        }
        fillOut.sort((a, b) => a - b);
        const edgeLevels = this.edgeStore.collectTopZLevels(this);
        for (let i = 0; i < edgeLevels.length; i++) {
            const px = edgeLevels[i];
            if (!structSeen.has(px)) {
                structSeen.add(px);
                structOut.push(px);
            }
        }
        structOut.sort((a, b) => a - b);
        this._fillZLevels = fillOut;
        this._structureZLevels = structOut;
        this._structureZLevelsRevision = this.wallGridRevision;
    }
    // Voxel fill caps + edge-rail tops (px) — all horizontal structure layers for chunk/surface passes.
    collectStaticStructureZLevels() {
        if (this._structureZLevelsRevision !== this.wallGridRevision) this._rebuildStaticZLevelCaches();
        return this._structureZLevels;
    }
    // Voxel fill caps only (px) — horizontal roofs over stamped grid[] walls, not edge rails.
    collectStaticFillZLevels() {
        if (this._structureZLevelsRevision !== this.wallGridRevision) this._rebuildStaticZLevelCaches();
        return this._fillZLevels;
    }
    _borrowStaticWallProxy(x, y, col, row) {
        const size = this.cellSize;
        let proxy = this._staticWallProxies[this._staticWallProxyCount];
        if (!proxy) {
            proxy = { x: 0, y: 0, angle: 0, size, padding: 0, isDead: false, isStaticGridProxy: true, isStaticGridFace: false, isEdgeRail: false, gridCol: 0, gridRow: 0 };
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
    resetStaticWallProxyPool() {
        this._staticWallProxyCount = 0;
    }
    appendStaticWallProxiesNearWorld(worldX, worldY, queryRadius, out) {
        const { col: ec, row: er } = this.worldToGrid(worldX, worldY);
        const pad = 1 + Math.ceil(queryRadius / this.cellSize);
        const minCol = Math.max(0, ec - pad);
        const maxCol = Math.min(this.cols - 1, ec + pad);
        const minRow = Math.max(0, er - pad);
        const maxRow = Math.min(this.rows - 1, er + pad);
        forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, this.cols, (col, row, idx) => {
            if (this.grid[idx] !== 0) {
                const { x, y } = this.gridToWorld(col, row);
                out.push(this._borrowStaticWallProxy(x, y, col, row));
            }
            for (let side = 0; side < 4; side++) {
                if (!edgeRailCollisionShouldEmit(this, col, row, side)) continue;
                const blockingPassage = blockingPassageEdgeAt(this, col, row, side);
                const thickness = edgeRailCollisionThicknessPx(this, col, row, side);
                cellEdgeEndpoints(this, col, row, side, EDGE_PROXY_P1, EDGE_PROXY_P2, 0);
                const p1x = EDGE_PROXY_P1.x;
                const p1y = EDGE_PROXY_P1.y;
                const p2x = EDGE_PROXY_P2.x;
                const p2y = EDGE_PROXY_P2.y;
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
                if (blockingPassage) proxy.passageEdge = blockingPassage;
                else if ("passageEdge" in proxy) delete proxy.passageEdge;
                out.push(proxy);
            }
        });
        return out;
    }
    appendStaticWallProxiesNear(entity, out) {
        return this.appendStaticWallProxiesNearWorld(entity.x, entity.y, entityBroadphaseExtent(entity), out);
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
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
    }
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
            if (!cellInRect(nc, nr, this.cols, this.rows)) continue;
            const newIdx = nc + nr * this.cols;
            newGrid[newIdx] = level;
        }
        this.edgeStore.remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows);
        this.floorStore.remap(oldFloorKind, oldFloorFacing, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows);
        this.grid = newGrid;
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
        return true;
    }
    // originCol/originRow are global cell coords; cells is row-major with 1 = blocked.
    stampStaticWalls(originCol, originRow, cols, rows, cells, { additive = false, heightLevel }) {
        const level = heightLevel;
        const { col: baseCol, row: baseRow } = this.worldToGrid(originCol * this.cellSize, originRow * this.cellSize);
        const gridBounds = { startCol: Math.max(0, baseCol), endCol: Math.min(this.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(this.rows - 1, baseRow + rows - 1) };
        if (!additive) clearWallCells(this.grid, this.cols, gridBounds);
        let changed = false;
        const stampSize = rows * cols;
        for (let i = 0; i < stampSize; i++) {
            if (cells[i] !== 1) continue;
            const lr = (i / cols) | 0;
            const lc = i % cols;
            const col = baseCol + lc;
            const row = baseRow + lr;
            if (!cellInRect(col, row, this.cols, this.rows)) continue;
            const idx = col + row * this.cols;
            if (this.grid[idx] !== level) {
                this.grid[idx] = level;
                changed = true;
            }
        }
        if (changed) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Wall);
        return gridBounds;
    }
    writeCellEdge(col, row, side, capHeightLevel, thicknessLevel = 1) {
        setBoundary(this, col, row, side, { kind: "railWall", capHeightLevel, thicknessLevel });
    }
    stampCellEdge(col, row, side, capHeightLevel, thicknessLevel = 1) {
        setBoundary(this, col, row, side, { kind: "railWall", capHeightLevel, thicknessLevel }, { bumpRevision: true });
    }
    clearCellEdge(col, row, side) {
        clearBoundaryPrimary(this, col, row, side, { bumpRevision: true });
    }
    clearCellEdges(col, row) {
        clearAllBoundariesAtCell(this, col, row, { bumpRevision: false });
    }
    getCellEdge(col, row, side) {
        return this.edgeStore.get(col, row, side, this.cols);
    }
    hasCellEdge(col, row, side) {
        return this.edgeStore.has(col, row, side, this.cols);
    }
    edgeBlocksStep(col, row, side) {
        return boundaryBlocksStep(this, col, row, side);
    }
    syncFloorBeltRailEdges(col, row, kind, facingIndex) {
        syncBeltCellToEdges(this, col, row, kind, facingIndex);
    }
    clearFloorBeltRailEdges(col, row, kind, facingIndex) {
        clearBeltCellEdges(this, col, row, kind, facingIndex);
    }
    writeFloorCell(col, row, kind, facingRadians) {
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
        const floorNavChanged =
            (isFloorBeltKind(prevKind) || isFloorBeltKind(kind) || isFloorBeltRailsKind(prevKind) || isFloorBeltRailsKind(kind)) && (prevKind !== kind || prevFacing !== facingIndex);
        if (floorNavChanged) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
        if (edgeChanged) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Wall);
        return true;
    }
    writeFloorBelt(col, row, facingRadians) {
        return this.writeFloorCell(col, row, FLOOR_CELL_KIND.Belt, facingRadians);
    }
    hasFloorOccupancy(col, row) {
        if (!cellInRect(col, row, this.cols, this.rows)) return false;
        return this.floorStore.hasAnyAtIdx(colRowToIndex(col, row, this.cols));
    }
    hasFloorBelt(col, row) {
        if (!cellInRect(col, row, this.cols, this.rows)) return false;
        return this.floorStore.isBeltKindAtIdx(colRowToIndex(col, row, this.cols));
    }
    clearFloorCell(col, row) {
        if (!cellInRect(col, row, this.cols, this.rows)) return false;
        const idx = colRowToIndex(col, row, this.cols);
        if (!this.floorStore.hasAnyAtIdx(idx)) return false;
        const kind = this.floorStore.kind[idx];
        const facingIndex = this.floorStore.facing[idx];
        if (isFloorBeltRailsKind(kind)) {
            this.clearFloorBeltRailEdges(col, row, kind, facingIndex);
            bumpGridNavEpoch(this, GRID_NAV_EPOCH.Wall);
        }
        if (isFloorBeltKind(kind) || isFloorBeltRailsKind(kind)) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
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
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Wall);
    }
    worldToGrid(x, y) {
        return worldToGridAtOrigin(x, y, this.minX, this.minY, this.cellSize);
    }
    gridToWorld(col, row) {
        return gridToWorldAtOrigin(col, row, this.minX, this.minY, this.cellSize);
    }
    isBlocked(col, row) {
        if (!cellInRect(col, row, this.cols, this.rows)) return true;
        return this.grid[colRowToIndex(col, row, this.cols)] !== 0;
    }
    isBlockedWorld(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return this.isBlocked(col, row);
    }
    canStep(currCol, currRow, nextCol, nextRow, navTopology = null) {
        if (!navTopology) return false;
        if (typeof navTopology.canStep === "function") return navTopology.canStep(currCol, currRow, nextCol, nextRow);
        const cardinalOpen = navTopology.navCardinalOpen ?? navTopology.cardinalOpen;
        const vertexPassability = navTopology.vertexPassability;
        if (cardinalOpen && vertexPassability) return !boundaryBlocksStepFrom(this, cardinalOpen, vertexPassability, currCol, currRow, nextCol, nextRow);
        return false;
    }
    getCellBounds(col, row) {
        return cellBoundsAtOriginInto(this.cellBoundsScratch, this.minX, this.minY, col, row, this.cellSize);
    }
}
