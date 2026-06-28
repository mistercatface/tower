import { cellBoundsAt, emptyCellBounds, growCellBounds, isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { clearPrimaryBoundaryAt } from "./boundaryEdit.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Spatial/grid/gridNavEpoch.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { formatPassageModeLabel, isPassageLaserEdge, isRailWallEdge, parsePassageMode, PASSAGE_MODE, railWallCapLevel } from "../Spatial/grid/CellEdge.js";
import { setBoundary, setPassageProfile, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
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
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < rails.length; i++) {
        const { col, row, side } = rails[i];
        if (clearPrimaryBoundaryAt(state, col, row, side) !== "railWall") continue;
        changed = true;
        growCellBounds(bounds, col, row);
    }
    if (!changed) return null;
    bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
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
        clearPrimaryBoundaryAt(state, col, row, side);
        const heightLevel = clampStampWallHeightLevel(wall.heightLevel ?? 1, settings);
        const thicknessLevel = wall.thicknessLevel ?? 1;
        setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        stamped.push({ col, row, side, heightLevel, thicknessLevel });
        growCellBounds(bounds, col, row);
    }
    if (!stamped.length) return { bounds: null, stamped };
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return { bounds, stamped };
}
export function stampRailWallsBatch(state, railWalls) {
    const { bounds, stamped } = stampRailWallsQuiet(state, railWalls);
    if (bounds) commitGridNavEdit(state, bounds);
    return stamped;
}
export function clearRailWallsBatch(state, rails) {
    const bounds = clearRailWallsQuiet(state, rails);
    if (bounds) commitGridNavEdit(state, bounds);
}
export function clearVoxelWallQuiet(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    return true;
}
export function clearVoxelWallsQuiet(state, voxels) {
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < voxels.length; i++) {
        const { col, row } = voxels[i];
        if (!clearVoxelWallQuiet(state, col, row)) continue;
        changed = true;
        growCellBounds(bounds, col, row);
    }
    if (!changed) return null;
    bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
    return bounds;
}
export function clearVoxelWallsBatch(state, voxels) {
    const bounds = clearVoxelWallsQuiet(state, voxels);
    if (bounds) commitGridNavEdit(state, bounds);
    return bounds;
}
/** Clear voxel and rail walls without nav invalidation — pair with commitGridNavEdit or deferred flush. */
export function clearGridWallsQuiet(state, { voxels = [], rails = [] } = {}) {
    return unionCellBounds(clearVoxelWallsQuiet(state, voxels), clearRailWallsQuiet(state, rails));
}
/** Clear voxel and rail walls in one nav invalidation. */
export function clearGridWallsBatch(state, { voxels = [], rails = [] } = {}) {
    const bounds = clearGridWallsQuiet(state, { voxels, rails });
    if (bounds) commitGridNavEdit(state, bounds);
    return bounds;
}
export function clearAllStampedGridWalls(state, { notify = true } = {}) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        grid.grid[idx] = 0;
    }
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) clearPrimaryBoundaryAt(state, col, row, side);
    }
    if (notify) {
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        commitGridNavEdit(state, { startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 }, { fullNavSync: true });
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
        setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { kind: "railWall", capHeightLevel: clampStampWallHeightLevel(heightLevel, settings), thicknessLevel });
        growCellBounds(bounds, col, row);
    }
    if (isEmptyCellBounds(bounds)) return null;
    return bounds;
}
export function applyStampedForcefieldsFromGlobal(state, forcefields, cellSize) {
    const grid = state.obstacleGrid;
    const half = grid.cellHalfSize;
    const bounds = emptyCellBounds();
    const toLocal = (globalCol, globalRow) => {
        const x = globalCol * cellSize + half;
        const y = globalRow * cellSize + half;
        return grid.worldToGrid(x, y);
    };
    for (let i = 0; i < forcefields.length; i++) {
        const { col: globalCol, row: globalRow, side, mode, allowedSide } = forcefields[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        clearPrimaryBoundaryAt(state, col, row, side);
        if (!setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { kind: "passage", mode: parsePassageMode(mode), allowedSide: allowedSide ?? side, powered: false })) continue;
        growCellBounds(bounds, col, row);
    }
    if (isEmptyCellBounds(bounds)) return null;
    return bounds;
}
export function stampVoxelWallAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.grid[idx] = level;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, cellBoundsAt(col, row));
    return true;
}
export function clearVoxelWallAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, cellBoundsAt(col, row));
    return true;
}
export function setVoxelWallHeightAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (!cellIsStaticWall(grid, col, row)) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.grid[idx] === level) return true;
    grid.grid[idx] = level;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    commitGridNavEdit(state, cellBoundsAt(col, row));
    return true;
}
export function stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    clearPrimaryBoundaryAt(state, col, row, side);
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { kind: "railWall", capHeightLevel: level, thicknessLevel }, { bumpRevision: true });
    commitGridNavEdit(state, cellBoundsAt(col, row));
    return true;
}
export function clearRailWallAt(state, col, row, side) {
    if (clearPrimaryBoundaryAt(state, col, row, side, { bumpRevision: true }) !== "railWall") return false;
    commitGridNavEdit(state, cellBoundsAt(col, row));
    return true;
}
export function stampForcefieldAt(state, col, row, side, { mode = PASSAGE_MODE.Solid, allowedSide = side } = {}) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    clearPrimaryBoundaryAt(state, col, row, side);
    if (!setBoundary(grid, colRowToIndex(col, row, grid.cols), side, { kind: "passage", mode: parsePassageMode(mode), allowedSide, powered: false }, { bumpRevision: true })) return false;
    syncPassagePowerNetwork(state);
    return true;
}
export function setForcefieldProfileAt(state, col, row, side, mode, allowedSide) {
    const grid = state.obstacleGrid;
    if (!setPassageProfile(grid, colRowToIndex(col, row, grid.cols), side, mode, allowedSide)) return false;
    syncPassagePowerNetwork(state);
    return true;
}
export function clearForcefieldAt(state, col, row, side) {
    if (clearPrimaryBoundaryAt(state, col, row, side, { bumpRevision: true }) !== "passage") return false;
    syncPassagePowerNetwork(state);
    return true;
}
export function getForcefieldInfo(grid, col, row, side) {
    const boundary = getBoundary(grid, col, row, side);
    if (boundary.primary !== "passage") return null;
    const mode = parsePassageMode(boundary.mode);
    return {
        col,
        row,
        side,
        mode,
        allowedSide: boundary.allowedSide ?? side,
        powered: boundary.powered === true,
        sideLabel: formatGridWallEdgeSideLabel(side),
        modeLabel: formatPassageModeLabel(mode),
    };
}
export function listPlacedForcefields(grid) {
    /** @type {{ col: number, row: number, side: number, label: string }[]} */
    const placed = [];
    let index = 0;
    forEachCellEdge(
        grid,
        (col, row, side, edge) => {
            const mode = parsePassageMode(edge.mode);
            index++;
            const sideLabel = formatGridWallEdgeSideLabel(side);
            const modeTag = mode === PASSAGE_MODE.Solid ? "" : ` · ${formatPassageModeLabel(mode)}`;
            placed.push({ col, row, side, label: `Forcefield #${index} · ${sideLabel}${modeTag}` });
        },
        { filter: isPassageLaserEdge },
    );
    return placed;
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
        (col, row, side, edge) => {
            const capLevel = railWallCapLevel(edge, neighborFillLevel(grid, col, row, side));
            const key = `${side}:${capLevel}:${edge.thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            placed.push({ col, row, side, heightLevel: capLevel, thicknessLevel: edge.thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` });
        },
        { filter: isRailWallEdge },
    );
    return placed;
}
export function getVoxelWallInfo(grid, col, row) {
    if (!cellIsStaticWall(grid, col, row)) return null;
    const idx = colRowToIndex(col, row, grid.cols);
    return { col, row, heightLevel: grid.grid[idx] };
}
export function getRailWallInfo(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    const heightLevel = railWallCapLevel(edge, neighborFillLevel(grid, col, row, side));
    return { col, row, side, heightLevel, thicknessLevel: edge.thicknessLevel, sideLabel: formatGridWallEdgeSideLabel(side) };
}
export function appendGridEdgeOverlayCommand(out, grid, edge, { stroke, lineWidth = 3, dash = null }) {
    cellEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    out.push(overlaySegment(EDGE_P1.x, EDGE_P1.y, EDGE_P2.x, EDGE_P2.y, { stroke, lineWidth, dash: dash ?? undefined }));
}
