import { cellBoundsAt, unionCellBounds } from "../DataStructures/CellRect.js";
import { markGridZoneSubscriptionsDirty } from "../Sandbox/gridZoneTick.js";
import { floorBeltFacingFromIndex } from "../Spatial/grid/FloorCell.js";
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
export function clearBakedFloorBeltsQuiet(state, belts) {
    if (!belts.length) return null;
    const grid = state.obstacleGrid;
    let bounds = null;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!grid.clearFloorCell(belt.col, belt.row)) continue;
        bounds = unionCellBounds(bounds, cellBoundsAt(belt.col, belt.row));
    }
    if (bounds) markGridZoneSubscriptionsDirty(state);
    return bounds;
}
export function stampBakedFloorBeltsQuiet(state, belts) {
    const grid = state.obstacleGrid;
    /** @type {BakedFloorBelt[]} */
    const stamped = [];
    let bounds = null;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!grid.writeFloorCell(belt.col, belt.row, belt.kind, floorBeltFacingFromIndex(belt.facingIndex))) continue;
        stamped.push(belt);
        bounds = unionCellBounds(bounds, cellBoundsAt(belt.col, belt.row));
    }
    if (stamped.length) markGridZoneSubscriptionsDirty(state);
    return { bounds, stamped };
}
