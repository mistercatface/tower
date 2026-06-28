import { emptyCellBounds, growCellBoundsIdx } from "../DataStructures/CellRect.js";
import { markGridZoneSubscriptionsDirty } from "../Sandbox/gridZoneTick.js";
import { floorBeltFacingFromIndex } from "../Spatial/grid/FloorCell.js";
import { writeNavFloorCell, clearNavFloorCell } from "../Spatial/grid/navGridMutations.js";
/** @typedef {{ idx: number, kind: number, facingIndex: number }} BakedFloorBelt */
export function clearBakedFloorBeltsQuiet(state, belts) {
    if (!belts.length) return null;
    const grid = state.obstacleGrid;
    const bounds = emptyCellBounds();
    let changed = false;
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!clearNavFloorCell(grid, belt.idx)) continue;
        changed = true;
        growCellBoundsIdx(bounds, belt.idx, grid.cols);
    }
    if (changed) {
        markGridZoneSubscriptionsDirty(state);
        return bounds;
    }
    return null;
}
export function stampBakedFloorBeltsQuiet(state, belts) {
    const grid = state.obstacleGrid;
    /** @type {BakedFloorBelt[]} */
    const stamped = [];
    const bounds = emptyCellBounds();
    for (let i = 0; i < belts.length; i++) {
        const belt = belts[i];
        if (!writeNavFloorCell(grid, belt.idx, belt.kind, floorBeltFacingFromIndex(belt.facingIndex))) continue;
        stamped.push(belt);
        growCellBoundsIdx(bounds, belt.idx, grid.cols);
    }
    if (stamped.length) {
        markGridZoneSubscriptionsDirty(state);
        return { bounds, stamped };
    }
    return { bounds: null, stamped };
}
