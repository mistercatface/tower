import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { portalCrossingVectorForEdge, portalMouthAndBackCells, portalTraverseExitCell, portalTraverseExitVector } from "../Spatial/grid/portalAccess.js";
import { forEachCellEdge, cellEdgeEndpoints } from "../Spatial/grid/gridCellTopology.js";
/** @typedef {{
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
 * }} BoundaryNavHop */
/** @typedef {{ source: { col: number, row: number, side: number }, partner: { col: number, row: number, side: number } }} PortalHopEntry */
const DRAW_P1 = { x: 0, y: 0 };
const DRAW_P2 = { x: 0, y: 0 };
export function buildBoundaryNavHops(grid, resolvePortalHopEntry) {
    const hopsByFromIdx = new Map();
    if (!grid.cols || !grid.edgeStore.portalEdgeCount) return hopsByFromIdx;
    forEachCellEdge(
        grid,
        (ownerCol, ownerRow, ownerSide, edge) => {
            const { mouth, back } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
            if (grid.grid[colRowToIndex(mouth.col, mouth.row, grid.cols)] !== 0) return;
            const entry = resolvePortalHopEntry(grid, mouth.col, mouth.row, back.col, back.row);
            if (!entry) return;
            const exit = portalTraverseExitCell(grid, entry.partner.col, entry.partner.row, entry.partner.side);
            if (!cellInRect(exit.col, exit.row, grid.cols, grid.rows) || grid.grid[colRowToIndex(exit.col, exit.row, grid.cols)] !== 0) return;
            const idx = colRowToIndex(mouth.col, mouth.row, grid.cols);
            let list = hopsByFromIdx.get(idx);
            if (!list) {
                list = [];
                hopsByFromIdx.set(idx, list);
            }
            if (list.some((hop) => hop.exitCol === exit.col && hop.exitRow === exit.row)) return;
            list.push({
                mouthCol: mouth.col,
                mouthRow: mouth.row,
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
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    return hopsByFromIdx;
}
function boundaryHopOnCellStep(prev, curr, navGraph) {
    if (!navGraph.canBoundaryHop(prev.col, prev.row, curr.col, curr.row)) return null;
    const hops = navGraph.getBoundaryHops(prev.col, prev.row);
    return hops?.find((entry) => entry.exitCol === curr.col && entry.exitRow === curr.row) ?? null;
}
export function boundaryHopDrawGeometry(grid, hop) {
    cellEdgeEndpoints(grid, hop.ownerCol, hop.ownerRow, hop.ownerSide, DRAW_P1, DRAW_P2, 0);
    const entryMid = { x: (DRAW_P1.x + DRAW_P2.x) * 0.5, y: (DRAW_P1.y + DRAW_P2.y) * 0.5 };
    const edge = grid.edgeStore.get(hop.ownerCol, hop.ownerRow, hop.ownerSide, grid.cols);
    const entryCross = portalCrossingVectorForEdge(edge, hop.ownerCol, hop.ownerRow, hop.ownerSide);
    cellEdgeEndpoints(grid, hop.partnerCol, hop.partnerRow, hop.partnerSide, DRAW_P1, DRAW_P2, 0);
    const exitMid = { x: (DRAW_P1.x + DRAW_P2.x) * 0.5, y: (DRAW_P1.y + DRAW_P2.y) * 0.5 };
    const exitVector = portalTraverseExitVector(grid, hop.partnerCol, hop.partnerRow, hop.partnerSide);
    return { entryMid, entryCross, exitMid, exitVector };
}
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
// Boundary hops jump entry → exit in one graph step; insert mouth waypoints and omit the graph exit.
export function expandBoundaryHopsInCellPath(cells, navGraph) {
    if (!cells.length || !navGraph.canBoundaryHop || !navGraph.getBoundaryHops) return cells;
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
export function boundaryHopMouthOnCellPath(cells, navGraph) {
    if (!cells.length || !navGraph.canBoundaryHop) return null;
    for (let i = 1; i < cells.length; i++) {
        const hop = boundaryHopOnCellStep(cells[i - 1], cells[i], navGraph);
        if (hop) return { col: hop.mouthCol, row: hop.mouthRow };
    }
    return null;
}
/** @param {(i: number) => { col: number, row: number }} readCell @param {number} len */
export function boundaryHopMouthOnSabPath(readCell, len, navGraph) {
    if (len <= 1 || !navGraph.canBoundaryHop) return null;
    for (let i = 1; i < len; i++) {
        const hop = boundaryHopOnCellStep(readCell(i - 1), readCell(i), navGraph);
        if (hop) return { col: hop.mouthCol, row: hop.mouthRow };
    }
    return null;
}
export function boundaryHopWaypointIndex(rawCellPath, worldPath, grid) {
    const mouth = boundaryHopMouthOnCellPath(rawCellPath, grid);
    if (!mouth || !worldPath.length) return null;
    for (let i = 0; i < worldPath.length; i++) {
        const cell = grid.worldToGrid(worldPath[i].x, worldPath[i].y);
        if (cell.col === mouth.col && cell.row === mouth.row) return i;
    }
    return null;
}
