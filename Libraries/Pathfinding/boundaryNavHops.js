import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { portalCrossingVectorForEdge, portalMouthAndBackCells, portalTraverseExitCell, portalTraverseExitVector } from "../Spatial/grid/portalAccess.js";
import { forEachCellEdge, cellEdgeEndpoints } from "../Spatial/grid/gridCellTopology.js";
import { resolvePortalPartner } from "../Sandbox/portalLinks.js";
import { snapshotCanBoundaryHop } from "./GridNavSnapshot.js";
/** @typedef {{
 *   mouthCol: number,
 *   mouthRow: number,
 *   exitCol: number,
 *   exitRow: number,
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
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function resolvePortalHopDrawGeometry(grid, fromCol, fromRow, toCol, toRow) {
    let match = null;
    forEachCellEdge(
        grid,
        (ownerCol, ownerRow, ownerSide, edge) => {
            const { mouth } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
            if (mouth.col !== fromCol || mouth.row !== fromRow) return;
            const partner = resolvePortalPartner(grid, ownerCol, ownerRow, ownerSide);
            if (!partner) return;
            const exit = portalTraverseExitCell(grid, partner.col, partner.row, partner.side);
            if (exit.col !== toCol || exit.row !== toRow) return;
            match = { ownerCol, ownerRow, ownerSide, partnerCol: partner.col, partnerRow: partner.row, partnerSide: partner.side };
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    if (!match) return null;
    return boundaryHopDrawGeometry(grid, match);
}
/** @param {{ col: number, row: number }} prev @param {{ col: number, row: number }} curr @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
function boundaryHopOnCellStep(prev, curr, grid) {
    const snap = grid.gridNavSnapshot;
    if (!snap || !snapshotCanBoundaryHop(snap, prev.col, prev.row, curr.col, curr.row)) return null;
    return { mouthCol: prev.col, mouthRow: prev.row, exitCol: curr.col, exitRow: curr.row };
}
/** @param {{ col: number, row: number }} prev @param {{ col: number, row: number }} curr @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function boundaryHopOnSabCellStep(prev, curr, grid) {
    return boundaryHopOnCellStep(prev, curr, grid);
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
    const snap = grid.gridNavSnapshot;
    if (!snap || !snapshotCanBoundaryHop(snap, c1.col, c1.row, c2.col, c2.row)) return null;
    return resolvePortalHopDrawGeometry(grid, c1.col, c1.row, c2.col, c2.row);
}
/** @param {(i: number) => { col: number, row: number }} readCell @param {number} len @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function boundaryHopMouthOnSabPath(readCell, len, grid) {
    if (len <= 1) return null;
    for (let i = 1; i < len; i++) {
        const hop = boundaryHopOnCellStep(readCell(i - 1), readCell(i), grid);
        if (hop) return { col: hop.mouthCol, row: hop.mouthRow };
    }
    return null;
}
