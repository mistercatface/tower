import { runCardinalAStarFlat } from "../../Pathfinding/AStar.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
import { corridorPathHitsOccupied } from "../../Pathfinding/Corridor/corridorFootprint.js";
import { getMapGenBoundsStampExtent } from "../../Sandbox/mapGenBounds.js";
import { createPatchLayout, globalCellIdx, gridCellLayout, layoutCellIndex } from "../../Spatial/grid/GridUtils.js";
const FULL_FOOTPRINT = { interiorOnly: false };
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {object} railConfig */
export function railMazeBeltZoneGridBounds(grid, railConfig) {
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    return { startCol: Math.max(0, baseCol), endCol: Math.min(grid.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(grid.rows - 1, baseRow + rows - 1) };
}
/**
 * Cardinal A* over nav-walkable cells in the rail zone patch.
 * Patch-local indices exist only inside this pathfinder; all external sets use {@link GlobalCellIdx}.
 *
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} gridNavContext
 * @param {object} railConfig
 * @param {Set<import("../../Spatial/grid/GridUtils.js").GlobalCellIdx>} walkableGlobalIndices
 */
export function createRailMazeNavCorridorPathfinder(grid, gridNavContext, railConfig, walkableGlobalIndices) {
    const bounds = railMazeBeltZoneGridBounds(grid, railConfig);
    const patchCols = bounds.endCol - bounds.startCol + 1;
    const patchRows = bounds.endRow - bounds.startRow + 1;
    const patchLayout = createPatchLayout(bounds.startCol, bounds.startRow, patchCols, patchRows);
    const globalLayout = gridCellLayout(grid);
    const size = patchLayout.cellCount;
    const walkable = new Uint8Array(size);
    for (let r = bounds.startRow; r <= bounds.endRow; r++)
        for (let c = bounds.startCol; c <= bounds.endCol; c++) {
            if (!walkableGlobalIndices.has(globalCellIdx(c, r, grid.cols))) continue;
            const patchIdx = layoutCellIndex(c, r, patchLayout.originCol, patchLayout.originRow, patchLayout.strideCols);
            walkable[patchIdx] = 1;
        }
    const searchState = new SearchState(size);
    /** @type {Set<import("../../Spatial/grid/GridUtils.js").GlobalCellIdx>} */
    let reservedGlobalIndices = new Set();
    const navGraph = {
        cols: patchCols,
        rows: patchRows,
        canStep(c0, r0, c1, r1) {
            const patchIdx = r1 * patchCols + c1;
            if (!walkable[patchIdx]) return false;
            const gc0 = c0 + patchLayout.originCol;
            const gr0 = r0 + patchLayout.originRow;
            const gc1 = c1 + patchLayout.originCol;
            const gr1 = r1 + patchLayout.originRow;
            if (reservedGlobalIndices.has(globalCellIdx(gc1, gr1, grid.cols))) return false;
            return grid.canStep(gc0, gr0, gc1, gr1, gridNavContext);
        },
    };
    return {
        globalLayout,
        patchLayout,
        gridCols: grid.cols,
        /** @param {Set<import("../../Spatial/grid/GridUtils.js").GlobalCellIdx>} indices */
        setReservedGlobalIndices(indices) {
            reservedGlobalIndices = indices;
        },
        /** @param {number} startCol @param {number} startRow @param {number} goalCol @param {number} goalRow @param {number} [maxPathLen] */
        findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
            const sc = startCol - patchLayout.originCol;
            const sr = startRow - patchLayout.originRow;
            const gc = goalCol - patchLayout.originCol;
            const gr = goalRow - patchLayout.originRow;
            if (sc < 0 || sr < 0 || sc >= patchCols || sr >= patchRows) return null;
            if (gc < 0 || gr < 0 || gc >= patchCols || gr >= patchRows) return null;
            const si = sr * patchCols + sc;
            const gi = gr * patchCols + gc;
            if (!walkable[si] || !walkable[gi]) return null;
            if (reservedGlobalIndices.has(globalCellIdx(startCol, startRow, grid.cols)) || reservedGlobalIndices.has(globalCellIdx(goalCol, goalRow, grid.cols))) return null;
            const flat = runCardinalAStarFlat(sc, sr, gc, gr, navGraph, patchCols, patchRows, maxPathLen, searchState.prepare());
            if (!flat) return null;
            /** @type {{ c: number, r: number }[]} */
            const path = new Array(flat.length);
            for (let i = 0; i < flat.length; i++) path[i] = { c: flat[i].col + patchLayout.originCol, r: flat[i].row + patchLayout.originRow };
            return path;
        },
    };
}
/**
 * @param {ReturnType<typeof createRailMazeNavCorridorPathfinder>} pathfinder
 * @param {{ col: number, row: number }} start
 * @param {{ col: number, row: number }} end
 * @param {Set<import("../../Spatial/grid/GridUtils.js").GlobalCellIdx>} occupiedGlobalIndices
 * @param {number} [corridorWidth]
 * @param {number} [maxPathLen]
 */
export function findRailMazeNavCorridorPath(pathfinder, start, end, occupiedGlobalIndices, corridorWidth = 1, maxPathLen = 512) {
    pathfinder.setReservedGlobalIndices(occupiedGlobalIndices);
    const path = pathfinder.findPath(start.col, start.row, end.col, end.row, maxPathLen);
    if (!path || path.length < 2) return null;
    if (corridorPathHitsOccupied(path, occupiedGlobalIndices, corridorWidth, pathfinder.globalLayout, FULL_FOOTPRINT)) return null;
    return path;
}
