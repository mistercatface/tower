/**
 * Region static wall edits for the tile lab — same update chain as cavern stamps.
 */
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { packCellKey, packEdgeCellKey } from "../../../Libraries/DataStructures/CellKey.js";
import { clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/sandboxWalls.js";
import { setBoundary } from "../../../Libraries/Spatial/grid/boundaryOccupancy.js";
import { clampStampWallHeightLevel } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { cellIsStaticWall, cellIsStaticWallAtIdx } from "../../../Libraries/World/wallGridCells.js";
import { forEachGlobalCellInBounds, getCellBoundsAabb } from "./cellBoundsConfig.js";
import { ensureLabObstacleGridCoverage } from "./mapWorld.js";
/** @param {import("../../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} globalCol @param {number} globalRow */
function globalCellToLocal(grid, globalCol, globalRow) {
    const half = grid.cellSize * 0.5;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return { col, row, idx: col + row * grid.cols };
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig */
function prepareWallRegion(state, boundsConfig) {
    const regionAabb = getCellBoundsAabb(boundsConfig, gridSettings.cellSize);
    ensureLabObstacleGridCoverage(state, regionAabb);
    clearSandboxWallsInBounds(state, regionAabb);
}
/** @param {import("../state.js").TileLabGameState} state @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} damageBounds @param {boolean} occupancyChanged */
function notifyWallRegionChange(state, damageBounds, occupancyChanged) {
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    if (occupancyChanged) state.navigation.onObstaclesChanged(damageBounds);
    rebuildLabMapCaches(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig @param {number} heightLevel */
export function stampStaticWallsInBounds(state, boundsConfig, heightLevel) {
    prepareWallRegion(state, boundsConfig);
    const grid = state.obstacleGrid;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    let minGc = Infinity;
    let minGr = Infinity;
    let maxGc = -Infinity;
    let maxGr = -Infinity;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let anyNew = false;
    /** @type {{ globalCol: number, globalRow: number, col: number, row: number }[]} */
    const cells = [];
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local) return;
        cells.push({ globalCol, globalRow, col: local.col, row: local.row });
        if (globalCol < minGc) minGc = globalCol;
        if (globalRow < minGr) minGr = globalRow;
        if (globalCol > maxGc) maxGc = globalCol;
        if (globalRow > maxGr) maxGr = globalRow;
        if (!cellIsStaticWall(grid, local.col, local.row)) anyNew = true;
    });
    if (!cells.length) return false;
    const stampCols = maxGc - minGc + 1;
    const stampRows = maxGr - minGr + 1;
    const bitmap = new Uint8Array(stampCols * stampRows);
    for (let i = 0; i < cells.length; i++) {
        const { globalCol, globalRow, col, row } = cells[i];
        bitmap[(globalRow - minGr) * stampCols + (globalCol - minGc)] = 1;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    }
    grid.stampStaticWalls(minGc, minGr, stampCols, stampRows, bitmap, state.wallSpatialIndex, { additive: true, heightLevel: level });
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, anyNew);
    return true;
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig @param {number} side @param {number} heightLevel @param {number} thicknessLevel */
export function stampWallEdgesInBounds(state, boundsConfig, side, heightLevel, thicknessLevel) {
    prepareWallRegion(state, boundsConfig);
    const grid = state.obstacleGrid;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let any = false;
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local) return;
        setBoundary(grid, local.col, local.row, side, { kind: "railWall", capHeightLevel: level, thicknessLevel });
        any = true;
        if (local.col < startCol) startCol = local.col;
        if (local.col > endCol) endCol = local.col;
        if (local.row < startRow) startRow = local.row;
        if (local.row > endRow) endRow = local.row;
    });
    if (!any) return false;
    grid.bumpWallGridRevision();
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, true);
    return true;
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig */
export function deleteStaticWallsInBounds(state, boundsConfig) {
    ensureLabObstacleGridCoverage(state, getCellBoundsAabb(boundsConfig, gridSettings.cellSize));
    const grid = state.obstacleGrid;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let anyRemoved = false;
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local) return;
        let cellChanged = false;
        if (cellIsStaticWallAtIdx(grid, local.idx) && !grid.segmentGrid?.[local.idx]?.length) {
            grid.grid[local.idx] = 0;
            state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
            cellChanged = true;
        }
        for (let side = 0; side < 4; side++) {
            if (!grid.edgeStore.has(local.col, local.row, side, grid.cols)) continue;
            state.staticCellHealth.delete(packEdgeCellKey(globalCol, globalRow, side));
        }
        if (grid.edgeStore.hasAnyAtIdx(local.idx)) {
            grid.clearCellEdges(local.col, local.row);
            cellChanged = true;
        }
        if (!cellChanged) return;
        anyRemoved = true;
        if (local.col < startCol) startCol = local.col;
        if (local.col > endCol) endCol = local.col;
        if (local.row < startRow) startRow = local.row;
        if (local.row > endRow) endRow = local.row;
    });
    if (!anyRemoved) return false;
    grid.bumpWallGridRevision();
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, true);
    return true;
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig @param {number} heightLevel */
export function setStaticWallHeightInBounds(state, boundsConfig, heightLevel) {
    ensureLabObstacleGridCoverage(state, getCellBoundsAabb(boundsConfig, gridSettings.cellSize));
    const grid = state.obstacleGrid;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let any = false;
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local || !cellIsStaticWallAtIdx(grid, local.idx)) return;
        if (grid.grid[local.idx] === level) return;
        grid.grid[local.idx] = level;
        any = true;
        if (local.col < startCol) startCol = local.col;
        if (local.col > endCol) endCol = local.col;
        if (local.row < startRow) startRow = local.row;
        if (local.row > endRow) endRow = local.row;
    });
    if (!any) return false;
    grid.bumpWallGridRevision();
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, false);
    return true;
}
