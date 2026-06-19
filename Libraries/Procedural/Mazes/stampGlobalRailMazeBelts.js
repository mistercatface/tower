import { stampBakedFloorBeltsQuiet } from "../../RoomGraph/roomGraphFloorBelts.js";
import { floorBeltFacingFromIndex } from "../../Spatial/grid/FloorCell.js";

/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../../RoomGraph/roomGraphFloorBelts.js").BakedFloorBelt[]} floorBelts */
export function stampFloorBeltsOnGrid(grid, floorBelts) {
    /** @type {import("../../RoomGraph/roomGraphFloorBelts.js").BakedFloorBelt[]} */
    const stamped = [];
    for (let i = 0; i < floorBelts.length; i++) {
        const belt = floorBelts[i];
        if (!grid.writeFloorCell(belt.col, belt.row, belt.kind, floorBeltFacingFromIndex(belt.facingIndex))) continue;
        stamped.push(belt);
    }
    return stamped;
}

/** @param {object} state @param {import("../../RoomGraph/roomGraphFloorBelts.js").BakedFloorBelt[]} floorBelts */
export function stampGlobalRailMazeBelts(state, floorBelts) {
    return stampBakedFloorBeltsQuiet(state, floorBelts);
}
