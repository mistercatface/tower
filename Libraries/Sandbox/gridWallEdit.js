import { cellBoundsAt, emptyCellBounds, growCellBounds, growCellBoundsIdx, isEmptyCellBounds, unionCellBounds, padCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Spatial/grid/gridNavEpoch.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isRailWallEdge, railWallCapLevel } from "../Spatial/grid/CellEdgeStore.js";
import { setBoundary, clearBoundaryPrimary, boundaryBlocksStep } from "../Spatial/grid/boundaryOccupancy.js";
import { cellIsStaticWall, cellIsStaticWallAtIdx, forEachCellEdge, neighborFillLevel, cellEdgeEndpoints } from "../Spatial/grid/gridCellTopology.js";
import { clampStampWallHeightLevel } from "../WorldSurface/stampWallHeight.js";
import { overlaySegment } from "../Render/overlays/overlayCommands.js";
const ENSURE_AABB = createAabb();
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const EDGE_SIDE_LABELS = ["North (+Y)", "East (+X)", "South (-Y)", "West (-X)"];
export function formatGridWallEdgeSideLabel(side) {
    return EDGE_SIDE_LABELS[side] ?? `Side ${side}`;
}
export function hitTestRailWallEdgeAtWorld(grid, worldX, worldY, hitWorld = grid.cellSize * 0.25) {
    const col = grid.worldCol(worldX);
    const row = grid.worldRow(worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const bounds = grid.getCellBounds(col, row);
    const localX = worldX - bounds.minX;
    const localY = worldY - bounds.minY;
    const cellSize = grid.cellSize;
    const dists = [localY, cellSize - localX, cellSize - localY, localX];
    let bestSide = -1;
    let bestDist = hitWorld;
    for (let side = 0; side < 4; side++)
        if (dists[side] <= bestDist) {
            bestDist = dists[side];
            bestSide = side;
        }
    if (bestSide < 0) return null;
    return { col, row, side: bestSide };
}
export function ensureObstacleGridAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    centeredAabbInto(ENSURE_AABB, worldX, worldY, grid.cellSize, grid.cellSize);
    grid.expandToCoverAabb(ENSURE_AABB);
    return grid.worldToGrid(worldX, worldY);
}
export function clearRailWallsQuiet(state, rails) {
    const grid = state.obstacleGrid;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < rails.length; i++) {
        const { idx, side } = rails[i];
        if (!clearPrimaryBoundaryAt(state, idx, side)) continue;
        changed = true;
        growCellBoundsIdx(bounds, idx, grid.cols);
    }
    if (!changed) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
export function stampRailWallsQuiet(state, railWalls) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} */
    const stamped = [];
    const bounds = emptyCellBounds();
    for (let i = 0; i < railWalls.length; i++) {
        const wall = railWalls[i];
        const { col, row, side } = wall;
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = colRowToIndex(col, row, grid.cols);
        clearPrimaryBoundaryAt(state, idx, side);
        const heightLevel = clampStampWallHeightLevel(wall.heightLevel ?? 1, settings);
        const thicknessLevel = wall.thicknessLevel ?? 1;
        setBoundary(grid, idx, side, { capHeightLevel: heightLevel, thicknessLevel });
        stamped.push({ col, row, side, heightLevel, thicknessLevel });
        growCellBounds(bounds, col, row);
    }
    if (!stamped.length) return { bounds: null, stamped };
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { bounds, stamped };
}
export function stampRailWallsBatch(state, railWalls) {
    const { bounds, stamped } = stampRailWallsQuiet(state, railWalls);
    if (bounds) {
        const grid = state.obstacleGrid;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, padCellBoundsToGrid(bounds, grid.cols, grid.rows, 1));
    }
    return stamped;
}
export function clearRailWallsBatch(state, rails) {
    const bounds = clearRailWallsQuiet(state, rails);
    if (bounds) {
        const grid = state.obstacleGrid;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, padCellBoundsToGrid(bounds, grid.cols, grid.rows, 1));
    }
}
export function clearVoxelWallQuiet(state, idx) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    return true;
}
export function clearVoxelWallsQuiet(state, voxelIndices) {
    const grid = state.obstacleGrid;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < voxelIndices.length; i++) {
        const idx = voxelIndices[i];
        if (!clearVoxelWallQuiet(state, idx)) continue;
        changed = true;
        growCellBoundsIdx(bounds, idx, grid.cols);
    }
    if (!changed) return null;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
