import { runCardinalAStarFlat } from "../../Pathfinding/AStar.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
import { corridorPathHitsOccupied } from "../../Pathfinding/Corridor/corridorFootprint.js";
import { getMapGenBoundsStampExtent } from "../../Sandbox/mapGenBounds.js";
const FULL_FOOTPRINT = { interiorOnly: false };
function cellKey(col, row) {
    return `${col},${row}`;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {object} railConfig */
export function railMazeBeltZoneGridBounds(grid, railConfig) {
    const cellSize = grid.cellSize;
    const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(railConfig);
    const { col: baseCol, row: baseRow } = grid.worldToGrid(originCol * cellSize, originRow * cellSize);
    return { startCol: Math.max(0, baseCol), endCol: Math.min(grid.cols - 1, baseCol + cols - 1), startRow: Math.max(0, baseRow), endRow: Math.min(grid.rows - 1, baseRow + rows - 1) };
}
/**
 * Cardinal A* over nav-walkable cells in the rail zone, respecting rail walls via `grid.canStep`.
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} gridNavContext
 * @param {object} railConfig
 * @param {Set<string>} walkableKeys
 */
export function createRailMazeNavCorridorPathfinder(grid, gridNavContext, railConfig, walkableKeys) {
    const bounds = railMazeBeltZoneGridBounds(grid, railConfig);
    const cols = bounds.endCol - bounds.startCol + 1;
    const rows = bounds.endRow - bounds.startRow + 1;
    const originCol = bounds.startCol;
    const originRow = bounds.startRow;
    const size = cols * rows;
    const walkable = new Uint8Array(size);
    for (let r = bounds.startRow; r <= bounds.endRow; r++)
        for (let c = bounds.startCol; c <= bounds.endCol; c++) if (walkableKeys.has(cellKey(c, r))) walkable[(r - originRow) * cols + (c - originCol)] = 1;
    const searchState = new SearchState(size);
    /** @type {Set<string>} */
    let reservedKeys = new Set();
    const navGraph = {
        cols,
        rows,
        canStep(c0, r0, c1, r1) {
            const ni = r1 * cols + c1;
            if (!walkable[ni]) return false;
            const gc0 = c0 + originCol;
            const gr0 = r0 + originRow;
            const gc1 = c1 + originCol;
            const gr1 = r1 + originRow;
            if (reservedKeys.has(cellKey(gc1, gr1))) return false;
            return grid.canStep(gc0, gr0, gc1, gr1, gridNavContext);
        },
    };
    return {
        /** @param {Set<string>} keys */
        setReservedKeys(keys) {
            reservedKeys = keys;
        },
        /** @param {number} startCol @param {number} startRow @param {number} goalCol @param {number} goalRow @param {number} [maxPathLen] */
        findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
            const sc = startCol - originCol;
            const sr = startRow - originRow;
            const gc = goalCol - originCol;
            const gr = goalRow - originRow;
            if (sc < 0 || sr < 0 || sc >= cols || sr >= rows) return null;
            if (gc < 0 || gr < 0 || gc >= cols || gr >= rows) return null;
            const si = sr * cols + sc;
            const gi = gr * cols + gc;
            if (!walkable[si] || !walkable[gi]) return null;
            if (reservedKeys.has(cellKey(startCol, startRow)) || reservedKeys.has(cellKey(goalCol, goalRow))) return null;
            const flat = runCardinalAStarFlat(sc, sr, gc, gr, navGraph, cols, rows, maxPathLen, searchState.prepare());
            if (!flat) return null;
            /** @type {{ c: number, r: number }[]} */
            const path = new Array(flat.length);
            for (let i = 0; i < flat.length; i++) path[i] = { c: flat[i].col + originCol, r: flat[i].row + originRow };
            return path;
        },
    };
}
/**
 * @param {ReturnType<typeof createRailMazeNavCorridorPathfinder>} pathfinder
 * @param {{ col: number, row: number }} start
 * @param {{ col: number, row: number }} end
 * @param {Set<string>} occupied
 * @param {number} [corridorWidth]
 * @param {number} [maxPathLen]
 */
export function findRailMazeNavCorridorPath(pathfinder, start, end, occupied, corridorWidth = 1, maxPathLen = 512) {
    pathfinder.setReservedKeys(occupied);
    const path = pathfinder.findPath(start.col, start.row, end.col, end.row, maxPathLen);
    if (!path || path.length < 2) return null;
    if (corridorPathHitsOccupied(path, occupied, corridorWidth, FULL_FOOTPRINT)) return null;
    return path;
}
