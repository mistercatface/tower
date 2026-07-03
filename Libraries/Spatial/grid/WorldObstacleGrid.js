import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { colRowToIndex, cellInRect } from "./GridUtils.js";
import { cellEdgeEndpoints, railWallEdgeShouldEmit, edgeRailCollisionThicknessPx, resolveCellWallHeightAtIdx } from "./gridCellTopology.js";
import { CellEdgeStore } from "./CellEdgeStore.js";
import { SurfaceMaterialStore } from "./SurfaceMaterialStore.js";
import { isFloorBeltKind, FloorCellStore } from "./FloorCell.js";
import { clearAllBoundariesAtCell, setBoundary, boundaryBlocksStepFrom } from "./boundaryOccupancy.js";
import { centeredAabbInto, createAabb } from "../../Math/Aabb2D.js";
import { worldColAtOrigin, worldRowAtOrigin, gridCenterXAtOrigin, gridCenterYAtOrigin, cellBoundsAtOriginInto, cellBoundsAtOriginIdxInto, cellBoundsToWorldBoundsInto } from "./GridCoords.js";
import { invalidateGridLocalNavBake } from "../../Navigation/NavTopology.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, bumpFloorOccupancyStampDrawRevision, bumpSurfaceMaterialRevision } from "./gridNavEpoch.js";
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
        this.surfaceMaterials = new SurfaceMaterialStore();
        this.surfaceMaterialCellsPerChunk = 0;
        this.wallGridRevision = 0;
        this.surfaceMaterialRevision = 0;
        this._structureZLevelsRevision = -1;
        this._structureZLevels = [];
        this._fillZLevels = [];
        this.cellBoundsScratch = createAabb();
        this.patchBoundsScratch = createAabb();
        this._staticWallProxies = [];
        this._staticWallProxyCount = 0;
        this.floorNavEpoch = 0;
        this.gridTopologyEpoch = 0;
        this._navTopologyRef = null;
        this.onBoundsResync = null;
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
            proxy = {
                _obstacleGrid: undefined,
                x: 0,
                y: 0,
                angle: 0,
                width: 0,
                height: 0,
                size: 0,
                padding: 0,
                isDead: false,
                isStaticGridProxy: false,
                isStaticGridFace: false,
                isEdgeRail: false,
                gridCol: 0,
                gridRow: 0,
                gridSide: 0,
                shape: undefined,
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
        proxy.gridSide = 0;
        return proxy;
    }
    resetStaticWallProxyPool() {
        this._staticWallProxyCount = 0;
    }
    appendStaticWallProxiesNearWorld(worldX, worldY, queryRadius, out) {
        const ec = this.worldCol(worldX);
        const er = this.worldRow(worldY);
        const pad = 1 + Math.ceil(queryRadius / this.cellSize);
        const minCol = Math.max(0, ec - pad);
        const maxCol = Math.min(this.cols - 1, ec + pad);
        const minRow = Math.max(0, er - pad);
        const maxRow = Math.min(this.rows - 1, er + pad);
        forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, this.cols, (col, row, idx) => {
            if (this.grid[idx] !== 0) out.push(this._borrowStaticWallProxy(this.gridCenterX(col), this.gridCenterY(row), col, row));
            for (let side = 0; side < 4; side++) {
                if (!railWallEdgeShouldEmit(this, idx, side)) continue;
                const thickness = edgeRailCollisionThicknessPx(this, idx, side);
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
                        _obstacleGrid: undefined,
                        x: 0,
                        y: 0,
                        angle: 0,
                        width: 0,
                        height: 0,
                        size: 0,
                        padding: 0,
                        isDead: false,
                        isStaticGridProxy: false,
                        isStaticGridFace: false,
                        isEdgeRail: false,
                        gridCol: 0,
                        gridRow: 0,
                        gridSide: 0,
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
                    proxy.shape = undefined;
                }
                this._staticWallProxyCount++;
                proxy._obstacleGrid = this;
                proxy.isStaticGridFace = true;
                proxy.isStaticGridProxy = false;
                proxy.isEdgeRail = true;
                proxy.gridCol = col;
                proxy.gridRow = row;
                proxy.gridSide = side;
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
        this.edgeStore.reset(size, this.cols, this.rows);
        this.floorStore.reset(size);
        this.surfaceMaterials.reset(this.cols, this.rows);
        bumpSurfaceMaterialRevision(this);
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
        if (this.onBoundsResync) this.onBoundsResync(this);
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
        const oldSurfaceMaterials = this.surfaceMaterials.snapshot();
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const level = oldGrid[idx];
            if (level === 0 && !this.edgeStore.hasAnyAtIdx(idx) && !this.floorStore.hasAnyAtIdx(idx) && !this.surfaceMaterials.hasAnyCellAtIdx(idx) && !this.surfaceMaterials.hasAnyEdgeAtIdx(idx))
                continue;
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
        this.surfaceMaterials.remap(oldSurfaceMaterials, oldCols, oldRows, colOffset, rowOffset, this.cols, this.rows, this.surfaceMaterialCellsPerChunk);
        this.grid = newGrid;
        bumpSurfaceMaterialRevision(this);
        this.invalidateStructureZLevelsCache();
        this.invalidateNavTopology();
        bumpGridNavEpoch(this, GRID_NAV_EPOCH.Topology);
        if (this.onBoundsResync) this.onBoundsResync(this);
        return true;
    }
    // originCol/originRow are global cell coords; cells is row-major with 1 = blocked.
    stampStaticWalls(originCol, originRow, cols, rows, cells, { additive = false, heightLevel }) {
        const level = heightLevel;
        const baseCol = this.worldCol(originCol * this.cellSize);
        const baseRow = this.worldRow(originRow * this.cellSize);
        const gridBounds = { startCol: Math.max(0, baseCol), endCol: Math.min(this.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(this.rows - 1, baseRow + rows - 1) };
        if (!additive)
            forEachDenseCellInRect(gridBounds.startCol, gridBounds.endCol, gridBounds.startRow, gridBounds.endRow, this.cols, (_c, _r, idx) => {
                this.grid[idx] = 0;
            });
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
    stampCellEdge(col, row, side, capHeightLevel, thicknessLevel = 1) {
        setBoundary(this, colRowToIndex(col, row, this.cols), side, { capHeightLevel, thicknessLevel }, true);
    }
    clearCellEdges(col, row) {
        clearAllBoundariesAtCell(this, colRowToIndex(col, row, this.cols), false);
    }
    setCellSurfaceProfileAtIdx(idx, profileId) {
        this.surfaceMaterials.setCellAtIdx(idx, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearCellSurfaceProfileAtIdx(idx) {
        this.surfaceMaterials.clearCellAtIdx(idx);
        bumpSurfaceMaterialRevision(this);
    }
    setEdgeSurfaceProfile(col, row, side, profileId) {
        this.surfaceMaterials.writeEdgeMirrored(colRowToIndex(col, row, this.cols), side, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearEdgeSurfaceProfile(col, row, side) {
        this.surfaceMaterials.clearEdgeMirrored(colRowToIndex(col, row, this.cols), side);
        bumpSurfaceMaterialRevision(this);
    }
    setChunkSurfaceProfile(chunkCol, chunkRow, profileId, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.setChunk(chunkCol, chunkRow, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    clearChunkSurfaceProfile(chunkCol, chunkRow, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.clearChunk(chunkCol, chunkRow);
        bumpSurfaceMaterialRevision(this);
    }
    setChunkSurfaceProfileRange(chunkBounds, profileId, cellsPerChunk = 0) {
        if (cellsPerChunk > 0) this.surfaceMaterialCellsPerChunk = cellsPerChunk;
        this.surfaceMaterials.setChunkRange(chunkBounds, profileId);
        bumpSurfaceMaterialRevision(this);
    }
    writeFloorCell(idx, kind, facingIndex) {
        if (this.isBlockedIdx(idx)) return false;
        const prevKind = this.floorStore.kind[idx];
        const prevFacing = this.floorStore.facing[idx];
        this.floorStore.setAtIdx(idx, kind, facingIndex);
        const floorNavChanged = (isFloorBeltKind(prevKind) || isFloorBeltKind(kind)) && (prevKind !== kind || prevFacing !== facingIndex);
        if (floorNavChanged) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    hasFloorOccupancy(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        return this.floorStore.hasAnyAtIdx(idx);
    }
    clearFloorCell(idx) {
        if (idx < 0 || idx >= this.cols * this.rows) return false;
        if (!this.floorStore.hasAnyAtIdx(idx)) return false;
        const kind = this.floorStore.kind[idx];
        if (isFloorBeltKind(kind)) bumpGridNavEpoch(this, GRID_NAV_EPOCH.Floor);
        this.floorStore.clearAtIdx(idx);
        bumpFloorOccupancyStampDrawRevision(this);
        return true;
    }
    clearAllFloorCells() {
        const size = this.cols * this.rows;
        this.floorStore.reset(size);
        bumpFloorOccupancyStampDrawRevision(this);
    }
    worldCol(x) {
        return worldColAtOrigin(x, this.minX, this.cellSize);
    }
    worldRow(y) {
        return worldRowAtOrigin(y, this.minY, this.cellSize);
    }
    gridCenterX(col) {
        return gridCenterXAtOrigin(col, this.minX, this.cellHalfSize);
    }
    gridCenterY(row) {
        return gridCenterYAtOrigin(row, this.minY, this.cellHalfSize);
    }
    gridCenterXByIdx(idx) {
        const col = idx % this.cols;
        return gridCenterXAtOrigin(col, this.minX, this.cellHalfSize);
    }
    gridCenterYByIdx(idx) {
        const row = (idx / this.cols) | 0;
        return gridCenterYAtOrigin(row, this.minY, this.cellHalfSize);
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    worldToGrid(x, y) {
        return { col: this.worldCol(x), row: this.worldRow(y) };
    }
    gridToWorld(col, row) {
        return { x: this.gridCenterX(col), y: this.gridCenterY(row) };
    }
    isBlockedIdx(idx) {
        if (idx < 0 || idx >= this.grid.length) return true;
        return this.grid[idx] !== 0;
    }
    isBlocked(col, row) {
        if (!cellInRect(col, row, this.cols, this.rows)) return true;
        return this.grid[colRowToIndex(col, row, this.cols)] !== 0;
    }
    isBlockedWorld(x, y) {
        return this.isBlocked(this.worldCol(x), this.worldRow(y));
    }
    canStep(fromIdx, toIdx, navTopology = null) {
        if (!navTopology) return false;
        if (typeof navTopology.canStep === "function") return navTopology.canStep(fromIdx, toIdx);
        const cardinalOpen = navTopology.navCardinalOpen ?? navTopology.cardinalOpen;
        const vertexPassability = navTopology.vertexPassability;
        if (cardinalOpen && vertexPassability) return !boundaryBlocksStepFrom(this, cardinalOpen, vertexPassability, fromIdx, toIdx);
        return false;
    }
    getCellBounds(col, row) {
        return cellBoundsAtOriginInto(this.cellBoundsScratch, this.minX, this.minY, col, row, this.cellSize);
    }
    getCellBoundsByIdx(idx) {
        return cellBoundsAtOriginIdxInto(this.cellBoundsScratch, this.minX, this.minY, idx, this.cols, this.cellSize);
    }
}