export function clearVoxelWallsBatch(state, voxelIndices) {
    const bounds = clearVoxelWallsQuiet(state, voxelIndices);
    if (bounds) {
        const grid = state.obstacleGrid;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, padCellBoundsToGrid(bounds, grid.cols, grid.rows, 1));
    }
    return bounds;
}
/** Clear voxel and rail walls without nav invalidation — pair with commitGridNavEdit or deferred flush. */
export function clearGridWallsQuiet(state, { voxels = [], rails = [] } = {}) {
    return unionCellBounds(clearVoxelWallsQuiet(state, voxels), clearRailWallsQuiet(state, rails));
}
/** Clear voxel and rail walls in one nav invalidation. */
export function clearGridWallsBatch(state, { voxels = [], rails = [] } = {}) {
    const bounds = clearGridWallsQuiet(state, { voxels, rails });
    if (bounds) {
        const grid = state.obstacleGrid;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, padCellBoundsToGrid(bounds, grid.cols, grid.rows, 1));
    }
    return bounds;
}
export function clearAllStampedGridWalls(state, { notify = true } = {}) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        grid.grid[idx] = 0;
    }
    for (let idx = 0; idx < size; idx++) for (let side = 0; side < 4; side++) clearPrimaryBoundaryAt(state, idx, side);
    if (notify) {
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, null, { fullNavSync: true });
    }
}
/** Stamp many voxel/rail walls from global grid cells — one cache/nav invalidation at the end. */
export function applyStampedGridWallsFromGlobal(state, voxels, railWalls, cellSize) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const half = grid.cellHalfSize;
    const bounds = emptyCellBounds();
    const toLocal = (globalCol, globalRow) => {
        const x = globalCol * cellSize + half;
        const y = globalRow * cellSize + half;
        return grid.worldToGrid(x, y);
    };
    for (let i = 0; i < voxels.length; i++) {
        const { col: globalCol, row: globalRow, heightLevel } = voxels[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = colRowToIndex(col, row, grid.cols);
        grid.grid[idx] = clampStampWallHeightLevel(heightLevel, settings);
        growCellBounds(bounds, col, row);
    }
    for (let i = 0; i < railWalls.length; i++) {
        const { col: globalCol, row: globalRow, side, heightLevel, thicknessLevel } = railWalls[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { capHeightLevel: clampStampWallHeightLevel(heightLevel, settings), thicknessLevel });
        growCellBounds(bounds, col, row);
    }
    if (isEmptyCellBounds(bounds)) return null;
    return bounds;
}
export function stampVoxelWallAt(state, idx, heightLevel) {
    const grid = state.obstacleGrid;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.grid[idx] = level;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, idx);
    return true;
}
export function clearVoxelWallAt(state, idx) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, idx);
    return true;
}
export function setVoxelWallHeightAt(state, idx, heightLevel) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWall(grid, idx)) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    if (grid.grid[idx] === level) return true;
    grid.grid[idx] = level;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, idx);
    return true;
}
export function stampRailWallAt(state, idx, side, heightLevel, thicknessLevel) {
    const grid = state.obstacleGrid;
    clearPrimaryBoundaryAt(state, idx, side);
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    setBoundary(grid, idx, side, { capHeightLevel: level, thicknessLevel }, true);
    commitGridNavEdit(state, idx);
    return true;
}
export function clearRailWallAt(state, idx, side) {
    if (!clearPrimaryBoundaryAt(state, idx, side, true)) return false;
    commitGridNavEdit(state, idx);
    return true;
}
export function listPlacedVoxelWalls(grid) {
    /** @type {{ col: number, row: number, heightLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const heightLevel = grid.grid[idx];
        const index = (counts.get(heightLevel) ?? 0) + 1;
        counts.set(heightLevel, index);
        placed.push({ col, row, heightLevel, label: `Voxel #${index} · height ${heightLevel}` });
    }
    return placed;
}
export function listPlacedRailWalls(grid) {
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    forEachCellEdge(
        grid,
        (col, row, side, edge, idx) => {
            const capLevel = railWallCapLevel(edge, neighborFillLevel(grid, idx, side));
            const key = `${side}:${capLevel}:${edge.thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            placed.push({ col, row, side, heightLevel: capLevel, thicknessLevel: edge.thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` });
        },
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        isRailWallEdge,
    );
    return placed;
}
export function getVoxelWallInfo(grid, idx) {
    if (!cellIsStaticWall(grid, idx)) return null;
    return { idx, heightLevel: grid.grid[idx] };
}
export function getRailWallInfo(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isRailWallEdge(edge)) return null;
    const heightLevel = railWallCapLevel(edge, neighborFillLevel(grid, idx, side));
    const col = idx % grid.cols;
    const row = (idx / grid.cols) | 0;
    return { col, row, side, heightLevel, thicknessLevel: edge.thicknessLevel, sideLabel: formatGridWallEdgeSideLabel(side) };
}
export function appendGridEdgeOverlayCommand(out, grid, edge, { stroke, lineWidth = 3, dash = null }) {
    cellEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    out.push(overlaySegment(EDGE_P1.x, EDGE_P1.y, EDGE_P2.x, EDGE_P2.y, { stroke, lineWidth, dash: dash ?? undefined }));
}
export function clearPrimaryBoundaryAt(state, idx, side, bumpRevision = false) {
    const grid = state.obstacleGrid;
    if (!boundaryBlocksStep(grid, idx, side)) return false;
    clearBoundaryPrimary(grid, idx, side, bumpRevision);
    return true;
}
export function createDeferredGridWallCommit(state) {
    const pending = new Set();
    return {
        get hasPending() {
            return pending.size > 0;
        },
        clearVoxel(idx) {
            if (!clearVoxelWallQuiet(state, idx)) return false;
            pending.add(idx);
            return true;
        },
        clearVoxels(voxelIndices) {
            let changed = false;
            for (let i = 0; i < voxelIndices.length; i++)
                if (clearVoxelWallQuiet(state, voxelIndices[i])) {
                    pending.add(voxelIndices[i]);
                    changed = true;
                }
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
            return changed;
        },
        clearRails(rails) {
            let changed = false;
            for (let i = 0; i < rails.length; i++) {
                const { idx, side } = rails[i];
                if (clearPrimaryBoundaryAt(state, idx, side)) {
                    pending.add(idx);
                    changed = true;
                }
            }
            if (changed) bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
            return changed;
        },
        clearWalls({ voxels = [], rails = [] } = {}) {
            let changed = false;
            if (this.clearVoxels(voxels)) changed = true;
            if (this.clearRails(rails)) changed = true;
            return changed;
        },
        flush() {
            if (!pending.size) return false;
            const bounds = emptyCellBounds();
            for (const idx of pending) growCellBoundsIdx(bounds, idx, state.obstacleGrid.cols);
            commitGridNavEdit(state, padCellBoundsToGrid(bounds, state.obstacleGrid.cols, state.obstacleGrid.rows, 1));
            pending.clear();
            return true;
        },
    };
}
