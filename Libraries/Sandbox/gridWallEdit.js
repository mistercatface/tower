import { packCellKey, packEdgeCellKey } from "../DataStructures/CellKey.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isRailWallEdge, railWallCapLevel } from "../Spatial/grid/CellEdge.js";
import { gridNeighborFillLevel } from "../World/wallGridCells.js";
import { cellIsStaticWallAtIdx, gridCellToGlobalColRow, gridWallEdgeEndpoints } from "../World/wallGridCells.js";
import { clampStampWallHeightLevel } from "../WorldSurface/stampWallHeight.js";
const ENSURE_AABB = createAabb();
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const EDGE_SIDE_LABELS = ["North (+Y)", "East (+X)", "South (-Y)", "West (-X)"];
/** @param {number} side */
export function formatGridWallEdgeSideLabel(side) {
    return EDGE_SIDE_LABELS[side] ?? `Side ${side}`;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function gridHasVoxelWall(grid, col, row) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return cellIsStaticWallAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridHasRailWall(grid, col, row, side) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return isRailWallEdge(grid.edgeStore.get(col, row, side, grid.cols));
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [hitWorld]
 * @returns {{ col: number, row: number, side: number } | null}
 */
export function hitTestRailWallEdgeAtWorld(grid, worldX, worldY, hitWorld = grid.cellSize * 0.25) {
    const { col, row } = grid.worldToGrid(worldX, worldY);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
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
/** @param {object} state @param {number} worldX @param {number} worldY */
export function ensureObstacleGridAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    centeredAabbInto(ENSURE_AABB, worldX, worldY, grid.cellSize, grid.cellSize);
    grid.expandToCoverAabb(ENSURE_AABB);
    return grid.worldToGrid(worldX, worldY);
}
/** @param {object} state @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} bounds */
function notifyGridWallChange(state, bounds) {
    state.obstacleGrid.bumpWallGridRevision();
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
    rebuildLabMapCaches(state);
}
/** @param {number} col @param {number} row */
function cellBounds(col, row) {
    return { startCol: col, endCol: col, startRow: row, endRow: row };
}
/** @param {object} state @param {number} col @param {number} row @param {number} heightLevel */
export function stampVoxelWallAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.segmentGrid?.[idx]?.length) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.grid[idx] = level;
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row */
export function clearVoxelWallAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} heightLevel */
export function setVoxelWallHeightAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (!gridHasVoxelWall(grid, col, row)) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.grid[idx] === level) return true;
    grid.grid[idx] = level;
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {number} heightLevel @param {number} thicknessLevel */
export function stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel) {
    const grid = state.obstacleGrid;
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.writeCellEdge(col, row, side, level, thicknessLevel);
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side */
export function clearRailWallAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    if (!gridHasRailWall(grid, col, row, side)) return false;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    state.staticCellHealth.delete(packEdgeCellKey(globalCol, globalRow, side));
    grid.clearCellEdge(col, row, side);
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {number} heightLevel @param {number} thicknessLevel */
export function setRailWallAt(state, col, row, side, heightLevel, thicknessLevel) {
    return stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
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
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function listPlacedRailWalls(grid) {
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            if (!isRailWallEdge(edge)) continue;
            const capLevel = railWallCapLevel(edge, gridNeighborFillLevel(grid, col, row, side));
            const key = `${side}:${capLevel}:${edge.thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            placed.push({ col, row, side, heightLevel: capLevel, thicknessLevel: edge.thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` });
        }
    }
    return placed;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function getVoxelWallInfo(grid, col, row) {
    if (!gridHasVoxelWall(grid, col, row)) return null;
    const idx = colRowToIndex(col, row, grid.cols);
    return { col, row, heightLevel: grid.grid[idx] };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function getRailWallInfo(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    const heightLevel = railWallCapLevel(edge, gridNeighborFillLevel(grid, col, row, side));
    return { col, row, side, heightLevel, thicknessLevel: edge.thicknessLevel, sideLabel: formatGridWallEdgeSideLabel(side) };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number, side: number }} edge
 * @param {number} lineScale
 */
export function strokeSelectedRailWallEdge(ctx, grid, edge, lineScale) {
    gridWallEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    ctx.lineWidth = 3 * lineScale;
    ctx.beginPath();
    ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
    ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
    ctx.stroke();
}
