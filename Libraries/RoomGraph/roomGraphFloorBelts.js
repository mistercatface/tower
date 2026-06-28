import { cellBoundsAtIdx, unionCellBounds } from "../DataStructures/CellRect.js";
import { markGridZoneSubscriptionsDirty } from "../Sandbox/gridZoneTick.js";
import { floorBeltFacingFromIndex } from "../Spatial/grid/FloorCell.js";
import { writeNavFloorCell, clearNavFloorCell } from "../Spatial/grid/navGridMutations.js";
/** @typedef {{ idx: number, kind: number, facingIndex: number }} BakedFloorBelt */
export function clearBakedFloorBeltsQuiet(state, belts) {
    if (!belts.length) return null;
    const grid = state.obstacleGrid;
    let bounds = null;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!clearNavFloorCell(grid, belt.idx)) continue;
        bounds = unionCellBounds(bounds, cellBoundsAtIdx(belt.idx, grid.cols));
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
        if (!writeNavFloorCell(grid, belt.idx, belt.kind, floorBeltFacingFromIndex(belt.facingIndex))) continue;
        stamped.push(belt);
        bounds = unionCellBounds(bounds, cellBoundsAtIdx(belt.idx, grid.cols));
    }
    if (stamped.length) markGridZoneSubscriptionsDirty(state);
    return { bounds, stamped };
}
