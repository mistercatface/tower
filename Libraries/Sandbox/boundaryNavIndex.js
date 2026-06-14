import { CARDINAL_OFFSETS, cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { portalTraverseExitCell } from "../Spatial/grid/portalAccess.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
/** @typedef {{ mouthCol: number, mouthRow: number, exitCol: number, exitRow: number, cost: number }} BoundaryNavHop */
/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {Map<number, BoundaryNavHop[]>}
 */
export function buildBoundaryNavHops(state, grid) {
    /** @type {Map<number, BoundaryNavHop[]>} */
    const hopsByFromIdx = new Map();
    if (!grid.cols) return hopsByFromIdx;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (grid.grid[idx] !== 0) continue;
        const fromCol = idx % grid.cols;
        const fromRow = (idx / grid.cols) | 0;
        for (let d = 0; d < CARDINAL_OFFSETS.length; d++) {
            const { dc, dr } = CARDINAL_OFFSETS[d];
            const toCol = fromCol + dc;
            const toRow = fromRow + dr;
            if (!cellInRect(toCol, toRow, grid.cols, grid.rows)) continue;
            const entry = evaluatePortalStepEntry(state, grid, fromCol, fromRow, toCol, toRow);
            if (!entry) continue;
            const exit = portalTraverseExitCell(grid, entry.partner.col, entry.partner.row, entry.partner.side);
            if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.grid[colRowToIndex(exit.col, exit.row, grid.cols)] !== 0) continue;
            let list = hopsByFromIdx.get(idx);
            if (!list) {
                list = [];
                hopsByFromIdx.set(idx, list);
            }
            if (list.some((hop) => hop.exitCol === exit.col && hop.exitRow === exit.row)) continue;
            list.push({ mouthCol: fromCol, mouthRow: fromRow, exitCol: exit.col, exitRow: exit.row, cost: 1 });
        }
    }
    return hopsByFromIdx;
}
/** @param {object} state */
export function syncBoundaryNavIndex(state) {
    const grid = state.obstacleGrid;
    grid.boundaryNavHops = buildBoundaryNavHops(state, grid);
    state.hierarchicalNavigator?.connectBoundaryHopRegionPairs?.();
}
/** @typedef {import("../Pathfinding/NavGraph.js").BoundaryHopNavGraph} BoundaryHopNavGraph */
/**
 * @param {{ col: number, row: number }} prev
 * @param {{ col: number, row: number }} curr
 * @param {BoundaryHopNavGraph} navGraph
 * @returns {BoundaryNavHop | null}
 */
function boundaryHopOnCellStep(prev, curr, navGraph) {
    if (!navGraph.canBoundaryHop(prev.col, prev.row, curr.col, curr.row)) return null;
    const hops = navGraph.getBoundaryHops(prev.col, prev.row);
    return hops?.find((entry) => entry.exitCol === curr.col && entry.exitRow === curr.row) ?? null;
}
/**
 * Boundary hops jump entry → exit in one graph step. Movement must step onto the mouth cell first
 * so physics traverse fires; insert mouth waypoints and omit the graph exit (replan after traverse).
 *
 * @param {{ col: number, row: number }[]} cells
 * @param {BoundaryHopNavGraph} navGraph
 */
export function expandBoundaryHopsInCellPath(cells, navGraph) {
    if (!cells.length || !navGraph.canBoundaryHop || !navGraph.getBoundaryHops) return cells;
    /** @type {{ col: number, row: number }[]} */
    const out = [{ col: cells[0].col, row: cells[0].row }];
    for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1];
        const curr = cells[i];
        const hop = boundaryHopOnCellStep(prev, curr, navGraph);
        if (hop) {
            const last = out[out.length - 1];
            if (last.col !== hop.mouthCol || last.row !== hop.mouthRow) out.push({ col: hop.mouthCol, row: hop.mouthRow });
            return out;
        }
        out.push({ col: curr.col, row: curr.row });
    }
    return out;
}
/**
 * Mouth cell for an explicit boundary hop on a cell path (entry → exit), not incidental portal proximity.
 *
 * @param {{ col: number, row: number }[]} cells
 * @param {BoundaryHopNavGraph} navGraph
 * @returns {{ col: number, row: number } | null}
 */
export function boundaryHopMouthOnCellPath(cells, navGraph) {
    if (!cells.length || !navGraph.canBoundaryHop) return null;
    for (let i = 1; i < cells.length; i++) {
        const hop = boundaryHopOnCellStep(cells[i - 1], cells[i], navGraph);
        if (hop) return { col: hop.mouthCol, row: hop.mouthRow };
    }
    return null;
}
/**
 * Index of the hop mouth waypoint in a world path, or null when no hop / mouth trimmed away.
 *
 * @param {{ col: number, row: number }[]} rawCellPath
 * @param {{ x: number, y: number }[]} worldPath
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {number | null}
 */
export function boundaryHopWaypointIndex(rawCellPath, worldPath, grid) {
    const mouth = boundaryHopMouthOnCellPath(rawCellPath, grid);
    if (!mouth || !worldPath.length) return null;
    for (let i = 0; i < worldPath.length; i++) {
        const cell = grid.worldToGrid(worldPath[i].x, worldPath[i].y);
        if (cell.col === mouth.col && cell.row === mouth.row) return i;
    }
    return null;
}
