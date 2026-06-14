import { CARDINAL_OFFSETS, cellInRect, colRowToIndex, makeAdjacencyKey } from "../Spatial/grid/GridUtils.js";
import { portalTraverseExitCell } from "../Spatial/grid/portalAccess.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";

/** @typedef {{ exitCol: number, exitRow: number, cost: number }} PortalNavHop */

/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {Map<number, PortalNavHop[]>}
 */
export function buildPortalNavHops(state, grid) {
    /** @type {Map<number, PortalNavHop[]>} */
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
            const exit = portalTraverseExitCell(entry.partner.col, entry.partner.row, fromCol, fromRow, toCol, toRow);
            if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.grid[colRowToIndex(exit.col, exit.row, grid.cols)] !== 0) continue;
            let list = hopsByFromIdx.get(idx);
            if (!list) {
                list = [];
                hopsByFromIdx.set(idx, list);
            }
            if (list.some((hop) => hop.exitCol === exit.col && hop.exitRow === exit.row)) continue;
            list.push({ exitCol: exit.col, exitRow: exit.row, cost: 1 });
        }
    }
    return hopsByFromIdx;
}

/** @param {object} state */
export function syncPortalNavIndex(state) {
    const grid = state.obstacleGrid;
    grid.portalNavHops = buildPortalNavHops(state, grid);
    state.hierarchicalNavigator?.connectPortalRegionPairs?.();
}

/**
 * @param {Array<object | null>} cellToNode
 * @param {number} cols
 * @param {number} rows
 * @param {import("../Pathfinding/NavGraph.js").NavGraph & { getPortalHops?: (col: number, row: number) => PortalNavHop[] | null }} navGraph
 * @param {Set<string>} adjacencies
 */
export function appendPortalRegionAdjacencies(cellToNode, cols, rows, navGraph, adjacencies) {
    if (!navGraph.getPortalHops) return;
    for (let idx = 0; idx < cellToNode.length; idx++) {
        const nodeA = cellToNode[idx];
        if (!nodeA) continue;
        const fromCol = idx % cols;
        const fromRow = (idx / cols) | 0;
        const hops = navGraph.getPortalHops(fromCol, fromRow);
        if (!hops) continue;
        for (let i = 0; i < hops.length; i++) {
            const { exitCol, exitRow } = hops[i];
            const exitIdx = colRowToIndex(exitCol, exitRow, cols);
            const nodeB = cellToNode[exitIdx];
            if (nodeB && nodeA.id !== nodeB.id) adjacencies.add(makeAdjacencyKey(nodeA.id, nodeB.id));
        }
    }
}

/**
 * @param {import("../Pathfinding/NavGraph.js").NavGraph & { getPortalHops?: (col: number, row: number) => PortalNavHop[] | null }} navGraph
 * @param {number} col
 * @param {number} row
 * @param {(exitCol: number, exitRow: number, cost: number) => void} fn
 */
export function forEachPortalNavHop(navGraph, col, row, fn) {
    const hops = navGraph.getPortalHops?.(col, row);
    if (!hops) return;
    for (let i = 0; i < hops.length; i++) {
        const hop = hops[i];
        if (navGraph.isBlocked(hop.exitCol, hop.exitRow)) continue;
        fn(hop.exitCol, hop.exitRow, hop.cost);
    }
}
