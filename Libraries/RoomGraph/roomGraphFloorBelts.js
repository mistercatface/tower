import { markGridZoneSubscriptionsDirty } from "../Sandbox/gridZoneTick.js";
import { floorBeltFacingFromIndex } from "../Spatial/grid/FloorCell.js";

/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */

/** @param {CellBounds | null} a @param {CellBounds | null} b @returns {CellBounds | null} */
function unionCellBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { startCol: Math.min(a.startCol, b.startCol), endCol: Math.max(a.endCol, b.endCol), startRow: Math.min(a.startRow, b.startRow), endRow: Math.max(a.endRow, b.endRow) };
}

/** @param {object} state @param {BakedFloorBelt[]} belts @returns {CellBounds | null} */
export function clearBakedFloorBeltsQuiet(state, belts) {
    if (!belts.length) return null;
    const grid = state.obstacleGrid;
    let bounds = null;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!grid.clearFloorCell(belt.col, belt.row)) continue;
        bounds = unionCellBounds(bounds, { startCol: belt.col, endCol: belt.col, startRow: belt.row, endRow: belt.row });
    }
    if (bounds) markGridZoneSubscriptionsDirty(state);
    return bounds;
}

/** @param {object} state @param {BakedFloorBelt[]} belts @returns {{ bounds: CellBounds | null, stamped: BakedFloorBelt[] }} */
export function stampBakedFloorBeltsQuiet(state, belts) {
    const grid = state.obstacleGrid;
    /** @type {BakedFloorBelt[]} */
    const stamped = [];
    let bounds = null;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!grid.writeFloorCell(belt.col, belt.row, belt.kind, floorBeltFacingFromIndex(belt.facingIndex))) continue;
        stamped.push(belt);
        bounds = unionCellBounds(bounds, { startCol: belt.col, endCol: belt.col, startRow: belt.row, endRow: belt.row });
    }
    if (stamped.length) markGridZoneSubscriptionsDirty(state);
    return { bounds, stamped };
}
