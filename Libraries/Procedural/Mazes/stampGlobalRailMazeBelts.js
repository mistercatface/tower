import { stampBakedFloorBeltsQuiet } from "../../RoomGraph/roomGraphFloorBelts.js";
export function stampFloorBeltsOnGrid(grid, floorBelts) {
    /** @type {import("../../RoomGraph/roomGraphFloorBelts.js").BakedFloorBelt[]} */
    const stamped = [];
    for (let i = 0; i < floorBelts.length; i++) {
        const belt = floorBelts[i];
        if (!grid.writeFloorCell(belt.idx, belt.kind, belt.facingIndex)) continue;
        stamped.push(belt);
    }
    return stamped;
}
/** @param {object} state @param {import("../../RoomGraph/roomGraphFloorBelts.js").BakedFloorBelt[]} floorBelts */
export function stampGlobalRailMazeBelts(state, floorBelts) {
    return stampBakedFloorBeltsQuiet(state, floorBelts);
}
