import { FlatGridSearch } from "../../Pathfinding/AStar.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
import { FlatGridView } from "../../Pathfinding/FlatGridView.js";
import { corridorPathHitsOccupied } from "../../Pathfinding/Corridor/corridorFootprint.js";
import { getMapGenBoundsStampExtent } from "../../Sandbox/mapGenBounds.js";
import { colRowToIndex, gridCellLayout } from "../../Spatial/grid/GridUtils.js";
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
    const gridCols = grid.cols;
    const cellCount = gridCols * grid.rows;
    const globalLayout = gridCellLayout(grid);
    const walkable = new Uint8Array(cellCount);
    for (let r = bounds.startRow; r <= bounds.endRow; r++) {
        const rowOffset = r * navWalkableIndex.cols;
        const globalRowOffset = r * gridCols;
        for (let c = bounds.startCol; c <= bounds.endCol; c++) {
            if (navWalkableIndex.flags[rowOffset + c] === 0) continue;
            walkable[globalRowOffset + c] = 1;
        }
    }
    const searchState = new SearchState(cellCount);
    let reservedGlobalIndices = new Set();
    const gridView = new FlatGridView(gridCols, grid.rows, {
        blocked: null,
        canStep(idx0, idx1) {
            return walkable[idx1] && !reservedGlobalIndices.has(idx1) && grid.canStep(idx0, idx1, navTopology);
        },
    });
    const gridSearch = new FlatGridSearch(searchState);
    gridSearch.grid = gridView;
    gridSearch.gridIdx = gridView.gridIdx;
    return {
        globalLayout,
        gridCols,
        setReservedGlobalIndices(indices) {
            reservedGlobalIndices = indices;
        },
        findQuery(startIdx, goalIdx, maxPathLen = 512) {
            if (!walkable[startIdx] || !walkable[goalIdx]) return null;
            if (reservedGlobalIndices.has(startIdx) || reservedGlobalIndices.has(goalIdx)) return null;
            if (pathScratch.length < maxPathLen) pathScratch = new Int32Array(maxPathLen);
            const len = gridSearch.cardinal(startIdx, goalIdx, maxPathLen, pathScratch);
            if (len === 0) return null;
            return pathScratch.slice(0, len);
        },
        findPath(startIdx, goalIdx, maxPathLen = 512) {
            return this.findQuery(startIdx, goalIdx, maxPathLen);
        },
    };
}
export function findRailMazeNavCorridorPath(pathfinder, startIdx, endIdx, occupiedGlobalIndices, corridorWidth = 1, maxPathLen = 512) {
    pathfinder.setReservedGlobalIndices(occupiedGlobalIndices);
    const path = pathfinder.findQuery(startIdx, endIdx, maxPathLen);
    if (!path || path.length < 2) return null;
    if (corridorPathHitsOccupied(path, occupiedGlobalIndices, corridorWidth, pathfinder.globalLayout, FULL_FOOTPRINT)) return null;
    return path;
}
