import { CARDINAL_OFFSETS, cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { portalCrossingVectorForEdge, portalTraverseExitCell, portalTraverseExitVector } from "../Spatial/grid/portalAccess.js";
import { gridWallEdgeEndpoints } from "../World/wallGridCells.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
/**
 * @typedef {{
 *   mouthCol: number,
 *   mouthRow: number,
 *   exitCol: number,
 *   exitRow: number,
 *   cost: number,
 *   ownerCol: number,
 *   ownerRow: number,
 *   ownerSide: number,
 *   partnerCol: number,
 *   partnerRow: number,
 *   partnerSide: number,
 * }} BoundaryNavHop
 */
const DRAW_P1 = { x: 0, y: 0 };
const DRAW_P2 = { x: 0, y: 0 };
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
            list.push({
                mouthCol: fromCol,
                mouthRow: fromRow,
                exitCol: exit.col,
                exitRow: exit.row,
                cost: 1,
                ownerCol: entry.source.col,
                ownerRow: entry.source.row,
                ownerSide: entry.source.side,
                partnerCol: entry.partner.col,
                partnerRow: entry.partner.row,
                partnerSide: entry.partner.side,
            });
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
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {BoundaryNavHop} hop
 */
export function boundaryHopDrawGeometry(grid, hop) {
    gridWallEdgeEndpoints(grid, hop.ownerCol, hop.ownerRow, hop.ownerSide, DRAW_P1, DRAW_P2, 0);
    const entryMid = { x: (DRAW_P1.x + DRAW_P2.x) * 0.5, y: (DRAW_P1.y + DRAW_P2.y) * 0.5 };
    const edge = grid.edgeStore.get(hop.ownerCol, hop.ownerRow, hop.ownerSide, grid.cols);
    const entryCross = portalCrossingVectorForEdge(edge, hop.ownerCol, hop.ownerRow, hop.ownerSide);
    gridWallEdgeEndpoints(grid, hop.partnerCol, hop.partnerRow, hop.partnerSide, DRAW_P1, DRAW_P2, 0);
    const exitMid = { x: (DRAW_P1.x + DRAW_P2.x) * 0.5, y: (DRAW_P1.y + DRAW_P2.y) * 0.5 };
    const exitVector = portalTraverseExitVector(grid, hop.partnerCol, hop.partnerRow, hop.partnerSide);
    return { entryMid, entryCross, exitMid, exitVector };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ x: number, y: number }} fromWorld
 * @param {{ x: number, y: number }} toWorld
 */
export function boundaryHopDrawGeometryBetweenWorldPoints(grid, fromWorld, toWorld) {
    const c1 = grid.worldToGrid(fromWorld.x, fromWorld.y);
    const c2 = grid.worldToGrid(toWorld.x, toWorld.y);
    if (!cellInRect(c1.col, c1.row, grid.cols, grid.rows) || !cellInRect(c2.col, c2.row, grid.cols, grid.rows)) return null;
    if (Math.max(Math.abs(c1.col - c2.col), Math.abs(c1.row - c2.row)) <= 1) return null;
    const hops = grid.getBoundaryHops(c1.col, c1.row);
    if (!hops) return null;
    for (let i = 0; i < hops.length; i++) {
        const hop = hops[i];
        const distToExit = Math.max(Math.abs(hop.exitCol - c2.col), Math.abs(hop.exitRow - c2.row));
        if (distToExit <= 1) return boundaryHopDrawGeometry(grid, hop);
    }
    return null;
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
