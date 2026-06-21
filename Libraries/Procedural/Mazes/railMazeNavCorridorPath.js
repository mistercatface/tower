import { FlatGridSearch, GridPathQuery } from "../../Pathfinding/AStar.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
import { FlatGridView } from "../../Pathfinding/FlatGridView.js";
import { corridorPathHitsOccupied } from "../../Pathfinding/Corridor/corridorFootprint.js";
import { getMapGenBoundsStampExtent } from "../../Sandbox/mapGenBounds.js";
import {
    createCellIndexLayout,
    globalCellIdx,
    gridCellLayout,
    layoutAbsCellIndex,
    layoutAbsToLocalCell,
    layoutContainsAbsCell,
    layoutLocalCellIndex,
    layoutLocalToAbsCell,
} from "../../Spatial/grid/GridUtils.js";
import { readNavWalkableFlag } from "./navWalkableIndex.js";
const FULL_FOOTPRINT = { interiorOnly: false };
export function railMazeBeltZoneGridBounds(grid, railConfig) {
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    return { startCol: Math.max(0, baseCol), endCol: Math.min(grid.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(grid.rows - 1, baseRow + rows - 1) };
}
export function createRailMazeNavCorridorPathfinder(grid, navTopology, railConfig, navWalkableIndex) {
    const bounds = railMazeBeltZoneGridBounds(grid, railConfig);
    const patchCols = bounds.endCol - bounds.startCol + 1;
    const patchRows = bounds.endRow - bounds.startRow + 1;
    const patchLayout = createCellIndexLayout(bounds.startCol, bounds.startRow, patchCols, patchRows);
    const globalLayout = gridCellLayout(grid);
    const size = patchLayout.cellCount;
    const walkable = new Uint8Array(size);
    for (let r = bounds.startRow; r <= bounds.endRow; r++)
        for (let c = bounds.startCol; c <= bounds.endCol; c++) {
            if (!readNavWalkableFlag(navWalkableIndex.flags, navWalkableIndex.cols, c, r)) continue;
            walkable[layoutAbsCellIndex(patchLayout, c, r)] = 1;
        }
    const searchState = new SearchState(size);
    let reservedGlobalIndices = new Set();
    const gridView = new FlatGridView(patchCols, patchRows, {
        blocked: null,
        canStep(c0, r0, c1, r1) {
            if (!walkable[layoutLocalCellIndex(patchLayout, c1, r1)]) return false;
            const from = layoutLocalToAbsCell(patchLayout, c0, r0);
            const to = layoutLocalToAbsCell(patchLayout, c1, r1);
            if (reservedGlobalIndices.has(globalCellIdx(to.col, to.row, grid.cols))) return false;
            return grid.canStep(from.col, from.row, to.col, to.row, navTopology);
        },
    });
    const gridSearch = new FlatGridSearch({ grid: gridView, searchState });
    return {
        globalLayout,
        patchLayout,
        gridCols: grid.cols,
        setReservedGlobalIndices(indices) {
            reservedGlobalIndices = indices;
        },
        findQuery(query, maxPathLen = 512) {
            if (!layoutContainsAbsCell(patchLayout, query.start.col, query.start.row)) return null;
            if (!layoutContainsAbsCell(patchLayout, query.target.col, query.target.row)) return null;
            const start = layoutAbsToLocalCell(patchLayout, query.start.col, query.start.row);
            const goal = layoutAbsToLocalCell(patchLayout, query.target.col, query.target.row);
            const si = layoutLocalCellIndex(patchLayout, start.col, start.row);
            const gi = layoutLocalCellIndex(patchLayout, goal.col, goal.row);
            if (!walkable[si] || !walkable[gi]) return null;
            if (reservedGlobalIndices.has(globalCellIdx(query.start.col, query.start.row, grid.cols)) || reservedGlobalIndices.has(globalCellIdx(query.target.col, query.target.row, grid.cols)))
                return null;
            const flat = gridSearch.cardinal(new GridPathQuery(start, goal), maxPathLen);
            if (!flat) return null;
            const path = new Array(flat.length);
            for (let i = 0; i < flat.length; i++) {
                const abs = layoutLocalToAbsCell(patchLayout, flat[i].col, flat[i].row);
                path[i] = { c: abs.col, r: abs.row };
            }
            return path;
        },
        findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
            return this.findQuery(GridPathQuery.fromCells(startCol, startRow, goalCol, goalRow), maxPathLen);
        },
    };
}
export function findRailMazeNavCorridorPath(pathfinder, start, end, occupiedGlobalIndices, corridorWidth = 1, maxPathLen = 512) {
    pathfinder.setReservedGlobalIndices(occupiedGlobalIndices);
    const path = pathfinder.findQuery(new GridPathQuery(start, end), maxPathLen);
    if (!path || path.length < 2) return null;
    if (corridorPathHitsOccupied(path, occupiedGlobalIndices, corridorWidth, pathfinder.globalLayout, FULL_FOOTPRINT)) return null;
    return path;
}
