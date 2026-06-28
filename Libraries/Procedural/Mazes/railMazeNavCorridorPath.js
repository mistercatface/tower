import { FlatGridSearch } from "../../Pathfinding/AStar.js";
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
    layoutIndexToGlobalIndex,
    layoutLocalCellIndex,
    layoutLocalToAbsCell,
} from "../../Spatial/grid/GridUtils.js";
import { readNavWalkableFlag } from "./navWalkableIndex.js";
const FULL_FOOTPRINT = { interiorOnly: false };
let pathScratch = new Int32Array(512);
export function railMazeBeltZoneGridBounds(grid, railConfig) {
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const baseCol = grid.worldCol(originCol * cellSize);
    const baseRow = grid.worldRow(originRow * cellSize);
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
        canStep(idx0, idx1) {
            if (!walkable[idx1]) return false;
            const toIdx = layoutIndexToGlobalIndex(idx1, patchLayout, grid.cols);
            if (reservedGlobalIndices.has(toIdx)) return false;
            const fromIdx = layoutIndexToGlobalIndex(idx0, patchLayout, grid.cols);
            return grid.canStepIdx(fromIdx, toIdx, navTopology);
        },
    });
    const gridSearch = new FlatGridSearch(searchState);
    gridSearch.grid = gridView;
    gridSearch.gridIdx = gridView.gridIdx;
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
            if (pathScratch.length < maxPathLen) pathScratch = new Int32Array(maxPathLen);
            const cols = patchCols;
            const startIdx = start.col + start.row * cols;
            const goalIdx = goal.col + goal.row * cols;
            const len = gridSearch.cardinal(startIdx, goalIdx, maxPathLen, pathScratch);
            if (len === 0) return null;
            const path = new Array(len);
            for (let i = 0; i < len; i++) {
                const idx = pathScratch[i];
                const col = idx % cols;
                const row = (idx / cols) | 0;
                const abs = layoutLocalToAbsCell(patchLayout, col, row);
                path[i] = { c: abs.col, r: abs.row };
            }
            return path;
        },
        findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
            return this.findQuery({ start: { col: startCol, row: startRow }, target: { col: goalCol, row: goalRow } }, maxPathLen);
        },
    };
}
export function findRailMazeNavCorridorPath(pathfinder, start, end, occupiedGlobalIndices, corridorWidth = 1, maxPathLen = 512) {
    pathfinder.setReservedGlobalIndices(occupiedGlobalIndices);
    const path = pathfinder.findQuery({ start, target: end }, maxPathLen);
    if (!path || path.length < 2) return null;
    if (corridorPathHitsOccupied(path, occupiedGlobalIndices, corridorWidth, pathfinder.globalLayout, FULL_FOOTPRINT)) return null;
    return path;
}
